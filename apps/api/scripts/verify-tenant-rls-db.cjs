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
    await client.query("BEGIN");
    await client.query("INSERT INTO organizations(id,name,status) VALUES('org_rls_a','RLS A','ACTIVE'),('org_rls_b','RLS B','ACTIVE')");
    await client.query("INSERT INTO users(id,wallet_address) VALUES('user_rls_a','0x1111111111111111111111111111111111111111'),('user_rls_b','0x2222222222222222222222222222222222222222')");
    await client.query("INSERT INTO memberships(id,organization_id,user_id,role,status) VALUES('membership_rls_a','org_rls_a','user_rls_a','ADMIN','ACTIVE'),('membership_rls_b','org_rls_b','user_rls_b','ADMIN','ACTIVE')");
    await client.query("INSERT INTO raw_attestations(id,organization_id,provider,chain_id,payload,content_hash) VALUES('raw_rls_a','org_rls_a','rls-fixture',1,'{}','0xrlsa'),('raw_rls_b','org_rls_b','rls-fixture',1,'{}','0xrlsb')");

    const role = (await client.query("SELECT rolbypassrls,rolsuper FROM pg_roles WHERE rolname='aeos_app'")).rows[0];
    const expectedTables = 65;
    const tenantTables=['organizations','memberships','raw_attestations','evidence','evidence_quarantine','evidence_snapshots','audit_events','policy_versions','decisions','agent_runs','agent_messages','decision_claims','decision_challenges','decision_reviews','decision_jobs','attestcoin_proof_jobs','evidence_anchor_handoffs','evidence_anchor_confirmations','evidence_anchor_confirmation_attempts','policy_simulations','proposals','proposal_state_observations','execution_preflights','safe_transaction_observations','execution_reconciliation_attempts','organization_configuration_requests','organization_configuration_versions','idempotency_records','outbox_events','outbox_deliveries','outbox_consumer_receipts','alerts','alert_acknowledgements','audit_exports','policy_scenario_comparisons','provider_call_observations','knowledge_sources','knowledge_source_events','knowledge_chunks','organization_memories','memory_events','decision_retrieval_manifests','evidence_classifications','evidence_requests','evidence_request_events','decision_evidence_gaps','decision_evidence_gap_links','treasury_workflows','treasury_workflow_events','treasury_registry_versions','treasury_registry_events','adaptive_pid_snapshots','governed_skill_versions','governed_skill_version_events','governed_skill_backtests','treasury_outcome_assessments','treasury_transaction_cost_assessments','counterfactual_methodology_versions','counterfactual_methodology_events','treasury_counterfactual_assessments','outcome_memory_candidates','outcome_memory_candidate_reviews','outcome_memory_candidate_events','outcome_memory_promotions','outcome_memory_retirements'];
    const policies = await client.query("SELECT count(DISTINCT tablename)::int AS count FROM pg_policies WHERE schemaname='public' AND tablename=ANY($1::text[])",[tenantTables]);
    const enabled = await client.query("SELECT count(*)::int AS count FROM pg_class WHERE relrowsecurity AND relname=ANY($1::text[])",[tenantTables]);

    await client.query("SET LOCAL ROLE aeos_app");
    await client.query("SELECT set_config('app.current_organization_id','org_rls_a',true),set_config('app.current_user_id','user_rls_a',true),set_config('app.current_membership_role','ADMIN',true),set_config('app.system_worker','off',true)");
    const ownRows = Number((await client.query("SELECT count(*)::int AS count FROM raw_attestations")).rows[0].count);
    const otherRows = Number((await client.query("SELECT count(*)::int AS count FROM raw_attestations WHERE organization_id='org_rls_b'")).rows[0].count);
    const organizations = (await client.query("SELECT id FROM organizations ORDER BY id")).rows.map((row) => row.id);
    const memberships = (await client.query("SELECT organization_id,user_id FROM memberships ORDER BY organization_id")).rows;
    await client.query("SAVEPOINT cross_tenant_write");
    let crossTenantWriteRejected = false;
    try { await client.query("INSERT INTO raw_attestations(id,organization_id,provider,chain_id,payload,content_hash) VALUES('raw_rls_attack','org_rls_b','attack',1,'{}','0xattack')"); }
    catch (error) { crossTenantWriteRejected = error.code === "42501"; await client.query("ROLLBACK TO SAVEPOINT cross_tenant_write"); }

    await client.query("SELECT set_config('app.current_organization_id','',true),set_config('app.current_user_id','',true),set_config('app.current_membership_role','',true)");
    const unscopedRows = Number((await client.query("SELECT count(*)::int AS count FROM raw_attestations")).rows[0].count);
    await client.query("SELECT set_config('app.system_worker','on',true)");
    const systemRows = Number((await client.query("SELECT count(*)::int AS count FROM raw_attestations WHERE id IN('raw_rls_a','raw_rls_b')")).rows[0].count);
    await client.query("ROLLBACK");

    const result = {
      migrationApplied: (await pool.query("SELECT 1 FROM schema_migrations WHERE version='016_authenticated_tenant_rls.sql'")).rowCount === 1,
      restrictedRole: role && role.rolbypassrls === false && role.rolsuper === false,
      rlsEnabledOnAllTenantTables: enabled.rows[0].count === expectedTables,
      policiesInstalled: policies.rows[0].count === expectedTables,
      ownOrganizationVisible: ownRows === 1 && organizations.join(",") === "org_rls_a" && memberships.length === 1 && memberships[0].organization_id === "org_rls_a",
      crossTenantReadHidden: otherRows === 0,
      crossTenantWriteRejected,
      missingContextFailsClosed: unscopedRows === 0,
      explicitSystemWorkerContext: systemRows === 2
    };
    if (!Object.values(result).every((value) => value === true)) throw new Error(`Tenant RLS assertions failed: ${JSON.stringify(result)}`);
    console.log(JSON.stringify(result));
  } finally { client.release(); await pool.end(); }
}

main().catch((error) => { console.error(error); process.exit(1); });

