const { randomUUID } = require("node:crypto");
const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");
const { Pool } = require("pg");
const { UscAttestcoinAdapter } = require("../dist/attestcoin-adapter");
const { persistEvidenceClassification } = require("../dist/evidence-classification");
const { assertLiveReceiptMatchesFrozen, hashLiveValue, validateLiveAttestcoinReconciliation } = require("../dist/live-attestcoin-reconciliation");

require("dotenv").config({ path: resolve(__dirname,"../../../.env"), quiet: true });
const id=(prefix)=>`${prefix}_${randomUUID().replaceAll("-","")}`;
const allowedRoles=new Set(["ADMIN","REVIEWER","OPERATOR"]);
const load=(path)=>JSON.parse(readFileSync(resolve(path),"utf8"));

function loadBundle(){return{
  step1:load(process.env.AEOS_LIVE_STEP_1_OUTPUT||resolve(__dirname,"../../../reports/live-demo/step-1-commit-observation-request.json")),
  step4:load(process.env.AEOS_LIVE_PROOF_OUTPUT||resolve(__dirname,"../../../reports/live-demo/step-4-usc-proof-retry-1.json")),
  step5:load(process.env.AEOS_LIVE_VERIFICATION_REQUEST_OUTPUT||resolve(__dirname,"../../../reports/live-demo/step-5-usc-verification-request-retry-1.json")),
  step6:load(process.env.AEOS_LIVE_WALLET_SUBMISSION_OUTPUT||resolve(__dirname,"../../../reports/live-demo/step-6-wallet-submission-retry-1.json")),
  step7:load(process.env.AEOS_LIVE_TRANSACTION_VERIFICATION_OUTPUT||resolve(__dirname,"../../../reports/live-demo/step-7-transaction-verified-retry-1.json")),
}}

async function resolveActiveSession(client,walletAddress){
  const result=await client.query("SELECT s.id AS session_id,s.user_id,s.active_organization_id AS organization_id,u.wallet_address,m.role FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN memberships m ON m.organization_id=s.active_organization_id AND m.user_id=s.user_id AND m.status='ACTIVE' WHERE lower(u.wallet_address)=lower($1) AND s.revoked_at IS NULL AND s.expires_at>now() ORDER BY s.created_at DESC",[walletAddress]);
  if(result.rowCount!==1)throw new Error(result.rowCount?"LIVE_RECONCILIATION_ACTIVE_SESSION_AMBIGUOUS":"LIVE_RECONCILIATION_ACTIVE_SESSION_REQUIRED");
  const session=result.rows[0];
  if(!session.organization_id||!allowedRoles.has(session.role))throw new Error("LIVE_RECONCILIATION_ACTIVE_SESSION_NOT_AUTHORIZED");
  return session;
}

async function applyTenantContext(client,session){
  await client.query("SET LOCAL ROLE aeos_app");
  await client.query("SELECT set_config('app.current_organization_id',$1,true),set_config('app.current_user_id',$2,true),set_config('app.current_membership_role',$3,true),set_config('app.system_worker','off',true),set_config('app.current_request_id',$4,true)",[session.organization_id,session.user_id,session.role,`live-reconcile-${randomUUID()}`]);
}

