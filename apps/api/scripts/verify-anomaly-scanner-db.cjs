const path = require("node:path");
const { Pool } = require("pg");
const { DatabaseService } = require("../dist/database.service");
const { AnomalyScannerService } = require("../dist/anomaly-scanner.service");
const { AlertService } = require("../dist/alert.service");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  process.env.MIGRATIONS_DIR ??= path.resolve(__dirname, "../../../infra/migrations"); const migrations = new DatabaseService(); await migrations.onModuleInit(); await migrations.onModuleDestroy();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL }); const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO organizations(id,name,status) VALUES('org_anomaly_a','Anomaly A','ACTIVE'),('org_anomaly_b','Anomaly B','ACTIVE')");
    await client.query("INSERT INTO users(id,wallet_address) VALUES('user_anomaly_a','0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')");
    await client.query("INSERT INTO memberships(id,organization_id,user_id,role,status) VALUES('membership_anomaly_a','org_anomaly_a','user_anomaly_a','GUARDIAN','ACTIVE')");
    await client.query("INSERT INTO raw_attestations(id,organization_id,provider,chain_id,payload,content_hash) VALUES('raw_anomaly_1','org_anomaly_a','fixture',1,'{}','0xrawanomaly')");
    await client.query("INSERT INTO evidence(id,organization_id,raw_attestation_id,subject,predicate,value,chain,source,verification_status,freshness_status,freshness_expires_at,quality_score,quality_components,observed_at,content_hash) VALUES('ev_anomaly_stale','org_anomaly_a','raw_anomaly_1','{}','fixture','{}','{}','{}','VERIFIED','FRESH','2026-08-07T00:00:00Z',100,'{}','2026-08-06T23:00:00Z','0xevidenceanomaly')");
    const config1 = { governorAddress: "0x1111111111111111111111111111111111111111", timelockAddress: "0x2222222222222222222222222222222222222222", safeAddress: "0x3333333333333333333333333333333333333333", treasuryGuardAddress: "0x4444444444444444444444444444444444444444" };
    const config2 = { ...config1, safeAddress: "0x5555555555555555555555555555555555555555" }; const inspection = { blockNumber: 100, blockHash: `0x${"11".repeat(32)}`, contracts: { treasuryGuardAddress: { paused: true } } };
    await client.query("INSERT INTO organization_configuration_versions(id,organization_id,version,config,content_hash,inspection,activated_by) VALUES('config_anomaly_1','org_anomaly_a',1,$1,'0xconfiganomaly1',$3,'user_anomaly_a'),('config_anomaly_2','org_anomaly_a',2,$2,'0xconfiganomaly2',$3,'user_anomaly_a')", [config1, config2, inspection]);
    await client.query("SET LOCAL ROLE aeos_app"); await client.query("SELECT set_config('app.current_organization_id','org_anomaly_a',true),set_config('app.current_user_id','user_anomaly_a',true),set_config('app.current_membership_role','GUARDIAN',true),set_config('app.system_worker','on',true)");
    const db = { query: (text, values = []) => client.query(text, values), transaction: (work) => work(client), runAsSystem: (work) => work() };
    const scanner = new AnomalyScannerService(db); const first = await scanner.scanOnce(new Date("2026-08-07T01:00:00Z")); const replay = await scanner.scanOnce(new Date("2026-08-07T01:01:00Z"));
    const auditRows = await client.query("SELECT event_type,data FROM audit_events WHERE organization_id='org_anomaly_a' AND actor->>'id'='anomaly-scanner-v1' ORDER BY event_type");
    const alerts = new AlertService(db); for (let i = 0; i < 10; i += 1) { if ((await alerts.processOnce("org_anomaly_a")).status === "IDLE") break; }
    const alertRows = await client.query("SELECT source_event_type,severity,details FROM alerts WHERE organization_id='org_anomaly_a' AND source_event_type IN('evidence.stale','organization.permission_changed','treasury_guard.paused') ORDER BY source_event_type");
    await client.query("SELECT set_config('app.current_organization_id','org_anomaly_b',true),set_config('app.system_worker','off',true)"); const crossTenant = Number((await client.query("SELECT count(*)::int AS count FROM alerts WHERE source_event_type IN('evidence.stale','organization.permission_changed','treasury_guard.paused')")).rows[0].count);
    const eventTypes=auditRows.rows.map(row=>row.event_type);const result = { staleProduced: eventTypes.includes("evidence.stale"), permissionProduced: eventTypes.includes("organization.permission_changed"), pauseProduced: eventTypes.includes("treasury_guard.paused"), deterministicReplay: auditRows.rowCount === 3 && new Set(eventTypes).size === 3 && first.emitted >= 3, outboxToAlerts: alertRows.rowCount === 3, prioritiesCorrect: alertRows.rows.find((row) => row.source_event_type === "treasury_guard.paused")?.severity === "CRITICAL" && alertRows.rows.filter((row) => row.source_event_type !== "treasury_guard.paused").every((row) => row.severity === "HIGH"), provenanceFrozen: auditRows.rows.every((row) => row.data.detectedFrom === "IMMUTABLE_STORED_STATE" && row.data.assetExecutionAuthorized === false), crossTenantHidden: crossTenant === 0, authorityWithheld: alertRows.rows.every((row) => row.details.assetExecutionAuthorized === false) };
    await client.query("ROLLBACK"); if (!Object.values(result).every((value) => value === true)) throw new Error(`Anomaly scanner assertions failed: ${JSON.stringify({result,first,replay,auditEventTypes:eventTypes})}`); console.log(JSON.stringify(result));
  } finally { client.release(); await pool.end(); }
}
main().catch((error) => { console.error(error); process.exit(1); });
