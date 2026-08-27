const {existsSync,readFileSync,writeFileSync}=require("node:fs");
const {resolve}=require("node:path");
require("dotenv").config({path:resolve(__dirname,"../../../.env"),quiet:true});
const {DatabaseService}=require("../dist/database.service");
const {hashValue}=require("../dist/decision-engine");

const ROOT=resolve(__dirname,"../../..");
const paths={
  artifact:"reports/live-demo/p0-1-governance-hold-proposal-attempt-3.json",
  proposal:"reports/live-demo/p0-1-governance-hold-attempt-3-proposal-finality.json",
  vote:"reports/live-demo/p0-1-governance-hold-attempt-3-vote-cast-finality.json",
  queue:"reports/live-demo/p0-1-governance-hold-attempt-3-queue-finality.json",
  execute:"reports/live-demo/p0-1-governance-hold-attempt-3-execute-finality.json",
  outcome:"reports/live-demo/p0-1-governance-hold-attempt-3-outcome-evidence-import.json",
  output:"reports/live-demo/p0-1-governance-hold-attempt-3-proposal-projection-import.json"
};
const read=key=>JSON.parse(readFileSync(resolve(ROOT,paths[key]),"utf8"));
const idFromHash=(prefix,value)=>`${prefix}_${value.slice(2,34)}`;
const txPattern=/^0x[0-9a-f]{64}$/;

function freezeProjection(){
  const artifact=read("artifact"),proposal=read("proposal"),vote=read("vote"),queue=read("queue"),execute=read("execute"),outcome=read("outcome");
  const externalProposalId=artifact.proposal.proposalId;
  const identities=[proposal.proposalId,vote.proposalId,queue.proposalId,execute.proposalId];
  const artifactHashes=[proposal.proposalArtifactHash,vote.proposalArtifactHash,queue.proposalArtifactHash,execute.proposalArtifactHash];
  const transactions=[proposal.transactionHash,vote.voteTransaction.hash,queue.transaction.hash,execute.transaction.hash];
  if(identities.some(value=>value!==externalProposalId)||artifactHashes.some(value=>value!==artifact.artifactHash))throw new Error("GOVERNANCE_PROPOSAL_IDENTITY_MISMATCH");
  if(transactions.some(value=>!txPattern.test(value))||execute.transaction.hash!==outcome.executeTransactionHash)throw new Error("GOVERNANCE_TRANSACTION_LINEAGE_MISMATCH");
  if(proposal.chainId!==artifact.chain.chainId||vote.chainId!==artifact.chain.chainId||queue.chainId!==artifact.chain.chainId||execute.chainId!==artifact.chain.chainId)throw new Error("GOVERNANCE_CHAIN_MISMATCH");
  if(proposal.checks.exactProposalCreatedEvent!==true||vote.checks.exactVoteCastEvent!==true||vote.governance.quorumMet!==true||queue.checks.exactProposalQueuedEvent!==true||queue.timelock.minimumDelaySeconds!==60||execute.checks.exactProposalExecutedEvent!==true||execute.timelock.done!==true||execute.treasuryGuard.paused!==true||execute.policyRegistry.mutationPerformed!==false||execute.outcome.treasuryAssetMovement!==false)throw new Error("GOVERNANCE_FINALITY_GATES_FAILED");
  if([artifact,proposal,vote,queue,execute].some(value=>value.controls?.assetExecutionAuthorized!==false))throw new Error("GOVERNANCE_AUTHORITY_BOUNDARY_FAILED");
  const calldataHash=hashValue({targets:artifact.proposal.targets,values:artifact.proposal.values,calldatas:artifact.proposal.calldatas});
  const payload={schemaVersion:"aeos.chain-governance-proposal-projection.v1",source:"CANONICAL_CHAIN_FINALITY",proposalType:"SECURITY_HOLD",title:artifact.proposal.title,decisionId:artifact.lineage.decisionId,evidenceSnapshotId:artifact.lineage.evidenceSnapshotId,governanceOutcomeEvidenceId:outcome.governanceOutcomeEvidenceId,chainId:artifact.chain.chainId,governor:artifact.contracts.governor,externalProposalId,targets:artifact.proposal.targets,values:artifact.proposal.values,calldatas:artifact.proposal.calldatas,calldataHash,proposalArtifactHash:artifact.artifactHash,transactions:{proposal:transactions[0],vote:transactions[1],queue:transactions[2],execute:transactions[3]},finality:{state:"EXECUTED",blockNumber:execute.transaction.blockNumber,blockHash:execute.transaction.blockHash,confirmations:execute.transaction.confirmations},outcome:{classification:execute.outcome.classification,treasuryAssetMovement:false,economicBenefitClaimed:false,causalAttributionEstablished:false},assetExecutionAuthorized:false};
  return{payload,contentHash:hashValue(payload)};
}

async function mutationRejected(db,organizationId,id){
  return db.runWithTenant(organizationId,"proposal-projection-auditor","AUDITOR",()=>db.transaction(async client=>{
    await client.query("SAVEPOINT immutable_probe");
    try{await client.query("UPDATE chain_governance_proposals SET created_at=created_at WHERE id=$1",[id]);return false}
    catch{await client.query("ROLLBACK TO SAVEPOINT immutable_probe");return true}
  }));
}

