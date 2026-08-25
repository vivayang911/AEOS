const {createHash}=require("node:crypto");
const {mkdir,writeFile}=require("node:fs/promises");
const path=require("node:path");
const {Pool}=require("pg");
const {chunkKnowledgeDocument,MOCK_EMBEDDING_MODEL,scanKnowledgeContent}=require("../dist/knowledge-engine");
require("dotenv").config({path:path.resolve(__dirname,"../../../.env"),quiet:true});

const expected={
  "aeos-governance-operating-policy":4,
  "aeos-treasury-authorization-boundary":4,
  "aeos-risk-review-rubric":5,
  "aeos-contract-control-surface":5,
  "aeos-hold-outcome-memory":4,
};
const sourceKeys=Object.keys(expected);
const omitted=new Set(["reportHash","recordedAt"]);
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.entries(value).filter(([key])=>!omitted.has(key)).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`:JSON.stringify(value);
const hash=value=>`0x${createHash("sha256").update(canonical(value)).digest("hex")}`;
const commit=value=>`0x${createHash("sha256").update(String(value)).digest("hex")}`;
const asJson=value=>typeof value==="string"?JSON.parse(value):value;

async function main(){
  if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is required");
  const pool=new Pool({connectionString:process.env.DATABASE_URL});
  const client=await pool.connect();
  try{
    const boundary=await client.query(`SELECT o.id,m.user_id,m.role FROM organizations o JOIN memberships m ON m.organization_id=o.id WHERE o.name='AEOS Hackathon Demo DAO' AND o.status='ACTIVE' AND m.status='ACTIVE' AND m.role IN ('ADMIN','REVIEWER') ORDER BY CASE m.role WHEN 'ADMIN' THEN 0 ELSE 1 END LIMIT 1`);
    if(boundary.rowCount!==1)throw new Error("Active AEOS Hackathon Demo DAO reviewer boundary not found");
    const {id:organizationId,user_id:userId,role}=boundary.rows[0];
    const other=await client.query("SELECT id FROM organizations WHERE id<>$1 ORDER BY id LIMIT 1",[organizationId]);
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE aeos_app");
    await client.query("SELECT set_config('app.current_organization_id',$1,true),set_config('app.current_user_id',$2,true),set_config('app.current_membership_role',$3,true),set_config('app.system_worker','off',true)",[organizationId,userId,role]);
    const sources=await client.query(`SELECT * FROM knowledge_sources WHERE source_key=ANY($1::text[]) ORDER BY array_position($1::text[],source_key),version`,[sourceKeys]);
    const events=await client.query(`SELECT id,source_id,ordinal,status,actor_id,rationale,payload_hash,created_at FROM knowledge_source_events WHERE source_id=ANY($1::text[]) ORDER BY source_id,ordinal`,[sources.rows.map(row=>row.id)]);
    const chunks=await client.query(`SELECT id,source_id,source_version,chunk_index,heading,content,embedding_model,acl_roles,valid_from,valid_until,conflict_group_id,content_hash FROM knowledge_chunks WHERE source_id=ANY($1::text[]) ORDER BY source_id,chunk_index`,[sources.rows.map(row=>row.id)]);
    const audits=await client.query(`SELECT id,object_id,actor,data,payload_hash FROM audit_events WHERE event_type='knowledge.source_approved' AND object_id=ANY($1::text[]) ORDER BY object_id,id`,[sources.rows.map(row=>row.id)]);
    let crossTenantHidden="NOT_APPLICABLE_SINGLE_TENANT";
    if(other.rowCount){
      await client.query("SELECT set_config('app.current_organization_id',$1,true)",[other.rows[0].id]);
      const hiddenSources=await client.query("SELECT count(*)::int AS count FROM knowledge_sources WHERE id=ANY($1::text[])",[sources.rows.map(row=>row.id)]);
      const hiddenChunks=await client.query("SELECT count(*)::int AS count FROM knowledge_chunks WHERE source_id=ANY($1::text[])",[sources.rows.map(row=>row.id)]);
      const hiddenEvents=await client.query("SELECT count(*)::int AS count FROM knowledge_source_events WHERE source_id=ANY($1::text[])",[sources.rows.map(row=>row.id)]);
      if(hiddenSources.rows[0].count!==0||hiddenChunks.rows[0].count!==0||hiddenEvents.rows[0].count!==0)throw new Error("Cross-tenant RLS visibility detected");
      crossTenantHidden=true;
    }
    await client.query("ROLLBACK");

    const keyCounts=Object.fromEntries(sourceKeys.map(key=>[key,sources.rows.filter(row=>row.source_key===key).length]));
    if(sources.rowCount!==5||Object.values(keyCounts).some(count=>count!==1))throw new Error(`Expected exactly one version for each approved source: ${JSON.stringify(keyCounts)}`);
    if(chunks.rowCount!==22)throw new Error(`Expected 22 persisted chunks, received ${chunks.rowCount}`);
    if(audits.rowCount!==5)throw new Error(`Expected five independent approval audits, received ${audits.rowCount}`);

    const approvalEventIds=new Set();
    const approvalPayloadHashes=new Set();
    const approvalAuditIds=new Set(audits.rows.map(row=>row.id));
    const approvalAuditHashes=new Set(audits.rows.map(row=>row.payload_hash));
    const verifiedSources=sources.rows.map(source=>{
      const sourceEvents=events.rows.filter(row=>row.source_id===source.id);
      const sourceChunks=chunks.rows.filter(row=>row.source_id===source.id);
      const sourceAudits=audits.rows.filter(row=>row.object_id===source.id);
      const prospective=chunkKnowledgeDocument(source.redacted_content);
      const scan=scanKnowledgeContent(source.redacted_content);
      const acl=asJson(source.acl_roles);
      const expectedChunks=expected[source.source_key];
      const eventSequence=sourceEvents.map(event=>`${event.ordinal}:${event.status}`);
      const approval=sourceEvents[1];
      if(approval){approvalEventIds.add(approval.id);approvalPayloadHashes.add(approval.payload_hash)}
      const chunksExact=sourceChunks.length===prospective.length&&sourceChunks.every((stored,index)=>{
        const recomputed=prospective[index];
        return stored.source_version===source.version&&stored.chunk_index===recomputed.index&&stored.heading===recomputed.heading&&stored.content===recomputed.content&&stored.content_hash===recomputed.contentHash&&stored.embedding_model===MOCK_EMBEDDING_MODEL&&JSON.stringify(asJson(stored.acl_roles))===JSON.stringify(acl);
      });
      const approvalActor=approval?.actor_id;
      const auditActor=asJson(sourceAudits[0]?.actor);
      const checks={
        approved:eventSequence.length===2&&eventSequence[0]==="0:DRAFT"&&eventSequence[1]==="1:APPROVED",
        safe:scan.safe===true&&scan.codes.length===0,
        expectedChunkCount:expectedChunks===sourceChunks.length&&prospective.length===expectedChunks,
        deterministicChunks:chunksExact,
        independentHumanApproval:sourceAudits.length===1&&approvalActor===auditActor?.id&&auditActor?.type==="human"&&approval?.rationale.includes(source.source_key)&&approval.rationale.includes("Human owner approved"),
        advisoryOnly:approval?.rationale.includes("advisory retrieval")&&approval.rationale.includes("no PolicyRegistry")&&approval.rationale.includes("asset authority"),
      };
      if(Object.values(checks).some(value=>value!==true))throw new Error(`${source.source_key} failed ${JSON.stringify(checks)}`);
      return {sourceId:source.id,sourceKey:source.source_key,partition:source.partition,version:source.version,status:"APPROVED",contentHash:source.content_hash,originalContentHash:source.original_content_hash,approvalActorCommitment:commit(approvalActor),eventSequence,approvalEventId:approval.id,approvalPayloadHash:approval.payload_hash,approvalAuditId:sourceAudits[0].id,approvalAuditHash:sourceAudits[0].payload_hash,persistedChunkCount:sourceChunks.length,retrievalStatus:"AVAILABLE",chunkHashes:sourceChunks.map(chunk=>chunk.content_hash),checks};
    });
    if(events.rowCount!==10||approvalEventIds.size!==5||approvalPayloadHashes.size!==5||approvalAuditIds.size!==5||approvalAuditHashes.size!==5)throw new Error("Approval records are not five independent append-only event/audit pairs");
    const report={schemaVersion:"aeos.demo-advisory-rubric-approved.v1",rubric:"DEMO_ADVISORY_RUBRIC_V1",recordedAt:new Date().toISOString(),organizationScoped:true,organizationName:"AEOS Hackathon Demo DAO",sourceCount:verifiedSources.length,approvedSourceCount:verifiedSources.length,persistedChunkCount:chunks.rowCount,retrievalStatus:"AVAILABLE",appendOnlyApprovalEvents:events.rowCount,independentApprovalAudits:audits.rowCount,crossTenantHidden,sources:verifiedSources,controls:{manifestFrozen:false,agentRun:false,signature:false,broadcast:false,assetExecutionAuthorized:false}};
    report.reportHash=hash(report);
    const output=path.resolve(__dirname,"../../../reports/live-demo/demo-advisory-rubric-v1-approved.json");
    await mkdir(path.dirname(output),{recursive:true});
    await writeFile(output,`${JSON.stringify(report,null,2)}\n`,"utf8");
    console.log(JSON.stringify({...report,reportPath:path.relative(path.resolve(__dirname,"../../.."),output).replaceAll("\\","/")}));
  }catch(error){
    try{await client.query("ROLLBACK")}catch{}
    throw error;
  }finally{client.release();await pool.end()}
}
main().catch(error=>{console.error(error.message);process.exit(1)});
