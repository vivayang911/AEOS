const { Pool }=require("pg");
const path=require("node:path");
const { DatabaseService }=require("../dist/database.service");
const { AuditExportService }=require("../dist/audit-export.service");

async function main(){
  if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is required");process.env.MIGRATIONS_DIR??=path.resolve(__dirname,"../../../infra/migrations");const migrations=new DatabaseService();await migrations.onModuleInit();await migrations.onModuleDestroy();
  const pool=new Pool({connectionString:process.env.DATABASE_URL});const client=await pool.connect();
  try{
    await client.query("BEGIN");await client.query("INSERT INTO organizations(id,name,status) VALUES('org_export_a','Export A','ACTIVE'),('org_export_b','Export B','ACTIVE')");await client.query("INSERT INTO users(id,wallet_address) VALUES('user_export_a','0x8888888888888888888888888888888888888888')");await client.query("INSERT INTO memberships(id,organization_id,user_id,role,status) VALUES('membership_export_a','org_export_a','user_export_a','AUDITOR','ACTIVE')");
    await client.query("SET LOCAL ROLE aeos_app");await client.query("SELECT set_config('app.current_organization_id','org_export_a',true),set_config('app.current_user_id','user_export_a',true),set_config('app.current_membership_role','AUDITOR',true),set_config('app.system_worker','off',true),set_config('app.current_request_id','trace_export_1',true)");
    for(const [id,version] of [["audit_export_source_1",1],["audit_export_source_2",2]])await client.query("INSERT INTO audit_events(id,organization_id,event_type,actor,action,object_type,object_id,data,payload_hash,created_at) VALUES($1,'org_export_a','policy.activated',jsonb_build_object('type','human','id','user_export_a'),'policy.activated','policy',$2,jsonb_build_object('version',$3::int),$4,$5)",[id,`policy_${version}`,version,`0xsource${version}`,`2026-08-07T00:00:0${version}Z`]);
    const db={transaction:(work)=>work(client),query:(text,values=[])=>client.query(text,values)};const service=new AuditExportService(db);const first=await service.create("org_export_a","user_export_a",{eventType:"policy.activated"});const replay=await service.create("org_export_a","user_export_a",{eventType:"policy.activated"});const verification=await service.verify("org_export_a",first.id);
    const exportAuditCount=Number((await client.query("SELECT count(*)::int AS count FROM audit_events WHERE organization_id='org_export_a' AND event_type='audit.export_created'")).rows[0].count);
    await client.query("SAVEPOINT export_immutable");let exportImmutable=false;try{await client.query("UPDATE audit_exports SET manifest='{}'::jsonb WHERE id=$1",[first.id])}catch(error){exportImmutable=String(error.message).includes("immutable");await client.query("ROLLBACK TO SAVEPOINT export_immutable")}
    await client.query("SELECT set_config('app.current_organization_id','org_export_b',true)");const crossTenant=Number((await client.query("SELECT count(*)::int AS count FROM audit_exports WHERE id=$1",[first.id])).rows[0].count);
    const result={migrationApplied:(await pool.query("SELECT 1 FROM schema_migrations WHERE version='022_immutable_audit_exports.sql'")).rowCount===1,deterministicManifest:first.id===replay.id&&first.manifestHash===replay.manifestHash&&first.eventCount===2,sourceVerified:verification.verified===true&&verification.storedManifestValid===true&&verification.sourceEventsMatch===true,creationAuditedOnce:exportAuditCount===1,exportImmutable,crossTenantHidden:crossTenant===0,authorityWithheld:first.assetExecutionAuthorized===false&&verification.assetExecutionAuthorized===false};await client.query("ROLLBACK");if(!Object.values(result).every(value=>value===true))throw new Error(`Audit export assertions failed: ${JSON.stringify(result)}`);console.log(JSON.stringify(result));
  }finally{client.release();await pool.end()}
}
main().catch(error=>{console.error(error);process.exit(1)});
