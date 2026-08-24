const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
require("dotenv").config({path:resolve(__dirname,"../../../.env"),quiet:true});
const { DatabaseService } = require("../dist/database.service");
const { hashValue } = require("../dist/decision-engine");
const { persistEvidenceClassification } = require("../dist/evidence-classification");
const { buildGovernanceOutcomeFact, validateGovernanceOutcomeCandidate } = require("../dist/live-governance-outcome-evidence");

const ROOT=resolve(__dirname,"../../..");
const CANDIDATE_PATH=resolve(ROOT,"reports/live-demo/p0-1-governance-hold-attempt-3-outcome-evidence-candidate.json");
const FINALITY_PATH=resolve(ROOT,"reports/live-demo/p0-1-governance-hold-attempt-3-execute-finality.json");
const OUTPUT_PATH=resolve(ROOT,"reports/live-demo/p0-1-governance-hold-attempt-3-outcome-evidence-import.json");
const expectedTransactionHash="0xeecd79baabd81d23000ef36791384c1919615d8c4a609fc8215819c970c01160";
const read=(path)=>JSON.parse(readFileSync(path,"utf8"));
const stableId=(prefix,hash)=>`${prefix}_${hash.slice(2,34)}`;

function assertFinality(candidate,finality){
  if(finality.status!=="HOLD_EXECUTED"||finality.transaction?.hash!==expectedTransactionHash||candidate.source.transactionHash!==expectedTransactionHash||finality.governance?.state!=="Executed"||finality.timelock?.done!==true||finality.treasuryGuard?.paused!==true||finality.policyRegistry?.mutationPerformed!==false||finality.outcome?.treasuryAssetMovement!==false||finality.controls?.assetExecutionAuthorized!==false)throw new Error("OUTCOME_FINALITY_NOT_ACCEPTABLE");
}

async function assertImmutable(db,org,table,id){
  return db.runWithTenant(org,"outcome-auditor","AUDITOR",()=>db.transaction(async c=>{
    await c.query("SAVEPOINT immutability_probe");
    try{await c.query(`UPDATE ${table} SET created_at=created_at WHERE id=$1`,[id]);return false}
    catch{await c.query("ROLLBACK TO SAVEPOINT immutability_probe");return true}
  }));
}

async function assertUnlinkedUpdatesRemainSupported(db,org){
  return db.runAsSystem(()=>db.transaction(async c=>{
    const suffix=candidateSafeSuffix(Date.now()),rawId=`raw_guardprobe_${suffix}`,evidenceId=`ev_guardprobe_${suffix}`;
    await c.query("SAVEPOINT unlinked_mutation_probe");
    try{
      await c.query("INSERT INTO raw_attestations(id,organization_id,provider,chain_id,payload,content_hash) VALUES($1,$2,'guard-probe',1,'{}',$3)",[rawId,org,`probe_raw_${suffix}`]);
      await c.query("INSERT INTO evidence(id,organization_id,raw_attestation_id,subject,predicate,value,chain,source,verification_status,freshness_status,freshness_expires_at,quality_score,quality_components,observed_at,content_hash) VALUES($1,$2,$3,'{}','guard.probe','{}','{}','{}','VERIFIED','ARCHIVED',now(),0,'{}',now(),$4)",[evidenceId,org,rawId,`probe_evidence_${suffix}`]);
      const raw=await c.query("UPDATE raw_attestations SET verification_error='PROBE' WHERE id=$1 RETURNING verification_error",[rawId]);
      const evidence=await c.query("UPDATE evidence SET conflict_group_id='probe' WHERE id=$1 RETURNING conflict_group_id",[evidenceId]);
      return raw.rows[0]?.verification_error==="PROBE"&&evidence.rows[0]?.conflict_group_id==="probe";
    }finally{await c.query("ROLLBACK TO SAVEPOINT unlinked_mutation_probe")}
  }));
}

const candidateSafeSuffix=(value)=>Number(value).toString(36);