async function persistValidated(client,session,validated,observedReceipt){
  const org=session.organization_id,source=validated.source;
  const existing=await client.query("SELECT * FROM attestcoin_proof_jobs WHERE organization_id=$1 AND source_chain_id=$2 AND source_tx_hash=$3",[org,source.chainId,source.transactionHash]);
  if(existing.rowCount){
    const row=existing.rows[0];
    if(row.status!=="VERIFIED"||!row.evidence_id||row.proof_snapshot_hash!==validated.proofSnapshotHash||row.verification_request_hash!==validated.verificationRequestHash||row.verification_tx_hash!==observedReceipt.transactionHash)throw new Error("LIVE_RECONCILIATION_EXISTING_JOB_MISMATCH");
    const evidence=await client.query("SELECT e.freshness_status,c.classification_hash,c.labels,c.routes FROM evidence e LEFT JOIN evidence_classifications c ON c.organization_id=e.organization_id AND c.evidence_id=e.id AND c.classifier_version='deterministic-evidence-classifier-v1' WHERE e.organization_id=$1 AND e.id=$2",[org,row.evidence_id]);
    if(evidence.rowCount!==1||!evidence.rows[0].classification_hash)throw new Error("LIVE_RECONCILIATION_EXISTING_EVIDENCE_INCOMPLETE");
    const detail=evidence.rows[0];
    return{jobId:row.id,evidenceId:row.evidence_id,created:false,verificationReceiptHash:row.verification_receipt_hash,classificationHash:detail.classification_hash,classificationLabels:detail.labels,classificationRoutes:detail.routes,freshnessStatus:detail.freshness_status};
  }
  const receiptHash=hashLiveValue(observedReceipt),jobId=id("uscjob");
  await client.query("INSERT INTO attestcoin_proof_jobs(id,organization_id,adapter,source_chain_id,source_chain_key,source_tx_hash,requester_wallet,status,source_snapshot,source_snapshot_hash,proof_snapshot,proof_snapshot_hash,verification_request,verification_request_hash,verification_receipt,verification_receipt_hash,verification_tx_hash) VALUES($1,$2,$3,$4,$5,$6,$7,'VERIFIED',$8,$9,$10,$11,$12,$13,$14,$15,$16)",[jobId,org,validated.provider,source.chainId,source.chainKey,source.transactionHash,validated.request.from,source,validated.sourceSnapshotHash,validated.proof,validated.proofSnapshotHash,validated.request,validated.verificationRequestHash,observedReceipt,receiptHash,observedReceipt.transactionHash]);
  const rawPayload={source,proofSnapshotHash:validated.proofSnapshotHash,verificationReceipt:observedReceipt,organizationCommitment:validated.organizationCommitment,treasuryCommitment:validated.treasuryCommitment,truthBoundary:{verifiedClaim:"SOURCE_TRANSACTION_INCLUSION",payloadEconomicTruthVerified:false,assetExecutionAuthorized:false}},rawHash=hashLiveValue(rawPayload),rawId=id("raw");
  const insertedRaw=await client.query("INSERT INTO raw_attestations(id,organization_id,provider,chain_id,payload,content_hash) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(organization_id,content_hash) DO NOTHING RETURNING id",[rawId,org,validated.provider,source.chainId,rawPayload,rawHash]);
  const resolvedRawId=insertedRaw.rowCount?insertedRaw.rows[0].id:(await client.query("SELECT id FROM raw_attestations WHERE organization_id=$1 AND content_hash=$2",[org,rawHash])).rows[0]?.id;
  if(!resolvedRawId)throw new Error("LIVE_RECONCILIATION_RAW_ATTESTATION_NOT_PERSISTED");
  const fact={subject:{type:"transaction",id:`eip155:${source.chainId}:${source.transactionHash}`},predicate:"blockchain.transaction.included",value:{transactionHash:source.transactionHash,from:source.from,to:source.to,value:source.value,observationCommitment:validated.organizationCommitment,treasuryCommitment:validated.treasuryCommitment,payloadEconomicTruthVerified:false},chain:{id:source.chainId,blockNumber:source.blockNumber,blockHash:source.blockHash},source:{provider:validated.provider,reference:resolvedRawId,proofSnapshotHash:validated.proofSnapshotHash,verificationRequestHash:validated.verificationRequestHash,verificationTransactionHash:observedReceipt.transactionHash},verificationStatus:"VERIFIED",observedAt:source.observedAt},factHash=hashLiveValue(fact);
  const expiresAt=new Date(new Date(source.observedAt).getTime()+24*60*60*1000),freshness=expiresAt.getTime()>Date.now()?"FRESH":"STALE",quality={proofStrength:35,sourceReliability:20,freshness:freshness==="FRESH"?20:0,completeness:15,consistency:10},evidenceId=id("ev");
  const insertedEvidence=await client.query("INSERT INTO evidence(id,organization_id,raw_attestation_id,subject,predicate,value,chain,source,verification_status,freshness_status,freshness_expires_at,quality_score,quality_components,observed_at,content_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'VERIFIED',$9,$10,$11,$12,$13,$14) ON CONFLICT(organization_id,content_hash) DO NOTHING RETURNING id",[evidenceId,org,resolvedRawId,fact.subject,fact.predicate,fact.value,fact.chain,fact.source,freshness,expiresAt.toISOString(),Object.values(quality).reduce((sum,value)=>sum+value,0),quality,source.observedAt,factHash]);
  const resolvedEvidenceId=insertedEvidence.rowCount?insertedEvidence.rows[0].id:(await client.query("SELECT id FROM evidence WHERE organization_id=$1 AND content_hash=$2",[org,factHash])).rows[0]?.id;
  if(!resolvedEvidenceId)throw new Error("LIVE_RECONCILIATION_EVIDENCE_NOT_PERSISTED");
  const classification=await persistEvidenceClassification(client,org,{id:resolvedEvidenceId,contentHash:factHash,subject:fact.subject,predicate:fact.predicate,value:fact.value,source:fact.source,verificationStatus:"VERIFIED"});
  await client.query("UPDATE attestcoin_proof_jobs SET evidence_id=$3 WHERE organization_id=$1 AND id=$2",[org,jobId,resolvedEvidenceId]);
  const auditData={chainId:observedReceipt.chainId,sourceTransactionHash:source.transactionHash,verificationTransactionHash:observedReceipt.transactionHash,blockNumber:observedReceipt.blockNumber,blockHash:observedReceipt.blockHash,evidenceId:resolvedEvidenceId,proofSnapshotHash:validated.proofSnapshotHash,verificationRequestHash:validated.verificationRequestHash,verificationReceiptHash:receiptHash,organizationCommitment:validated.organizationCommitment,treasuryCommitment:validated.treasuryCommitment,classificationHash:classification.classificationHash,classificationLabels:classification.labels,classificationRoutes:classification.routes,verifiedClaim:"SOURCE_TRANSACTION_INCLUSION",payloadEconomicTruthVerified:false,signerCustody:false,broadcastCapability:false,assetExecutionAuthorized:false},auditPayload={eventType:"attestcoin.live_evidence_reconciled",organizationId:org,objectType:"attestcoin_proof_job",objectId:jobId,data:auditData};
  await client.query("INSERT INTO audit_events(id,organization_id,event_type,actor,action,object_type,object_id,data,payload_hash) VALUES($1,$2,'attestcoin.live_evidence_reconciled',$3,'attestcoin.live_evidence_reconciled','attestcoin_proof_job',$4,$5,$6)",[id("audit"),org,{type:"human",id:session.user_id,walletAddress:session.wallet_address},jobId,auditData,hashLiveValue(auditPayload)]);
  return{jobId,evidenceId:resolvedEvidenceId,created:true,verificationReceiptHash:receiptHash,classificationHash:classification.classificationHash,classificationLabels:classification.labels,classificationRoutes:classification.routes,freshnessStatus:freshness};
}

