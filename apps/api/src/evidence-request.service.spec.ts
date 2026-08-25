import {EvidenceRequestService} from "./evidence-request.service";

describe("EvidenceRequestService human-scoped reverse gap",()=>{
  it("serializes request JSON arrays for the real PostgreSQL write path",async()=>{
    const requestRow:any={id:"evreq_json",organization_id:"org_1",decision_id:"decision_1",agent_run_id:"run_research",schema_version:"evidence.request.v1",requesting_role:"Research",gap_code:"STALE_EVIDENCE",gap_type:"BALANCE",source_chain_id:11155111,subject:"0x1111111111111111111111111111111111111111",required_fields:["amount","symbol"],required_confirmations:12,max_freshness_seconds:300,priority:"HIGH",rationale:"Need current balance",supporting_evidence_ids:["ev_1"],budget:{maxAttempts:1,maxResults:1},broker_version:"deterministic-mock-evidence-broker-v1",request_hash:"0xrequest",asset_execution_authorized:false};
    const client:any={query:jest.fn(async(sql:string)=>{
      if(sql.startsWith("SELECT * FROM evidence_requests WHERE organization_id=$1 AND decision_id"))return{rowCount:0,rows:[]};
      if(sql.startsWith("INSERT INTO raw_attestations"))return{rowCount:1,rows:[{id:"raw_1"}]};
      if(sql.startsWith("INSERT INTO evidence("))return{rowCount:1,rows:[{id:"ev_new"}]};
      if(sql.startsWith("SELECT * FROM evidence_requests WHERE organization_id=$1 AND id"))return{rowCount:1,rows:[requestRow]};
      if(sql.startsWith("SELECT ordinal,status"))return{rowCount:1,rows:[{ordinal:7,status:"SATISFIED",evidence_id:"ev_new"}]};
      return{rowCount:1,rows:[{}]};
    })};
    const db:any={query:jest.fn().mockResolvedValueOnce({rowCount:1,rows:[{role:"Research"}]}).mockResolvedValueOnce({rowCount:1,rows:[{id:"ev_1"}]}),transaction:jest.fn(async(work:any)=>work(client))};
    await new EvidenceRequestService(db).propose("org_1","decision_1",{agentRunId:"run_research",gapCode:"STALE_EVIDENCE",gapType:"BALANCE",sourceChainId:11155111,subject:"0x1111111111111111111111111111111111111111",requiredFields:["amount","symbol"],requiredConfirmations:12,maxFreshnessSeconds:300,priority:"HIGH",rationale:"Need current balance",supportingEvidenceIds:["ev_1"],budget:{maxAttempts:1,maxResults:1}} as any);
    const insert=client.query.mock.calls.find(([sql]:[string])=>sql.startsWith("INSERT INTO evidence_requests"));
    expect(insert[1][14]).toBe('["amount","symbol"]');
    expect(insert[1][19]).toBe('["ev_1"]');
  });

  it("derives immutable gap, Evidence and Agent identity server-side",async()=>{
    const gap={id:"gap_1",code:"STALE_EVIDENCE",requesting_role:"Research",status:"REFUSAL_ONLY",gap_type:null,source_chain_id:null,subject:null,rationale:"Frozen refusal",supporting_evidence_ids:["ev_1"],gap_hash:"0xgap",evidence_request_id:null};
    const db:any={query:jest.fn()
      .mockResolvedValueOnce({rowCount:1,rows:[gap]})
      .mockResolvedValueOnce({rowCount:1,rows:[{id:"run_research"}]}),transaction:jest.fn(async(work:any)=>work(client))};
    const client:any={query:jest.fn(async(sql:string)=>{
      if(sql.startsWith("SELECT evidence_request_id"))return{rowCount:0,rows:[]};
      if(sql.startsWith("SELECT COALESCE"))return{rowCount:1,rows:[{ordinal:17}]};
      if(sql.startsWith("SELECT * FROM evidence_requests"))return{rowCount:1,rows:[{id:"evreq_1",organization_id:"org_1",decision_id:"decision_1",agent_run_id:"run_research",schema_version:"evidence.request.v1",requesting_role:"Research",gap_code:"STALE_EVIDENCE",gap_type:"BALANCE",source_chain_id:11155111,subject:"0x1111111111111111111111111111111111111111",required_fields:["amount","symbol"],required_confirmations:12,max_freshness_seconds:300,priority:"HIGH",rationale:"Human-scoped replacement Evidence",supporting_evidence_ids:["ev_1"],budget:{maxAttempts:1,maxResults:1},request_hash:"0xrequest",broker_version:"deterministic-mock-evidence-broker-v1",asset_execution_authorized:false}]};
      if(sql.startsWith("SELECT ordinal,status"))return{rowCount:1,rows:[{ordinal:7,status:"SATISFIED",evidence_id:"ev_new"}]};
      return{rowCount:1,rows:[{}]};
    })};
    const service=new EvidenceRequestService(db);
    const propose=jest.spyOn(service,"propose").mockResolvedValue({id:"evreq_1",status:"SATISFIED",evidenceId:"ev_new"} as any);
    const input:any={gapType:"BALANCE",sourceChainId:11155111,subject:"0x1111111111111111111111111111111111111111",scopeRationale:"Human verified treasury subject"};
    const result:any=await service.scopeCommitteeGap("org_1","decision_1","gap_1","user_1",input);
    expect(propose).toHaveBeenCalledWith("org_1","decision_1",expect.objectContaining({agentRunId:"run_research",gapCode:"STALE_EVIDENCE",supportingEvidenceIds:["ev_1"],maxFreshnessSeconds:300,budget:{maxAttempts:1,maxResults:1}}));
    expect(propose.mock.calls[0][2]).not.toHaveProperty("requestingRole");
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO decision_evidence_gap_links"),expect.any(Array));
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO audit_events"),expect.any(Array));
    expect(result).toMatchObject({id:"evreq_1",gapId:"gap_1",humanScoped:true,originalGapStatus:"REFUSAL_ONLY",mockOnly:true,assetExecutionAuthorized:false});
  });
});
