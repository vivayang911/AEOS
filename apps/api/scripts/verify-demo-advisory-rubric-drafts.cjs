const {createHash}=require("node:crypto");
const {mkdir,writeFile}=require("node:fs/promises");
const path=require("node:path");
const {Pool}=require("pg");
const {chunkKnowledgeDocument,scanKnowledgeContent}=require("../dist/knowledge-engine");
require("dotenv").config({path:path.resolve(__dirname,"../../../.env"),quiet:true});

const sourceKeys=[
  "aeos-governance-operating-policy",
  "aeos-treasury-authorization-boundary",
  "aeos-risk-review-rubric",
  "aeos-contract-control-surface",
  "aeos-hold-outcome-memory",
];
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.entries(value).filter(([key])=>!new Set(["reportHash","recordedAt"]).has(key)).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`:JSON.stringify(value);
const hash=value=>`0x${createHash("sha256").update(canonical(value)).digest("hex")}`;

async function main(){
  if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is required");
  const pool=new Pool({connectionString:process.env.DATABASE_URL});const client=await pool.connect();
  try{
    const boundary=await client.query(`SELECT o.id,m.user_id,m.role FROM organizations o JOIN memberships m ON m.organization_id=o.id WHERE o.name='AEOS Hackathon Demo DAO' AND o.status='ACTIVE' AND m.status='ACTIVE' AND m.role IN ('ADMIN','REVIEWER') ORDER BY CASE m.role WHEN 'ADMIN' THEN 0 ELSE 1 END LIMIT 1`);
    if(boundary.rowCount!==1)throw new Error("Active AEOS Hackathon Demo DAO reviewer boundary not found");
    const {id:organizationId,user_id:userId,role}=boundary.rows[0];
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE aeos_app");
    await client.query("SELECT set_config('app.current_organization_id',$1,true),set_config('app.current_user_id',$2,true),set_config('app.current_membership_role',$3,true),set_config('app.system_worker','off',true)",[organizationId,userId,role]);
    const result=await client.query(`SELECT s.id,s.source_key,s.partition,s.version,s.content_hash,s.original_content_hash,s.redacted_content,s.scan_result,(SELECT e.status FROM knowledge_source_events e WHERE e.organization_id=s.organization_id AND e.source_id=s.id ORDER BY e.ordinal DESC LIMIT 1) latest_status,(SELECT count(*)::int FROM knowledge_chunks c WHERE c.organization_id=s.organization_id AND c.source_id=s.id) persisted_chunk_count FROM knowledge_sources s WHERE s.source_key=ANY($1::text[]) ORDER BY array_position($1::text[],s.source_key),s.version`,[sourceKeys]);
    await client.query("ROLLBACK");
    const keyCounts=Object.fromEntries(sourceKeys.map(key=>[key,result.rows.filter(row=>row.source_key===key).length]));
    if(result.rowCount!==5||Object.values(keyCounts).some(count=>count!==1))throw new Error(`Expected exactly one DRAFT version for each source: ${JSON.stringify(keyCounts)}`);
    const sources=result.rows.map(row=>{
      const rescan=scanKnowledgeContent(row.redacted_content);const chunks=chunkKnowledgeDocument(row.redacted_content);
      const storedScan=typeof row.scan_result==="string"?JSON.parse(row.scan_result):row.scan_result;
      const checks={statusDraft:row.latest_status==="DRAFT",scanSafe:storedScan.safe===true&&storedScan.codes.length===0,rescanSafe:rescan.safe===true&&rescan.codes.length===0,originalHashMatches:rescan.contentHash===row.original_content_hash,persistedChunksZero:Number(row.persisted_chunk_count)===0};
      if(Object.values(checks).some(value=>value!==true))throw new Error(`${row.source_key} failed ${JSON.stringify(checks)}`);
      return {sourceId:row.id,sourceKey:row.source_key,partition:row.partition,version:row.version,status:row.latest_status,contentHash:row.content_hash,originalContentHash:row.original_content_hash,scanResult:{safe:rescan.safe,codes:rescan.codes},persistedChunkCount:Number(row.persisted_chunk_count),prospectiveChunkCount:chunks.length,prospectiveChunks:chunks.map(chunk=>({index:chunk.index,heading:chunk.heading,contentHash:chunk.contentHash,characterCount:chunk.content.length,preview:chunk.content.length>240?`${chunk.content.slice(0,237)}...`:chunk.content})),checks};
    });
    const report={schemaVersion:"aeos.demo-advisory-rubric-drafts.v1",rubric:"DEMO_ADVISORY_RUBRIC_V1",recordedAt:new Date().toISOString(),organizationScoped:true,organizationName:"AEOS Hackathon Demo DAO",sourceCount:sources.length,allDraft:true,approvedSourceCount:0,persistedChunkCount:sources.reduce((sum,source)=>sum+source.persistedChunkCount,0),previewOnly:true,sources,assetExecutionAuthorized:false};
    report.reportHash=hash(report);
    const output=path.resolve(__dirname,"../../../reports/live-demo/demo-advisory-rubric-v1-drafts.json");await mkdir(path.dirname(output),{recursive:true});await writeFile(output,`${JSON.stringify(report,null,2)}\n`,"utf8");
    console.log(JSON.stringify({...report,reportPath:path.relative(path.resolve(__dirname,"../../.."),output).replaceAll("\\","/")}));
  }finally{client.release();await pool.end()}
}
main().catch(error=>{console.error(error.message);process.exit(1)});
