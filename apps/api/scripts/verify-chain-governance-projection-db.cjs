const path=require("node:path");
require("dotenv").config({path:path.resolve(__dirname,"../../../.env"),quiet:true});
const {DatabaseService}=require("../dist/database.service");
const {ProposalService}=require("../dist/proposal.service");

async function main(){
  if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL_REQUIRED");
  process.env.MIGRATIONS_DIR??=path.resolve(__dirname,"../../../infra/migrations");
  const db=new DatabaseService();await db.onModuleInit();
  try{
    const source=await db.runAsSystem(()=>db.query("SELECT id,organization_id,decision_id,content_hash FROM chain_governance_proposals ORDER BY created_at DESC LIMIT 1"));
    if(source.rowCount!==1)throw new Error("CHAIN_GOVERNANCE_PROJECTION_REQUIRED");
    const row=source.rows[0],service=new ProposalService(db);
    const own=await db.runWithTenant(row.organization_id,"projection-verifier","AUDITOR",()=>service.list(row.organization_id));
    const projected=own.items.find(item=>item.id===row.id);
    let crossTenantNotFound=false;
    await db.runWithTenant("org_cross_tenant_probe","projection-verifier","AUDITOR",async()=>{try{await service.get("org_cross_tenant_probe",row.id)}catch(error){crossTenantNotFound=error?.status===404}});
    const audit=await db.runAsSystem(()=>db.query("SELECT count(*)::int count FROM audit_events WHERE organization_id=$1 AND object_type='chain_governance_proposal' AND object_id=$2",[row.organization_id,row.id]));
    const result={migrationApplied:(await db.runAsSystem(()=>db.query("SELECT 1 FROM schema_migrations WHERE version='058_chain_governance_proposal_projection.sql'"))).rowCount===1,tenantProjectionVisible:Boolean(projected),canonicalFinalityExposed:projected?.recordSource==="CHAIN_FINALITY"&&projected?.onchainFinalityVerified===true,decisionLineageBound:projected?.decisionId===row.decision_id&&projected?.contentHash===row.content_hash,crossTenantNotFound,audited:Number(audit.rows[0].count)===1,authorityWithheld:projected?.assetExecutionAuthorized===false,assetExecutionAuthorized:false};
    if(!Object.entries(result).filter(([key])=>key!=="assetExecutionAuthorized").every(([,value])=>value===true)||result.assetExecutionAuthorized!==false)throw new Error(`CHAIN_GOVERNANCE_PROJECTION_ASSERTIONS_FAILED:${JSON.stringify(result)}`);
    console.log(JSON.stringify(result,null,2));
  }finally{await db.onModuleDestroy()}
}
main().catch(error=>{console.error(error instanceof Error?error.message:"CHAIN_GOVERNANCE_PROJECTION_VERIFICATION_FAILED");process.exit(1)});