async function main(){
  if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL_REQUIRED");
  const candidate=read(CANDIDATE_PATH),finality=read(FINALITY_PATH);assertFinality(candidate,finality);
  const db=new DatabaseService();await db.onModuleInit();
  try{
    const lineage=await db.runAsSystem(async()=>{
      const result=await db.query("SELECT d.id,d.organization_id,d.output_hash,d.evidence_snapshot_id,s.manifest_hash,s.evidence_ids FROM decisions d JOIN evidence_snapshots s ON s.id=d.evidence_snapshot_id AND s.organization_id=d.organization_id WHERE d.id=$1",[candidate.lineage.decisionId]);
      if(result.rowCount!==1)throw new Error("OUTCOME_DECISION_NOT_FOUND");
      const row=result.rows[0];return{organizationId:row.organization_id,decision:{id:row.id,outputHash:row.output_hash,evidenceSnapshotId:row.evidence_snapshot_id},snapshot:{id:row.evidence_snapshot_id,manifestHash:row.manifest_hash,evidenceIds:row.evidence_ids}};
    });
    validateGovernanceOutcomeCandidate(candidate,lineage);
    const imported=await db.runAsSystem(()=>db.transaction(async c=>{
      const org=lineage.organizationId,rawId=stableId("raw_govout",candidate.contentHash);
      const raw=await c.query("INSERT INTO raw_attestations(id,organization_id,provider,chain_id,payload,content_hash) VALUES($1,$2,'creditcoin-governance-finality-v1',$3,$4,$5) ON CONFLICT(organization_id,content_hash) DO NOTHING RETURNING id",[rawId,org,candidate.source.chainId,candidate,candidate.contentHash]);
      const resolvedRawId=raw.rowCount?raw.rows[0].id:(await c.query("SELECT id FROM raw_attestations WHERE organization_id=$1 AND content_hash=$2",[org,candidate.contentHash])).rows[0]?.id;
      if(!resolvedRawId)throw new Error("OUTCOME_RAW_NOT_PERSISTED");
      const {fact,contentHash:factHash}=buildGovernanceOutcomeFact(candidate,resolvedRawId),evidenceId=stableId("ev_govout",factHash),quality={proofStrength:35,sourceReliability:20,freshness:0,completeness:15,consistency:10};
      const ev=await c.query("INSERT INTO evidence(id,organization_id,raw_attestation_id,subject,predicate,value,chain,source,verification_status,freshness_status,freshness_expires_at,quality_score,quality_components,observed_at,content_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'VERIFIED','ARCHIVED',$9,80,$10,$9,$11) ON CONFLICT(organization_id,content_hash) DO NOTHING RETURNING id",[evidenceId,org,resolvedRawId,fact.subject,fact.predicate,fact.value,fact.chain,fact.source,fact.observedAt,quality,factHash]);
      const resolvedEvidenceId=ev.rowCount?ev.rows[0].id:(await c.query("SELECT id FROM evidence WHERE organization_id=$1 AND content_hash=$2",[org,factHash])).rows[0]?.id;
      if(!resolvedEvidenceId)throw new Error("OUTCOME_EVIDENCE_NOT_PERSISTED");
      const classification=await persistEvidenceClassification(c,org,{id:resolvedEvidenceId,contentHash:factHash,subject:fact.subject,predicate:fact.predicate,value:fact.value,source:fact.source,verificationStatus:"VERIFIED"});
      const outcomeId=stableId("govout",candidate.contentHash);
      const outcome=await c.query("INSERT INTO governance_outcome_evidence(id,organization_id,evidence_id,decision_id,evidence_snapshot_id,source_evidence_ids,external_proposal_id,chain_id,transaction_hash,block_number,block_hash,payload,content_hash,asset_execution_authorized) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false) ON CONFLICT(organization_id,content_hash) DO NOTHING RETURNING id",[outcomeId,org,resolvedEvidenceId,candidate.lineage.decisionId,candidate.lineage.evidenceSnapshotId,JSON.stringify(candidate.lineage.evidenceIds),candidate.lineage.proposalId,candidate.source.chainId,candidate.source.transactionHash,candidate.source.blockNumber,candidate.source.blockHash,candidate,candidate.contentHash]);
      const resolvedOutcomeId=outcome.rowCount?outcome.rows[0].id:(await c.query("SELECT id FROM governance_outcome_evidence WHERE organization_id=$1 AND content_hash=$2",[org,candidate.contentHash])).rows[0]?.id;
      if(!resolvedOutcomeId)throw new Error("OUTCOME_LINEAGE_NOT_PERSISTED");
      const auditData={governanceOutcomeEvidenceId:resolvedOutcomeId,evidenceId:resolvedEvidenceId,decisionId:candidate.lineage.decisionId,evidenceSnapshotId:candidate.lineage.evidenceSnapshotId,transactionHash:candidate.source.transactionHash,blockNumber:candidate.source.blockNumber,contentHash:candidate.contentHash,factHash,classificationHash:classification.classificationHash,verifiedOutcome:"DETERMINISTIC_WITHHOLDING_EXECUTED",economicBenefitClaimed:false,causalAttributionEstablished:false,pidFeedbackApplied:false,ragMemoryPromoted:false,skillPromoted:false,assetExecutionAuthorized:false};
      const auditId=stableId("audit_govout",candidate.contentHash),auditPayload={eventType:"governance.outcome_evidence_imported",organizationId:org,objectType:"governance_outcome_evidence",objectId:resolvedOutcomeId,data:auditData};
      await c.query("INSERT INTO audit_events(id,organization_id,event_type,actor,action,object_type,object_id,data,payload_hash) VALUES($1,$2,'governance.outcome_evidence_imported',$3,'governance.outcome_evidence_imported','governance_outcome_evidence',$4,$5,$6) ON CONFLICT(id) DO NOTHING",[auditId,org,{type:"system_worker",id:"live-governance-outcome-importer"},resolvedOutcomeId,auditData,hashValue(auditPayload)]);
      return{organizationId:org,rawId:resolvedRawId,evidenceId:resolvedEvidenceId,outcomeId:resolvedOutcomeId,factHash,classificationHash:classification.classificationHash,idempotentReplay:!raw.rowCount&&!ev.rowCount&&!outcome.rowCount};
    }));
    const ownVisible=await db.runWithTenant(imported.organizationId,"outcome-auditor","AUDITOR",async()=>Number((await db.query("SELECT count(*)::int count FROM governance_outcome_evidence WHERE id=$1",[imported.outcomeId])).rows[0].count));
    const crossTenantHidden=await db.runWithTenant("org_cross_tenant_probe","outcome-auditor","AUDITOR",async()=>Number((await db.query("SELECT count(*)::int count FROM governance_outcome_evidence WHERE id=$1",[imported.outcomeId])).rows[0].count)===0);
    const lineageImmutable=await assertImmutable(db,imported.organizationId,"governance_outcome_evidence",imported.outcomeId),evidenceImmutable=await assertImmutable(db,imported.organizationId,"evidence",imported.evidenceId),rawImmutable=await assertImmutable(db,imported.organizationId,"raw_attestations",imported.rawId),unlinkedUpdatesSupported=await assertUnlinkedUpdatesRemainSupported(db,imported.organizationId);
    if(ownVisible!==1||!crossTenantHidden||!lineageImmutable||!evidenceImmutable||!rawImmutable||!unlinkedUpdatesSupported)throw new Error("OUTCOME_DATABASE_GUARDS_FAILED");
    const receipt={schemaVersion:"aeos.live-governance-hold-outcome-evidence-import.v1",status:"OUTCOME_EVIDENCE_IMPORTED",recordedAt:candidate.recordedAt,tenantBinding:"SERVER_RESOLVED_FROM_DECISION",rawTenantIdentifiersDisclosed:false,governanceOutcomeEvidenceId:imported.outcomeId,evidenceId:imported.evidenceId,decisionId:candidate.lineage.decisionId,evidenceSnapshotId:candidate.lineage.evidenceSnapshotId,sourceEvidenceIds:candidate.lineage.evidenceIds,executeTransactionHash:candidate.source.transactionHash,blockNumber:candidate.source.blockNumber,blockHash:candidate.source.blockHash,outcomeCandidateHash:candidate.contentHash,evidenceFactHash:imported.factHash,classificationHash:imported.classificationHash,initialImportCreated:true,checks:{canonicalFinalityBound:true,decisionSnapshotLineageBound:true,organizationScoped:true,crossTenantHidden,lineageImmutable,evidenceImmutable,rawAttestationImmutable:rawImmutable,unlinkedEvidenceUpdatesSupported:unlinkedUpdatesSupported,databaseEvidenceCreated:true},truthBoundary:{verifiedOutcome:"DETERMINISTIC_WITHHOLDING_EXECUTED",treasuryAssetMovement:false,economicBenefitClaimed:false,causalAttributionEstablished:false,pidFeedbackApplied:false,ragMemoryPromoted:false,skillPromoted:false,assetExecutionAuthorized:false},controls:{privateKeyReceived:false,signerCustody:false,broadcastCapability:false,assetExecutionAuthorized:false}};
    const serialized=`${JSON.stringify(receipt,null,2)}\n`;
    if(existsSync(OUTPUT_PATH)){const existing=read(OUTPUT_PATH);if(existing.outcomeCandidateHash!==receipt.outcomeCandidateHash||existing.governanceOutcomeEvidenceId!==receipt.governanceOutcomeEvidenceId||existing.evidenceId!==receipt.evidenceId||existing.controls?.assetExecutionAuthorized!==false)throw new Error("OUTCOME_PUBLIC_RECEIPT_ALREADY_EXISTS_WITH_DIFFERENT_IDENTITY")}
    else writeFileSync(OUTPUT_PATH,serialized,{encoding:"utf8",flag:"wx"});
    console.log(JSON.stringify({status:receipt.status,evidenceId:receipt.evidenceId,governanceOutcomeEvidenceId:receipt.governanceOutcomeEvidenceId,outcomeCandidateHash:receipt.outcomeCandidateHash,crossTenantHidden,immutable:lineageImmutable&&evidenceImmutable&&rawImmutable,unlinkedUpdatesSupported,treasuryAssetMovement:false,economicBenefitClaimed:false,assetExecutionAuthorized:false},null,2));
  }finally{await db.onModuleDestroy()}
}

if(require.main===module)main().catch(error=>{console.error(error instanceof Error?error.message:"OUTCOME_EVIDENCE_IMPORT_FAILED");process.exit(1)});
