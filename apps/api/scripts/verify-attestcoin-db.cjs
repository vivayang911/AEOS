const { Pool } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const migration = await client.query("SELECT 1 FROM schema_migrations WHERE version='006_attestcoin_usc.sql'");
    await client.query("BEGIN");
    await client.query("INSERT INTO organizations(id,name) VALUES('org_usc_integration','USC Integration') ON CONFLICT DO NOTHING");
    await client.query("INSERT INTO attestcoin_proof_jobs(id,organization_id,adapter,source_chain_id,source_chain_key,source_tx_hash,requester_wallet,status,source_snapshot,source_snapshot_hash) VALUES('uscjob_integration','org_usc_integration','fake-usc',11155111,1,'0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','0x444d510728fb8072351cb5d0e88432e6a8501dfa','RECEIPT_VERIFIED','{\"blockNumber\":1}'::jsonb,'0xsource')");
    const isolated = await client.query("SELECT count(*)::int AS count FROM attestcoin_proof_jobs WHERE organization_id='org_other' AND id='uscjob_integration'");
    await client.query("SAVEPOINT immutable_test");
    let immutableTriggerRejected = false;
    try { await client.query("UPDATE attestcoin_proof_jobs SET source_snapshot='{\"blockNumber\":2}'::jsonb WHERE id='uscjob_integration'"); }
    catch (error) { immutableTriggerRejected = String(error.message).includes("immutable"); await client.query("ROLLBACK TO SAVEPOINT immutable_test"); }
    await client.query("ROLLBACK");
    const result = { migrationApplied: migration.rowCount === 1, crossTenantRows: isolated.rows[0].count, immutableTriggerRejected };
    if (!result.migrationApplied || result.crossTenantRows !== 0 || !result.immutableTriggerRejected) throw new Error(`Integration assertions failed: ${JSON.stringify(result)}`);
    console.log(JSON.stringify(result));
  } finally { client.release(); await pool.end(); }
}

main().catch((error) => { console.error(error); process.exit(1); });