async function main(){
  if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL_REQUIRED");
  const bundle=loadBundle(),wallet=bundle.step5?.verificationRequest?.from;if(!wallet)throw new Error("LIVE_RECONCILIATION_REQUESTER_MISSING");
  const pool=new Pool({connectionString:process.env.DATABASE_URL});const client=await pool.connect();
  try{
    const session=await resolveActiveSession(client,wallet),validated=validateLiveAttestcoinReconciliation(session.organization_id,bundle),adapter=new UscAttestcoinAdapter("https://sepolia.invalid",process.env.CREDITCOIN_RPC_URL),observedReceipt=await adapter.inspectVerificationTransaction(validated.verificationTransactionHash,validated.request);assertLiveReceiptMatchesFrozen(validated.receipt,observedReceipt);
    await client.query("BEGIN");try{await applyTenantContext(client,session);const imported=await persistValidated(client,session,validated,observedReceipt);await client.query("COMMIT");const artifact={schemaVersion:"aeos.live-attestcoin-step.v1",step:7,status:"EVIDENCE_IMPORTED",recordedAt:new Date().toISOString(),tenantBinding:"SERVER_RESOLVED_ACTIVE_SESSION",rawTenantIdentifiersDisclosed:false,organizationCommitment:validated.organizationCommitment,treasuryCommitment:validated.treasuryCommitment,attestcoinProofJobId:imported.jobId,evidenceId:imported.evidenceId,sourceTransactionHash:validated.source.transactionHash,verificationTransactionHash:validated.verificationTransactionHash,verificationReceiptHash:imported.verificationReceiptHash,classificationHash:imported.classificationHash??null,classificationLabels:imported.classificationLabels??null,classificationRoutes:imported.classificationRoutes??null,freshnessStatus:imported.freshnessStatus??null,idempotentReplay:!imported.created,controls:{serverResolvedActiveSession:true,organizationCommitmentMatched:true,canonicalReceiptReverified:true,immutableEvidenceCreated:true,signerCustody:false,broadcastCapability:false,assetExecutionAuthorized:false},truthBoundary:{verifiedClaim:"SOURCE_TRANSACTION_INCLUSION",payloadEconomicTruthVerified:false}};const outputPath=resolve(process.env.AEOS_LIVE_EVIDENCE_IMPORT_OUTPUT||resolve(__dirname,"../../../reports/live-demo/step-7-evidence-import-public-retry-1.json"));mkdirSync(dirname(outputPath),{recursive:true});writeFileSync(outputPath,`${JSON.stringify(artifact,null,2)}\n`,{encoding:"utf8",flag:"wx"});console.log(JSON.stringify({status:artifact.status,outputPath,serverResolvedOrganizationId:session.organization_id,rawTenantIdentifiersDisclosed:artifact.rawTenantIdentifiersDisclosed,jobId:artifact.attestcoinProofJobId,evidenceId:artifact.evidenceId,idempotentReplay:artifact.idempotentReplay,verifiedClaim:artifact.truthBoundary.verifiedClaim,payloadEconomicTruthVerified:false,signerCustody:false,broadcastCapability:false,assetExecutionAuthorized:false},null,2));}catch(error){await client.query("ROLLBACK");throw error}
  }finally{client.release();await pool.end()}
}

if(require.main===module)main().catch(error=>{console.error(error instanceof Error?error.message:"LIVE_RECONCILIATION_FAILED");process.exit(1)});
module.exports={applyTenantContext,loadBundle,persistValidated,resolveActiveSession};
