const {readFileSync}=require("node:fs");
const {resolve}=require("node:path");
require("dotenv").config({path:resolve(__dirname,"../../../.env"),quiet:true});
const {NestFactory}=require("@nestjs/core");
const {AppModule}=require("../dist/app.module");
const {DatabaseService}=require("../dist/database.service");

const fail=code=>{throw new Error(code)};
async function main(){
  const report=JSON.parse(readFileSync(resolve(process.env.AEOS_CONTENTFUL_DECISION_OUTPUT||resolve(__dirname,"../../../reports/live-demo/contentful-eight-agent-decision-v1.json")),"utf8"));
  if(report?.status!=="CONTENTFUL_DECISION_FROZEN"||report?.controls?.assetExecutionAuthorized!==false)fail("CONTENTFUL_DB_REPORT_INVALID");
  const app=await NestFactory.createApplicationContext(AppModule,{logger:false});
  try{
    const db=app.get(DatabaseService);
    const owner=await db.runAsSystem(()=>db.query("SELECT organization_id FROM decisions WHERE id=$1",[report.current.decisionId]));
    if(owner.rowCount!==1)fail("CONTENTFUL_DB_DECISION_MISSING");const org=owner.rows[0].organization_id;
    const context=await db.runAsSystem(()=>db.query("SELECT DISTINCT s.user_id,m.role FROM auth_sessions s JOIN memberships m ON m.organization_id=s.active_organization_id AND m.user_id=s.user_id AND m.status='ACTIVE' WHERE s.active_organization_id=$1 AND s.revoked_at IS NULL AND s.expires_at>now()",[org]));
    if(context.rowCount!==1)fail("CONTENTFUL_DB_TENANT_CONTEXT_AMBIGUOUS");const user=context.rows[0].user_id,role=context.rows[0].role;
    const run=work=>db.runWithTenant(org,user,role,work);
    const decision=await run(()=>db.query("SELECT id,recommendation,retrieval_bundle_hash,output_hash FROM decisions WHERE organization_id=$1 AND id=$2",[org,report.current.decisionId]));
    if(decision.rowCount!==1||decision.rows[0].retrieval_bundle_hash!==report.current.retrievalBundleHash||decision.rows[0].output_hash!==report.current.outputHash||decision.rows[0].recommendation.assetExecutionAuthorized!==false)fail("CONTENTFUL_DB_DECISION_MISMATCH");
    const manifests=await run(()=>db.query("SELECT role,status,items,manifest_hash FROM decision_retrieval_manifests WHERE organization_id=$1 AND decision_id=$2 ORDER BY CASE role WHEN 'Governor' THEN 1 WHEN 'Research' THEN 2 WHEN 'Strategy' THEN 3 WHEN 'Quant' THEN 4 WHEN 'Risk' THEN 5 WHEN 'Compliance' THEN 6 WHEN 'Portfolio' THEN 7 WHEN 'Treasury' THEN 8 END",[org,report.current.decisionId]));
    if(manifests.rowCount!==8||manifests.rows.some((row,index)=>row.status!=="SUPPORTED"||!row.items.length||row.manifest_hash!==report.current.manifests[index].manifestHash))fail("CONTENTFUL_DB_MANIFEST_MISMATCH");
    const historical=await run(()=>db.query("SELECT role,status,items FROM decision_retrieval_manifests WHERE organization_id=$1 AND decision_id=$2",[org,report.historical.decisionId]));
    if(historical.rowCount!==8||historical.rows.some(row=>row.status!=="INSUFFICIENT_CONTEXT"||row.items.length))fail("CONTENTFUL_DB_HISTORICAL_MUTATED");
    const counts=await run(()=>db.query("SELECT (SELECT count(*)::int FROM agent_runs WHERE organization_id=$1 AND decision_id=$2 AND run_state='SUCCEEDED') agent_runs,(SELECT count(*)::int FROM agent_messages WHERE organization_id=$1 AND decision_id=$2) a2a_messages,(SELECT count(*)::int FROM decision_challenges WHERE organization_id=$1 AND decision_id=$2) challenges,(SELECT count(*)::int FROM decision_evidence_gaps WHERE organization_id=$1 AND decision_id=$2) evidence_gaps,(SELECT count(*)::int FROM decisions WHERE organization_id=$1 AND parent_decision_id=$2) child_decisions",[org,report.current.decisionId]));
    if(counts.rows[0].agent_runs!==8||counts.rows[0].a2a_messages<1||counts.rows[0].challenges<2)fail("CONTENTFUL_DB_AGENT_LINEAGE_INVALID");
    const other=await db.runAsSystem(()=>db.query("SELECT id FROM organizations WHERE id<>$1 ORDER BY id LIMIT 1",[org]));
    if(other.rowCount!==1)fail("CONTENTFUL_DB_CROSS_TENANT_FIXTURE_REQUIRED");
    const hidden=await db.runWithTenant(other.rows[0].id,user,role,()=>db.query("SELECT id FROM decisions WHERE id=$1 UNION ALL SELECT id FROM decision_retrieval_manifests WHERE decision_id=$1",[report.current.decisionId]));
    if(hidden.rowCount!==0)fail("CONTENTFUL_DB_RLS_LEAK");
    const immutable=await run(()=>db.transaction(async client=>{await client.query("SAVEPOINT manifest_probe");try{await client.query("UPDATE decision_retrieval_manifests SET status='REFUSED' WHERE organization_id=$1 AND decision_id=$2",[org,report.current.decisionId]);return false}catch(error){await client.query("ROLLBACK TO SAVEPOINT manifest_probe");return error?.code==="P0001"}}));
    if(!immutable)fail("CONTENTFUL_DB_MANIFEST_MUTATION_NOT_BLOCKED");
    console.log(JSON.stringify({status:"CONTENTFUL_EIGHT_AGENT_DECISION_DB_VERIFIED",decisionId:report.current.decisionId,retrievalBundleHash:report.current.retrievalBundleHash,manifestCount:manifests.rowCount,supportedManifestCount:manifests.rows.filter(row=>row.status==="SUPPORTED").length,agentRuns:counts.rows[0].agent_runs,a2aMessages:counts.rows[0].a2a_messages,challenges:counts.rows[0].challenges,evidenceGaps:counts.rows[0].evidence_gaps,childDecisions:counts.rows[0].child_decisions,historicalImmutable:true,manifestMutationBlocked:true,crossTenantHidden:true,signature:false,broadcast:false,assetExecutionAuthorized:false},null,2));
  }finally{await app.close()}
}
main().catch(error=>{console.error(error instanceof Error?error.message:"CONTENTFUL_DB_VERIFY_FAILED");process.exit(1)});
