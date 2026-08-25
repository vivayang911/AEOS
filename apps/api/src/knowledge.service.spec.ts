import { KnowledgeService } from "./knowledge.service";

describe("KnowledgeService approval persistence",()=>{
  it("serializes source ACL roles as JSON when persisting approved chunks",async()=>{
    const source={
      id:"ksource_demo",
      version:1,
      redacted_content:"# Governance boundary\n\nDAO approval is required before any execution.",
      acl_roles:["GOVERNOR","RISK"],
      valid_from:new Date("2026-08-25T00:00:00.000Z"),
      valid_until:null,
      conflict_group_id:null,
      supersedes_source_id:null,
      content_hash:`0x${"1".repeat(64)}`
    };
    const calls:Array<{sql:string;params:unknown[]}>=[];
    const client={query:jest.fn(async(sql:string,params:unknown[]=[])=>{
      calls.push({sql,params});
      if(sql.startsWith("SELECT * FROM knowledge_sources"))return {rowCount:1,rows:[source]};
      if(sql.startsWith("SELECT ordinal,status FROM knowledge_source_events"))return {rowCount:1,rows:[{ordinal:0,status:"DRAFT"}]};
      return {rowCount:1,rows:[]};
    })};
    const db={transaction:(work:(transactionClient:typeof client)=>unknown)=>work(client)} as any;

    const result=await new KnowledgeService(db).approveSource("org_demo",source.id,{
      actorId:"member_demo",
      rationale:"Human owner approved this source for advisory retrieval only."
    });

    const chunkInsert=calls.find(call=>call.sql.startsWith("INSERT INTO knowledge_chunks"));
    expect(chunkInsert).toBeDefined();
    expect(chunkInsert?.params[9]).toBe(JSON.stringify(source.acl_roles));
    expect(JSON.parse(String(chunkInsert?.params[9]))).toEqual(source.acl_roles);
    expect(result).toMatchObject({status:"APPROVED",retrievalStatus:"AVAILABLE",assetExecutionAuthorized:false});
  });
});
