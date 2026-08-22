const { Pool } = require("pg");
const path = require("node:path");
const { DatabaseService } = require("../dist/database.service");
const { AlertService } = require("../dist/alert.service");

async function main(){
  if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is required");
  process.env.MIGRATIONS_DIR??=path.resolve(__dirname,"../../../infra/migrations");
  const migrations=new DatabaseService();await migrations.onModuleInit();await migrations.onModuleDestroy();
  const pool=new Pool({connectionString:process.env.DATABASE_URL});const client=await pool.connect();
  try{
    await client.query("BEGIN");
    await client.query("INSERT INTO organizations(id,name,status) VALUES('org_alert_a','Alert A','ACTIVE'),('org_alert_b','Alert B','ACTIVE')");
    await client.query("INSERT INTO users(id,wallet_address) VALUES('user_alert_a','0x7777777777777777777777777777777777777777')");
    await client.query("INSERT INTO memberships(id,organization_id,user_id,role,status) VALUES('membership_alert_a','org_alert_a','user_alert_a','GUARDIAN','ACTIVE')");
    await client.query("SET LOCAL ROLE aeos_app");
    await client.query("SELECT set_config('app.current_organization_id','org_alert_a',true),set_config('app.current_user_id','user_alert_a',true),set_config('app.current_membership_role','GUARDIAN',true),set_config('app.system_worker','off',true),set_config('app.current_request_id','trace_alert_1',true)");
    await client.query("INSERT INTO audit_events(id,organization_id,event_type,actor,action,object_type,object_id,data,payload_hash) VALUES('audit_alert_1','org_alert_a','evidence.rejected',jsonb_build_object('type','adapter'),'evidence.rejected','quarantine','q_alert_1',jsonb_build_object('reasonCode','INVALID_PROOF'),'0xalertsource')");
    const deliveries=Number((await client.query("SELECT count(*)::int AS count FROM outbox_deliveries WHERE event_id='evt_audit_alert_1'")).rows[0].count);
    await client.query("SELECT set_config('app.system_worker','on',true)");
    await client.query("UPDATE outbox_deliveries SET created_at='2000-01-01T00:00:00Z' WHERE event_id='evt_audit_alert_1' AND consumer='alert-rules-v1'");
    const workerDb={transaction:(work)=>work(client),runAsSystem:(work)=>work()};const service=new AlertService(workerDb);const processed=await service.processOnce();
    await client.query("SELECT set_config('app.system_worker','off',true)");
    const visible=Number((await client.query("SELECT count(*)::int AS count FROM alerts WHERE id='alert_evt_audit_alert_1'")).rows[0].count);
    const alert=(await client.query("SELECT * FROM alerts WHERE id='alert_evt_audit_alert_1'")).rows[0];
    await client.query("INSERT INTO alert_acknowledgements(id,alert_id,organization_id,acknowledged_by,note,note_hash,request_id) VALUES('alertack_db_1','alert_evt_audit_alert_1','org_alert_a','user_alert_a','reviewed','0xnote','trace_alert_1')");
    await client.query("SAVEPOINT immutable_alert");let alertImmutable=false;try{await client.query("UPDATE alerts SET severity='MEDIUM' WHERE id='alert_evt_audit_alert_1'")}catch(error){alertImmutable=String(error.message).includes("immutable");await client.query("ROLLBACK TO SAVEPOINT immutable_alert")}
    await client.query("SAVEPOINT immutable_ack");let acknowledgementImmutable=false;try{await client.query("DELETE FROM alert_acknowledgements WHERE id='alertack_db_1'")}catch(error){acknowledgementImmutable=String(error.message).includes("immutable");await client.query("ROLLBACK TO SAVEPOINT immutable_ack")}
    await client.query("SELECT set_config('app.current_organization_id','org_alert_b',true)");
    const crossTenantAlerts=Number((await client.query("SELECT count(*)::int AS count FROM alerts WHERE id='alert_evt_audit_alert_1'")).rows[0].count);const crossTenantAcks=Number((await client.query("SELECT count(*)::int AS count FROM alert_acknowledgements WHERE id='alertack_db_1'")).rows[0].count);
    const result={migrationApplied:(await pool.query("SELECT 1 FROM schema_migrations WHERE version='021_deterministic_alerts.sql'")).rowCount===1,twoConsumersEnqueued:deliveries===2,deterministicRuleProcessed:processed.status==="DELIVERED"&&processed.alertId==="alert_evt_audit_alert_1",alertTraceable:visible===1&&alert.source_event_id==="evt_audit_alert_1"&&alert.severity==="HIGH"&&alert.rule_version==="aeos-alert-rules.v1"&&alert.notification_adapter==="mock-local-v1",alertImmutable,acknowledgementImmutable,crossTenantHidden:crossTenantAlerts===0&&crossTenantAcks===0,authorityWithheld:processed.assetExecutionAuthorized===false};
    await client.query("ROLLBACK");
    if(!Object.values(result).every(value=>value===true))throw new Error(`Alert assertions failed: ${JSON.stringify(result)}`);
    console.log(JSON.stringify(result));
  }finally{client.release();await pool.end()}
}
main().catch(error=>{console.error(error);process.exit(1)});
