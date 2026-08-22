import{BadRequestException,ConflictException,ForbiddenException,NotFoundException}from"@nestjs/common";
import{OutcomeMemoryCandidateService}from"./outcome-memory-candidate.service";

describe("OutcomeMemoryCandidateService governance boundary",()=>{
 it("hides a candidate outside the active organization",async()=>{
  const db={query:jest.fn().mockResolvedValue({rowCount:0,rows:[]})}as any;
  await expect(new OutcomeMemoryCandidateService(db).get("org_b","candidate_a")).rejects.toBeInstanceOf(NotFoundException);
  expect(db.query).toHaveBeenCalledWith(expect.stringContaining("organization_id=$1"),["org_b","candidate_a"]);
 });

 it("rejects secret-bearing lessons before any persistence",async()=>{
  const db={query:jest.fn(),transaction:jest.fn()}as any;
  await expect(new OutcomeMemoryCandidateService(db).create("org_a","creator",{treasuryOutcomeId:"outcome",counterfactualAssessmentId:"cf",reviewMode:"HUMAN_COMMITTEE",lesson:"api_key=super-secret-value should be retained",invalidationConditions:["Market regime changes"],aclRoles:["REVIEWER"]})).rejects.toBeInstanceOf(BadRequestException);
  expect(db.query).not.toHaveBeenCalled();expect(db.transaction).not.toHaveBeenCalled();
 });

 it("permits only independent reviewer or committee roles",async()=>{
  const db={transaction:jest.fn()}as any;
  await expect(new OutcomeMemoryCandidateService(db).review("org_a","candidate","admin","ADMIN","APPROVE","reviewed evidence")).rejects.toBeInstanceOf(ForbiddenException);
  expect(db.transaction).not.toHaveBeenCalled();
 });

 it("prevents the candidate creator from self-reviewing",async()=>{
  const candidate={id:"candidate",organization_id:"org_a",created_by:"creator"};
  const client={query:jest.fn().mockResolvedValueOnce({rowCount:1,rows:[candidate]}).mockResolvedValueOnce({rowCount:1,rows:[{ordinal:0,event_type:"CANDIDATE"}]})};
  const db={transaction:(work:any)=>work(client)}as any;
  await expect(new OutcomeMemoryCandidateService(db).review("org_a","candidate","creator","REVIEWER","APPROVE","independent review")).rejects.toBeInstanceOf(ConflictException);
  expect(client.query).toHaveBeenCalledTimes(2);
 });

 it("records DAO confirmation only from a non-mock finalized observation",async()=>{
  const candidate={id:"candidate",organization_id:"org_a",created_by:"creator",review_mode:"HUMAN_COMMITTEE_AND_DAO",treasury_outcome_id:"outcome",counterfactual_assessment_id:"cf",lesson:"Governed lesson",invalidation_conditions:["regime change"],acl_roles:["ADMIN"],source_lineage:{},content_hash:`0x${"1".repeat(64)}`,created_at:new Date("2026-08-20T00:00:00Z")};
  const client={query:jest.fn()
   .mockResolvedValueOnce({rowCount:1,rows:[candidate]})
   .mockResolvedValueOnce({rowCount:1,rows:[{ordinal:2,event_type:"HUMAN_APPROVED"}]})
   .mockResolvedValueOnce({rowCount:1,rows:[{proposal_id:"proposal"}]})
   .mockResolvedValueOnce({rowCount:1,rows:[{id:"observation",state:"SUCCEEDED",is_reorg:false,confirmations:2,payload:{onchainFinalityVerified:true,mockOnly:false},adapter:"creditcoin-readonly-rpc-v1",payload_hash:`0x${"2".repeat(64)}`,chain_id:102031,block_number:"100",block_hash:`0x${"3".repeat(64)}`}]})
   .mockResolvedValueOnce({rowCount:1,rows:[]}).mockResolvedValueOnce({rowCount:1,rows:[]}).mockResolvedValueOnce({rowCount:2,rows:[]})};
  const db={transaction:(work:any)=>work(client)}as any;
  const result=await new OutcomeMemoryCandidateService(db).confirmDao("org_a","candidate","admin",{proposalId:"proposal"});
  expect(result).toMatchObject({status:"DAO_CONFIRMED",causalAttributionEstablished:false,assetExecutionAuthorized:false});expect(client.query.mock.calls[4][0]).toContain("outcome_memory_candidate_events");
 });

 it("rejects self-supersession before opening a transaction",async()=>{
  const db={transaction:jest.fn()}as any;
  await expect(new OutcomeMemoryCandidateService(db).supersede("org_a","candidate","admin",{replacementCandidateId:"candidate",rationale:"same record"})).rejects.toBeInstanceOf(BadRequestException);
  expect(db.transaction).not.toHaveBeenCalled();
 });

 it("reconciles no expired rows as an idempotent zero-authority batch",async()=>{
  const client={query:jest.fn().mockResolvedValue({rowCount:0,rows:[]})};const db={transaction:(work:any)=>work(client)}as any;
  const result=await new OutcomeMemoryCandidateService(db).reconcileExpired("org_a","admin");
  expect(result).toMatchObject({organizationId:"org_a",processed:0,clockAuthority:"POSTGRESQL_NOW",historicalDecisionManifestsMutated:false,assetExecutionAuthorized:false});
  expect(client.query).toHaveBeenCalledWith(expect.stringContaining("m.valid_until<=now()"),["org_a"]);
 });
});
