const path = require("node:path");
const { Pool } = require("pg");
const { DatabaseService } = require("../dist/database.service");
const { PolicyService } = require("../dist/policy.service");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  process.env.MIGRATIONS_DIR ??= path.resolve(__dirname, "../../../infra/migrations");
  const migrations = new DatabaseService(); await migrations.onModuleInit(); await migrations.onModuleDestroy();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL }); const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO organizations(id,name,status) VALUES('org_backtest_a','Backtest A','ACTIVE'),('org_backtest_b','Backtest B','ACTIVE')");
    await client.query("INSERT INTO users(id,wallet_address) VALUES('user_backtest_a','0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')");
    await client.query("INSERT INTO memberships(id,organization_id,user_id,role,status) VALUES('membership_backtest_a','org_backtest_a','user_backtest_a','TREASURY_COMMITTEE','ACTIVE')");
    const baseConfig = { minimumEvidenceQuality: 80, targetAllocationBps: 4000, pid: { kpBps: 5000, kiBps: 1000, kdBps: 0, deadbandBps: 25, maxAdjustmentBps: 500, integralLimitBps: 2000 }, riskLimits: { maxSingleAdjustmentBps: 500, maxSlippageBps: 100, minLiquidityUsd: "100000", maxDailyTurnoverUsd: "50000", allowedTargetContracts: ["0x1111111111111111111111111111111111111111"], allowedFunctionSelectors: ["0x12345678"] } };
    await client.query("INSERT INTO policy_versions(id,organization_id,version,name,status,schema_version,config,content_hash) VALUES('policy_backtest_1','org_backtest_a',1,'Backtest 1','RETIRED','treasury.policy.v1',$1,'0xpolicy1'),('policy_backtest_2','org_backtest_a',2,'Backtest 2','DRAFT','treasury.policy.v1',$2,'0xpolicy2')", [baseConfig, { ...baseConfig, pid: { ...baseConfig.pid, kpBps: 3500, kiBps: 500 } }]);
    await client.query("SET LOCAL ROLE aeos_app");
    await client.query("SELECT set_config('app.current_organization_id','org_backtest_a',true),set_config('app.current_user_id','user_backtest_a',true),set_config('app.current_membership_role','TREASURY_COMMITTEE',true),set_config('app.system_worker','off',true)");
    const db = { query: (text, values = []) => client.query(text, values), transaction: (work) => work(client) };
    const service = new PolicyService(db);
    const first = await service.compareScenarios("org_backtest_a", ["policy_backtest_1", "policy_backtest_2"], "user_backtest_a");
    const replay = await service.compareScenarios("org_backtest_a", ["policy_backtest_2", "policy_backtest_1"], "user_backtest_a");
    await client.query("SAVEPOINT immutable_check"); let immutable = false;
    try { await client.query("UPDATE policy_scenario_comparisons SET result='{}'::jsonb WHERE id=$1", [first.id]); }
    catch (error) { immutable = String(error.message).includes("immutable"); await client.query("ROLLBACK TO SAVEPOINT immutable_check"); }
    await client.query("SELECT set_config('app.current_organization_id','org_backtest_b',true)");
    const crossTenantRows = Number((await client.query("SELECT count(*)::int AS count FROM policy_scenario_comparisons WHERE id=$1", [first.id])).rows[0].count);
    const result = { migrationApplied: (await pool.query("SELECT 1 FROM schema_migrations WHERE version='023_policy_scenario_comparisons.sql'")).rowCount === 1, deterministicReplay: first.id === replay.id && first.inputHash === replay.inputHash && first.resultHash === replay.resultHash, allScenariosPresent: first.result.policies.every((policy) => policy.scenarios.length === 8), immutable, crossTenantHidden: crossTenantRows === 0, syntheticClearlyMarked: first.result.historicalEvidenceUsed === false && first.result.sourceMode === "SYNTHETIC_DETERMINISTIC", authorityWithheld: first.result.calibrationAidOnly === true && first.result.governanceApprovalRequired === true && first.result.assetExecutionAuthorized === false };
    await client.query("ROLLBACK");
    if (!Object.values(result).every((value) => value === true)) throw new Error(`Policy backtest assertions failed: ${JSON.stringify(result)}`);
    console.log(JSON.stringify(result));
  } finally { client.release(); await pool.end(); }
}
main().catch((error) => { console.error(error); process.exit(1); });
