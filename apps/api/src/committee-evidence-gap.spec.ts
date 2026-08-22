import {deriveCommitteeEvidenceGaps} from "./committee-evidence-gap";
const evidence=[{id:"ev_1",subject:{type:"wallet",id:"eip155:11155111:0x1111111111111111111111111111111111111111"},chain:{id:11155111}}];
describe("committee Evidence-gap protocol",()=>{
  it("derives deterministic requestable gaps without execution authority",()=>{const first=deriveCommitteeEvidenceGaps(["STALE_EVIDENCE"],evidence);expect(first).toEqual(deriveCommitteeEvidenceGaps(["STALE_EVIDENCE"],evidence));expect(first[0]).toMatchObject({code:"STALE_EVIDENCE",requestingRole:"Research",status:"REQUESTABLE",gapType:"BALANCE",assetExecutionAuthorized:false})});
  it("keeps unsafe or unsupported gaps as explicit refusal-only records",()=>expect(deriveCommitteeEvidenceGaps(["PROMPT_INJECTION_DETECTED"],evidence)[0]).toMatchObject({code:"UNSUPPORTED_CONTEXT",requestingRole:"Compliance",status:"REFUSAL_ONLY",gapType:null,subject:null}));
  it("does not invent an address when the frozen Evidence has none",()=>expect(deriveCommitteeEvidenceGaps(["LOW_QUALITY_EVIDENCE"],[{id:"ev_2",subject:{type:"protocol",id:"unknown"}}])[0].status).toBe("REFUSAL_ONLY"));
  it("fails closed for unsupported source chains",()=>expect(deriveCommitteeEvidenceGaps(["STALE_EVIDENCE"],[{...evidence[0],chain:{id:1}}])[0]).toMatchObject({status:"REFUSAL_ONLY",sourceChainId:null}));
});