async function main(){
  if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL_REQUIRED");
  const {payload,contentHash}=freezeProjection(),id=idFromHash("govproposal",contentHash),db=new DatabaseService();
  await db.onModuleInit();
  try{
    const imported=await db.runAsSystem(()=>db.transaction(async client=>{
      const lineage=await client.query("SELECT o.organization_id,o.id outcome_id,o.decision_id,o.evidence_snapshot_id FROM governance_outcome_evidence o WHERE o.id=$1",[payload.governanceOutcomeEvidenceId]);
      if(lineage.rowCount!==1)throw new Error("GOVERNANCE_OUTCOME_LINEAGE_NOT_FOUND");
      const row=lineage.rows[0];
      if(row.decision_id!==payload.decisionId||row.evidence_snapshot_id!==payload.evidenceSnapshotId)throw new Error("GOVERNANCE_OUTCOME_LINEAGE_MISMATCH");
      const saved=await client.query("INSERT INTO chain_governance_proposals(id,organization_id,decision_id,evidence_snapshot_id,governance_outcome_evidence_id,proposal_type,title,state,chain_id,governor,external_proposal_id,targets,values_json,calldatas,calldata_hash,proposal_artifact_hash,proposal_transaction_hash,vote_transaction_hash,queue_transaction_hash,execute_transaction_hash,final_block_number,final_block_hash,confirmations,payload,content_hash,asset_execution_authorized) VALUES($1,$2,$3,$4,$5,'SECURITY_HOLD',$6,'EXECUTED',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,false) ON CONFLICT(organization_id,content_hash) DO NOTHING RETURNING id",[id,row.organization_id,payload.decisionId,payload.evidenceSnapshotId,payload.governanceOutcomeEvidenceId,payload.title,payload.chainId,payload.governor,payload.externalProposalId,JSON.stringify(payload.targets),JSON.stringify(payload.values),JSON.stringify(payload.calldatas),payload.calldataHash,payload.proposalArtifactHash,payload.transactions.proposal,payload.transactions.vote,payload.transactions.queue,payload.transactions.execute,payload.finality.blockNumber,payload.finality.blockHash,payload.finality.confirmations,payload,contentHash]);
      const resolvedId=saved.rowCount?saved.rows[0].id:(await client.query("SELECT id FROM chain_governance_proposals WHERE organization_id=$1 AND content_hash=$2",[row.organization_id,contentHash])).rows[0]?.id;
      if(!resolvedId)throw new Error("GOVERNANCE_PROPOSAL_PROJECTION_NOT_PERSISTED");
      if(saved.rowCount){const data={proposalProjectionId:resolvedId,decisionId:payload.decisionId,evidenceSnapshotId:payload.evidenceSnapshotId,governanceOutcomeEvidenceId:payload.governanceOutcomeEvidenceId,externalProposalId:payload.externalProposalId,executeTransactionHash:payload.transactions.execute,contentHash,onchainFinalityVerified:true,assetExecutionAuthorized:false};await client.query("INSERT INTO audit_events(id,organization_id,event_type,actor,action,object_type,object_id,data,payload_hash) VALUES($1,$2,'governance.proposal_projection_imported',$3,'governance.proposal_projection_imported','chain_governance_proposal',$4,$5,$6)",[idFromHash("audit_govproposal",contentHash),row.organization_id,{type:"system_worker",id:"canonical-finality-importer"},resolvedId,data,hashValue({eventType:"governance.proposal_projection_imported",organizationId:row.organization_id,objectId:resolvedId,data})])}
      return{organizationId:row.organization_id,id:resolvedId,created:saved.rowCount===1};
    }));
    const visible=await db.runWithTenant(imported.organizationId,"proposal-projection-auditor","AUDITOR",async()=>Number((await db.query("SELECT count(*)::int count FROM chain_governance_proposals WHERE id=$1",[imported.id])).rows[0].count)===1);
    const crossTenantHidden=await db.runWithTenant("org_cross_tenant_probe","proposal-projection-auditor","AUDITOR",async()=>Number((await db.query("SELECT count(*)::int count FROM chain_governance_proposals WHERE id=$1",[imported.id])).rows[0].count)===0);
    const immutable=await mutationRejected(db,imported.organizationId,imported.id);
    if(!visible||!crossTenantHidden||!immutable)throw new Error("GOVERNANCE_PROPOSAL_PROJECTION_GUARDS_FAILED");
    const receipt={schemaVersion:"aeos.chain-governance-proposal-projection-import.v1",status:"CHAIN_GOVERNANCE_PROPOSAL_PROJECTED",recordedAt:new Date().toISOString(),proposalProjectionId:imported.id,externalProposalId:payload.externalProposalId,decisionId:payload.decisionId,evidenceSnapshotId:payload.evidenceSnapshotId,governanceOutcomeEvidenceId:payload.governanceOutcomeEvidenceId,contentHash,calldataHash:payload.calldataHash,transactions:payload.transactions,checks:{canonicalFinalityBound:true,organizationScoped:visible,crossTenantHidden,immutable,onchainFinalityVerified:true},controls:{privateKeyReceived:false,signerCustody:false,broadcastCapability:false,assetExecutionAuthorized:false}};
    const output=resolve(ROOT,paths.output);
    if(existsSync(output)){const prior=JSON.parse(readFileSync(output,"utf8"));if(prior.contentHash!==contentHash||prior.proposalProjectionId!==imported.id)throw new Error("PROJECTION_RECEIPT_CONFLICT")}
    else writeFileSync(output,`${JSON.stringify(receipt,null,2)}\n`,{encoding:"utf8",flag:"wx"});
    console.log(JSON.stringify({status:receipt.status,proposalProjectionId:imported.id,externalProposalId:payload.externalProposalId,contentHash,calldataHash:payload.calldataHash,created:imported.created,crossTenantHidden,immutable,assetExecutionAuthorized:false},null,2));
  }finally{await db.onModuleDestroy()}
}

if(require.main===module)main().catch(error=>{console.error(error instanceof Error?error.message:"GOVERNANCE_PROJECTION_IMPORT_FAILED");process.exit(1)});
module.exports={freezeProjection};
