import { hashValue } from "./decision-engine";

export type OutcomeCandidate={
  schemaVersion:string;status:string;recordedAt:string;
  tenantBinding:{mode:string;commitment:string;rawOrganizationIdDisclosed:boolean};
  lineage:{decisionId:string;decisionOutputHash:string;evidenceSnapshotId:string;evidenceManifestHash:string;evidenceIds:string[];proposalArtifactHash:string;proposalId:string;queueArtifactHash:string;executeArtifactHash:string;executeTransactionHash:string;timelockOperationId:string};
  predicate:string;subject:string;value:Record<string,unknown>;
  source:{chainId:number;blockNumber:number;blockHash:string;transactionHash:string};
  truthBoundary:Record<string,boolean>;contentHash:string;
};

export type PersistedLineage={organizationId:string;decision:{id:string;outputHash:string;evidenceSnapshotId:string};snapshot:{id:string;manifestHash:string;evidenceIds:string[]}};

const hex64=/^0x[0-9a-f]{64}$/;
const fail=(code:string):never=>{throw new Error(code)};

export function validateGovernanceOutcomeCandidate(candidate:OutcomeCandidate,lineage:PersistedLineage){
  const {contentHash,...core}=candidate;
  if(candidate.schemaVersion!=="aeos.live-governance-hold-outcome-evidence-candidate.v1"||candidate.status!=="OUTCOME_EVIDENCE_CANDIDATE_FROZEN")fail("OUTCOME_CANDIDATE_SCHEMA_INVALID");
  if(hashValue(core)!==contentHash||!hex64.test(contentHash))fail("OUTCOME_CANDIDATE_HASH_INVALID");
  if(candidate.tenantBinding.mode!=="SERVER_RESOLVED"||candidate.tenantBinding.rawOrganizationIdDisclosed!==false||candidate.tenantBinding.commitment!==hashValue({organizationId:lineage.organizationId}))fail("OUTCOME_CANDIDATE_TENANT_BINDING_INVALID");
  if(candidate.lineage.decisionId!==lineage.decision.id||candidate.lineage.decisionOutputHash!==lineage.decision.outputHash||candidate.lineage.evidenceSnapshotId!==lineage.snapshot.id||candidate.lineage.evidenceManifestHash!==lineage.snapshot.manifestHash||lineage.decision.evidenceSnapshotId!==lineage.snapshot.id)fail("OUTCOME_CANDIDATE_DECISION_LINEAGE_INVALID");
  if(!candidate.lineage.evidenceIds.length||candidate.lineage.evidenceIds.some(id=>!lineage.snapshot.evidenceIds.includes(id)))fail("OUTCOME_CANDIDATE_EVIDENCE_LINEAGE_INVALID");
  if(candidate.lineage.executeTransactionHash!==candidate.source.transactionHash||!hex64.test(candidate.source.transactionHash)||!hex64.test(candidate.source.blockHash)||candidate.source.chainId!==102031||!Number.isInteger(candidate.source.blockNumber)||candidate.source.blockNumber<0)fail("OUTCOME_CANDIDATE_CHAIN_SOURCE_INVALID");
  const truth=candidate.truthBoundary;
  if(truth.transactionFinalityVerified!==true||truth.governanceExecutionVerified!==true||truth.deterministicWithholdingVerified!==true||truth.economicBenefitClaimed!==false||truth.causalAttributionEstablished!==false||truth.databaseEvidenceCreated!==false||truth.pidFeedbackApplied!==false||truth.ragMemoryPromoted!==false||truth.skillPromoted!==false||truth.assetExecutionAuthorized!==false)fail("OUTCOME_CANDIDATE_TRUTH_BOUNDARY_INVALID");
  if(candidate.predicate!=="dao.governance.security_hold.executed"||candidate.value.guardPaused!==true||candidate.value.treasuryAssetMovement!==false||candidate.value.policyMutationPerformed!==false||candidate.value.nativeValue!=="0")fail("OUTCOME_CANDIDATE_FACT_INVALID");
  return candidate;
}

export function buildGovernanceOutcomeFact(candidate:OutcomeCandidate,rawReference:string){
  const fact={subject:{type:"treasury_guard",id:`eip155:${candidate.source.chainId}:0x3c0cb960f32e6a222149a664a552ffc23e92c628`},predicate:candidate.predicate,value:candidate.value,chain:{id:candidate.source.chainId,blockNumber:candidate.source.blockNumber,blockHash:candidate.source.blockHash},source:{provider:"creditcoin-governance-finality-v1",reference:rawReference,transactionHash:candidate.source.transactionHash,proposalId:candidate.lineage.proposalId,timelockOperationId:candidate.lineage.timelockOperationId},verificationStatus:"VERIFIED" as const,observedAt:candidate.recordedAt};
  return{fact,contentHash:hashValue(fact)};
}
