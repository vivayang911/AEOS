const path = require("node:path");
const { Pool } = require("pg");
const { DatabaseService } = require("../dist/database.service");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  process.env.MIGRATIONS_DIR ??= path.resolve(__dirname, "../../../infra/migrations");
  const migrations = new DatabaseService();
  await migrations.onModuleInit();
  await migrations.onModuleDestroy();

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const migration = await client.query("SELECT 1 FROM schema_migrations WHERE version='026_eight_agent_a2a.sql'");
    await client.query("BEGIN");
    await client.query("INSERT INTO organizations(id,name,status) VALUES('org_a2a_a','A2A A','ACTIVE'),('org_a2a_b','A2A B','ACTIVE')");
    await client.query("INSERT INTO policy_versions(id,organization_id,version,config,content_hash,status) VALUES('policy_a2a_a','org_a2a_a',1,'{}','0xpolicy_a','ACTIVE'),('policy_a2a_b','org_a2a_b',1,'{}','0xpolicy_b','ACTIVE')");
    await client.query("INSERT INTO evidence_snapshots(id,organization_id,evidence_ids,manifest,manifest_hash,query) VALUES('snap_a2a_a','org_a2a_a','[]','[]','0xsnap_a','{}'),('snap_a2a_b','org_a2a_b','[]','[]','0xsnap_b','{}')");
    await client.query("INSERT INTO decisions(id,organization_id,objective,policy_version_id,evidence_snapshot_id,provider,schema_version,status,recommendation,input_hash,output_hash) VALUES('decision_a2a_a','org_a2a_a','A','policy_a2a_a','snap_a2a_a','fixture','decision.recommendation.v3','REVIEW_REQUIRED','{}','0xinput_a','0xoutput_a'),('decision_a2a_b','org_a2a_b','B','policy_a2a_b','snap_a2a_b','fixture','decision.recommendation.v3','REVIEW_REQUIRED','{}','0xinput_b','0xoutput_b')");
    await client.query("INSERT INTO agent_messages(id,organization_id,decision_id,ordinal,round,sender_role,recipient_role,message_type,code,content,evidence_ids,input_hash,content_hash) VALUES('message_a2a_a','org_a2a_a','decision_a2a_a',0,1,'Governor','Research','REQUEST','RESEARCH','Review Evidence','[]','0xinput_a','0xmessage_a'),('message_a2a_b','org_a2a_b','decision_a2a_b',0,1,'Governor','Research','REQUEST','RESEARCH','Review Evidence','[]','0xinput_b','0xmessage_b')");

    await client.query("SAVEPOINT immutable_test");
    let immutable = false;
    try { await client.query("UPDATE agent_messages SET content='mutated' WHERE id='message_a2a_a'"); }
    catch (error) { immutable = String(error.message).includes("immutable"); await client.query("ROLLBACK TO SAVEPOINT immutable_test"); }

    await client.query("SET LOCAL ROLE aeos_app");
    await client.query("SELECT set_config('app.current_organization_id','org_a2a_a',true),set_config('app.current_user_id','',true),set_config('app.current_membership_role','ADMIN',true),set_config('app.system_worker','off',true)");
    const ownRows = Number((await client.query("SELECT count(*)::int AS count FROM agent_messages")).rows[0].count);
    const otherRows = Number((await client.query("SELECT count(*)::int AS count FROM agent_messages WHERE organization_id='org_a2a_b'")).rows[0].count);
    await client.query("SAVEPOINT cross_tenant_write");
    let crossTenantWriteRejected = false;
    try { await client.query("INSERT INTO agent_messages(id,organization_id,decision_id,ordinal,round,sender_role,recipient_role,message_type,code,content,evidence_ids,input_hash,content_hash) VALUES('message_a2a_attack','org_a2a_b','decision_a2a_b',1,1,'Research','Strategy','RESPONSE','ATTACK','cross tenant','[]','0xattack','0xattack')"); }
    catch (error) { crossTenantWriteRejected = error.code === "42501"; await client.query("ROLLBACK TO SAVEPOINT cross_tenant_write"); }
    await client.query("SELECT set_config('app.current_organization_id','',true),set_config('app.current_membership_role','',true)");
    const unscopedRows = Number((await client.query("SELECT count(*)::int AS count FROM agent_messages")).rows[0].count);
    await client.query("ROLLBACK");

    const result = {migrationApplied:migration.rowCount===1,immutable,ownOrganizationVisible:ownRows===1,crossTenantReadHidden:otherRows===0,crossTenantWriteRejected,missingContextFailsClosed:unscopedRows===0,assetExecutionAuthorized:false};
    if (!Object.entries(result).filter(([key])=>key!=="assetExecutionAuthorized").every(([,value])=>value===true) || result.assetExecutionAuthorized!==false) throw new Error(`Eight-Agent database assertions failed: ${JSON.stringify(result)}`);
    console.log(JSON.stringify(result));
  } finally { client.release(); await pool.end(); }
}

main().catch((error) => { console.error(error); process.exit(1); });
