import { alertAdapterConfiguration,alertContentHash,classifyAlert } from "./alert-engine";
import { OutboxEnvelope } from "./outbox-publisher";

const event=(type:string,data:unknown={}):OutboxEnvelope=>({id:`evt_${type}`,organization_id:"org_1",type,occurred_at:"2026-08-06T00:00:00Z",actor:{type:"system"},object_ref:{type:"test",id:"1"},data,schema_version:"1.0",request_id:"req_1",content_hash:"0xsource"});
describe("deterministic alert rules",()=>{
  it.each([
    ["evidence.rejected","HIGH","EVIDENCE_INTEGRITY"],
    ["attestcoin.proof_rejected","HIGH","EVIDENCE_INTEGRITY"],
    ["attestcoin.provider_unavailable","HIGH","PROVIDER_HEALTH"],
    ["evidence.stale","HIGH","EVIDENCE_FRESHNESS"],
    ["decision.job_failed","HIGH","DECISION_PIPELINE"],
    ["policy.simulation_blocked","MEDIUM","POLICY_GUARDRAIL"],
    ["organization.configuration_activated","MEDIUM","CONFIGURATION_CHANGE"],
    ["membership.changed","HIGH","PERMISSION_CHANGE"],
    ["organization.permission_changed","HIGH","PERMISSION_CHANGE"],
    ["proposal.state_unknown","HIGH","GOVERNANCE_STATE"],
    ["security.paused","CRITICAL","EMERGENCY_CONTROL"],
  ])("classifies %s",(type,severity,category)=>expect(classifyAlert(event(type))).toEqual(expect.objectContaining({severity,category})));
  it("escalates only failed reconciliation outcomes",()=>{expect(classifyAlert(event("execution.reconciliation_attempted",{outcome:"FAILED_TERMINAL",errorCode:"REORG"}))).toEqual(expect.objectContaining({severity:"CRITICAL",titleCode:"EXECUTION_RECONCILIATION_TERMINAL"}));expect(classifyAlert(event("execution.reconciliation_attempted",{outcome:"FAILED_RETRYABLE"}))).toEqual(expect.objectContaining({severity:"HIGH"}));expect(classifyAlert(event("execution.reconciliation_attempted",{outcome:"SUCCEEDED"}))).toBeNull()});
  it("ignores unrelated events and produces stable hashes",()=>{const input=event("evidence.rejected");const classification=classifyAlert(input)!;expect(classifyAlert(event("evidence.verified"))).toBeNull();expect(alertContentHash(input,classification)).toBe(alertContentHash(input,classification))});
  it("exposes a non-authoritative Mock notification boundary",()=>expect(alertAdapterConfiguration()).toEqual(expect.objectContaining({mode:"mock",networkAccess:false,credentialsRequired:false,signerCapability:false,broadcastCapability:false,assetExecutionAuthorized:false})));
});
