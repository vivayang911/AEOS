const path=require("node:path");
const{Pool}=require("pg");
const{DatabaseService}=require("../dist/database.service");
const{CockpitStreamAdmissionService}=require("../dist/cockpit-stream-admission.service");

async function main(){
  process.env.DATABASE_URL??="postgresql://aeos:aeos@127.0.0.1:5432/aeos";
  process.env.MIGRATIONS_DIR??=path.resolve(__dirname,"../../../infra/migrations");
  process.env.COCKPIT_SSE_MAX_PER_ORGANIZATION="2";
  process.env.COCKPIT_SSE_MAX_TOTAL="3";
  const db=new DatabaseService();await db.onModuleInit();
  const suffix=Date.now().toString(36),orgA=`org_sse_${suffix}_a`,orgB=`org_sse_${suffix}_b`,orgC=`org_sse_${suffix}_c`;
  const serviceA=new CockpitStreamAdmissionService(db),serviceB=new CockpitStreamAdmissionService(db);
  let leases=[];
  try{
    await db.runAsSystem(()=>db.query("INSERT INTO organizations(id,name,status)VALUES($1,'SSE A','ACTIVE'),($2,'SSE B','ACTIVE'),($3,'SSE C','ACTIVE')",[orgA,orgB,orgC]));
    await db.runAsSystem(()=>db.query("INSERT INTO cockpit_stream_leases(connection_id,organization_id,instance_id,expires_at)VALUES(gen_random_uuid(),$1,gen_random_uuid(),now()-interval '1 second')",[orgC]));
    const a1=await serviceA.acquire(orgA),a2=await serviceB.acquire(orgA),a3=await serviceA.acquire(orgA);
    const b1=await serviceB.acquire(orgB),cBlocked=await serviceA.acquire(orgC);
    leases=[a1,a2,b1].filter(Boolean);
    const expiredReclaimed=Number((await db.runAsSystem(()=>db.query("SELECT count(*)::int count FROM cockpit_stream_leases WHERE organization_id=$1 AND expires_at<=now()",[orgC]))).rows[0].count)===0;
    const pool=new Pool({connectionString:process.env.DATABASE_URL}),client=await pool.connect();let crossTenantHidden=false;
    try{
      await client.query("BEGIN");await client.query("SET LOCAL ROLE aeos_app");
      await client.query("SELECT set_config('app.current_organization_id',$1,true),set_config('app.current_user_id','fixture',true),set_config('app.current_membership_role','AUDITOR',true),set_config('app.system_worker','off',true)",[orgB]);
      const visible=await client.query("SELECT organization_id,asset_execution_authorized,advisory_only FROM cockpit_stream_leases");
      crossTenantHidden=visible.rows.length===1&&visible.rows.every(row=>row.organization_id===orgB&&row.asset_execution_authorized===false&&row.advisory_only===true);
      await client.query("ROLLBACK");
    }finally{client.release();await pool.end()}
    await a1.release();const cAfterRelease=await serviceA.acquire(orgC);if(cAfterRelease)leases.push(cAfterRelease);
    const result={migrationApplied:(await db.runAsSystem(()=>db.query("SELECT 1 FROM schema_migrations WHERE version='042_cockpit_stream_leases.sql'"))).rowCount===1,perOrganizationShared:a1!==null&&a2!==null&&a3===null,globalShared:b1!==null&&cBlocked===null,releaseReopensCapacity:cAfterRelease!==null,expiredReclaimed,crossTenantHidden,leaseAuthorityWithheld:leases.every(lease=>lease.assetExecutionAuthorized===false&&lease.advisoryOnly===true),assetExecutionAuthorized:false};
    if(!Object.entries(result).filter(([key])=>key!=="assetExecutionAuthorized").every(([,value])=>value===true)||result.assetExecutionAuthorized!==false)throw new Error(`Cockpit shared admission assertions failed: ${JSON.stringify(result)}`);
    console.log(JSON.stringify(result));
  }finally{
    for(const lease of leases)await lease.release().catch(()=>undefined);
    await db.runAsSystem(()=>db.query("DELETE FROM organizations WHERE id=ANY($1::text[])",[[orgA,orgB,orgC]])).catch(()=>undefined);
    await db.onModuleDestroy();
  }
}
main().catch(error=>{console.error(error);process.exit(1)});
