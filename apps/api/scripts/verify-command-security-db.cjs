const { Pool } = require("pg");
const { lastValueFrom, of } = require("rxjs");
const path = require("node:path");
const { DatabaseService } = require("../dist/database.service");
const { IdempotencyInterceptor } = require("../dist/idempotency.interceptor");
const { consumeDatabaseRateLimit } = require("../dist/rate-limit-engine");
const { MockOutboxPublisher, OutboxDispatcherService } = require("../dist/outbox-publisher");

const contextFor = (request, response) => ({
  switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  getHandler: () => function handler() {}, getClass: () => class Controller {}
});

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  process.env.MIGRATIONS_DIR ??= path.resolve(__dirname, "../../../infra/migrations");
  const migrations = new DatabaseService(); await migrations.onModuleInit(); await migrations.onModuleDestroy();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL }); const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO organizations(id,name,status) VALUES('org_command_security','Command Security Integration','ACTIVE')");
    await client.query("INSERT INTO users(id,wallet_address) VALUES('user_command_security','0x9999999999999999999999999999999999999999')");
    await client.query("INSERT INTO memberships(id,organization_id,user_id,role,status) VALUES('membership_command_security','org_command_security','user_command_security','ADMIN','ACTIVE')");
    await client.query("SET LOCAL ROLE aeos_app");
    await client.query("SELECT set_config('app.current_organization_id','org_command_security',true),set_config('app.current_user_id','user_command_security',true),set_config('app.current_membership_role','ADMIN',true),set_config('app.system_worker','off',true),set_config('app.current_request_id','trace_integration_1',true)");
    const db = { query: (text, values = []) => client.query(text, values) };
    const reflector = { getAllAndOverride: () => true };
    const request = { method:"POST",originalUrl:"/api/v1/proposals",headers:{"idempotency-key":"integration-command-1"},body:{title:"Frozen input"},auth:{userId:"user_command_security",activeOrganizationId:"org_command_security"} };
    const firstResponse = { statusCode:201,status(){},setHeader(){} };
    const first = await lastValueFrom(await new IdempotencyInterceptor(db,reflector).intercept(contextFor(request,firstResponse),{handle:()=>of({id:"proposal_command_security",assetExecutionAuthorized:false})}));
    let replayStatus; let replayHeader;
    const replayResponse = { statusCode:200,status(value){replayStatus=value;return this},setHeader(name,value){replayHeader=`${name}:${value}`} };
    const replay = await lastValueFrom(await new IdempotencyInterceptor(db,reflector).intercept(contextFor(request,replayResponse),{handle:()=>{throw new Error("handler must not run on replay")}}));
    let mismatchRejected=false;
    try { await new IdempotencyInterceptor(db,reflector).intercept(contextFor({...request,body:{title:"Mutated input"}},replayResponse),{handle:()=>of(null)}); }
    catch(error){ mismatchRejected=error.status===409; }
    await consumeDatabaseRateLimit(db,"integration-subject","integration.action",1,600);
    let rateLimited=false;
    try { await consumeDatabaseRateLimit(db,"integration-subject","integration.action",1,600); }
    catch(error){ rateLimited=error.status===429; }
    const stored=(await client.query("SELECT request_hash,response_body,state FROM idempotency_records WHERE scope_id='org_command_security'")).rows[0];
    await client.query("INSERT INTO audit_events(id,organization_id,event_type,actor,action,object_type,object_id,data,payload_hash) VALUES('audit_command_security','org_command_security','integration.trace',jsonb_build_object('type','system'),'integration.trace','request_trace','trace_integration_1','{}','0xtrace')");
    const auditRequestId=(await client.query("SELECT request_id FROM audit_events WHERE id='audit_command_security'")).rows[0].request_id;
    const outboxEvent=(await client.query("SELECT * FROM outbox_events WHERE id='evt_audit_command_security'")).rows[0];
    await client.query("SAVEPOINT outbox_immutable");let outboxImmutable=false;try{await client.query("UPDATE outbox_events SET data='{}'::jsonb WHERE id='evt_audit_command_security'")}catch(error){outboxImmutable=String(error.message).includes("immutable");await client.query("ROLLBACK TO SAVEPOINT outbox_immutable")}
    await client.query("SELECT set_config('app.current_organization_id','org_other',true)");
    const crossTenantCount=Number((await client.query("SELECT count(*)::int AS count FROM idempotency_records WHERE scope_id='org_command_security'")).rows[0].count);
    const crossTenantOutbox=Number((await client.query("SELECT count(*)::int AS count FROM outbox_events WHERE id='evt_audit_command_security'")).rows[0].count);
    await client.query("SELECT set_config('app.current_organization_id','org_command_security',true),set_config('app.system_worker','on',true)");
    await client.query("UPDATE outbox_deliveries SET status='CLAIMED',attempts=1,claim_token='crashed_claim',lease_expires_at=now()-interval '1 second',created_at='2000-01-01T00:00:00Z',updated_at=now() WHERE event_id='evt_audit_command_security' AND consumer='mock-observer-v1'");
    const dispatcherDb={query:(text,values=[])=>client.query(text,values),transaction:(work)=>work(client),runAsSystem:(work)=>work()};const dispatcher=new OutboxDispatcherService(dispatcherDb,new MockOutboxPublisher());const delivered=await dispatcher.dispatchOnce();const replayDispatch=await dispatcher.dispatchOnce();const receipts=Number((await client.query("SELECT count(*)::int AS count FROM outbox_consumer_receipts WHERE event_id='evt_audit_command_security'")).rows[0].count);
    await client.query("SAVEPOINT receipt_immutable");let receiptImmutable=false;try{await client.query("UPDATE outbox_consumer_receipts SET receipt_hash='mutated' WHERE event_id='evt_audit_command_security'")}catch(error){receiptImmutable=String(error.message).includes("immutable");await client.query("ROLLBACK TO SAVEPOINT receipt_immutable")}
    const result={migrationApplied:(await pool.query("SELECT 1 FROM schema_migrations WHERE version='020_transactional_outbox.sql'")).rowCount===1,responseIdentityPreserved:first.id===replay.id&&replayStatus===201&&replayHeader==="Idempotency-Replayed:true",mismatchRejected,rateLimited,hashedInputOnly:stored.request_hash.startsWith("0x")&&!JSON.stringify(stored).includes("Frozen input"),completedState:stored.state==="COMPLETED",auditRequestLinked:auditRequestId==="trace_integration_1",outboxSameTransaction:outboxEvent&&outboxEvent.request_id==="trace_integration_1"&&outboxEvent.type==="integration.trace",outboxImmutable,leaseRecovered:delivered.status==="DELIVERED"&&delivered.attempts===2,consumerIdempotent:receipts===1&&replayDispatch.eventId!=="evt_audit_command_security",receiptImmutable,crossTenantHidden:crossTenantCount===0&&crossTenantOutbox===0,authorityWithheld:first.assetExecutionAuthorized===false&&delivered.assetExecutionAuthorized===false};
    await client.query("ROLLBACK");
    if(!Object.values(result).every((value)=>value===true))throw new Error(`Command security assertions failed: ${JSON.stringify(result)}`);
    console.log(JSON.stringify(result));
  } finally { client.release(); await pool.end(); }
}
main().catch((error)=>{console.error(error);process.exit(1)});
