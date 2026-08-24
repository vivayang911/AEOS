import { buildGovernanceOutcomeFact, validateGovernanceOutcomeCandidate } from "./live-governance-outcome-evidence";
import { hashValue } from "./decision-engine";

const org="org_test";
const core:any={schemaVersion:"aeos.live-governance-hold-outcome-evidence-candidate.v1",status:"OUTCOME_EVIDENCE_CANDIDATE_FROZEN",recordedAt:"2026-08-24T02:29:18.876Z",tenantBinding:{mode:"SERVER_RESOLVED",commitment:hashValue({organizationId:org}),rawOrganizationIdDisclosed:false},lineage:{decisionId:"decision_1",decisionOutputHash:`0x${"1".repeat(64)}`,evidenceSnapshotId:"snap_1",evidenceManifestHash:`0x${"2".repeat(64)}`,evidenceIds:["ev_1"],proposalArtifactHash:`0x${"3".repeat(64)}`,proposalId:"42",queueArtifactHash:`0x${"4".repeat(64)}`,executeArtifactHash:`0x${"5".repeat(64)}`,executeTransactionHash:`0x${"6".repeat(64)}`,timelockOperationId:`0x${"7".repeat(64)}`},predicate:"dao.governance.security_hold.executed",subject:"treasury.guard",value:{classification:"DETERMINISTIC_WITHHOLDING_EXECUTED",guardPaused:true,nativeValue:"0",treasuryAssetMovement:false,policyMutationPerformed:false},source:{chainId:102031,blockNumber:10,blockHash:`0x${"8".repeat(64)}`,transactionHash:`0x${"6".repeat(64)}`},truthBoundary:{transactionFinalityVerified:true,governanceExecutionVerified:true,deterministicWithholdingVerified:true,economicBenefitClaimed:false,causalAttributionEstablished:false,databaseEvidenceCreated:false,pidFeedbackApplied:false,ragMemoryPromoted:false,skillPromoted:false,assetExecutionAuthorized:false}};
const candidate={...core,contentHash:hashValue(core)};
const lineage={organizationId:org,decision:{id:"decision_1",outputHash:`0x${"1".repeat(64)}`,evidenceSnapshotId:"snap_1"},snapshot:{id:"snap_1",manifestHash:`0x${"2".repeat(64)}`,evidenceIds:["ev_1"]}};

describe("live governance Outcome Evidence",()=>{
  it("accepts exact tenant, Decision, Snapshot, chain and truth lineage",()=>{
    expect(validateGovernanceOutcomeCandidate(candidate,lineage)).toBe(candidate);
    const result=buildGovernanceOutcomeFact(candidate,"raw_1");
    expect(result.fact.value.treasuryAssetMovement).toBe(false);
    expect(result.fact.source.reference).toBe("raw_1");
    expect(result.contentHash).toMatch(/^0x[0-9a-f]{64}$/);
  });
  it("rejects rewritten authority or tenant binding",()=>{
    const unsafeCore={...core,truthBoundary:{...core.truthBoundary,assetExecutionAuthorized:true}};
    expect(()=>validateGovernanceOutcomeCandidate({...unsafeCore,contentHash:hashValue(unsafeCore)},lineage)).toThrow("OUTCOME_CANDIDATE_TRUTH_BOUNDARY_INVALID");
    const otherCore={...core,tenantBinding:{...core.tenantBinding,commitment:hashValue({organizationId:"org_other"})}};
    expect(()=>validateGovernanceOutcomeCandidate({...otherCore,contentHash:hashValue(otherCore)},lineage)).toThrow("OUTCOME_CANDIDATE_TENANT_BINDING_INVALID");
  });
});
