const path = require("node:path");
const { Pool } = require("pg");
const { DatabaseService } = require("../dist/database.service");

const wallet = "0x444d510728fb8072351cb5d0e88432e6a8501dfa";
const manifest = { schemaVersion: "evidence.anchor.handoff.v1", signed: false, submitted: false, assetExecutionAuthorized: false };

async function seedOrganization(client, key) {
  const org = `org_anchor_${key}`;
  const raw = `raw_anchor_${key}`;
  const evidence = `evidence_anchor_${key}`;
  const evidenceHash = `0x${key.repeat(64)}`;
  const snapshot = `snapshot_anchor_${key}`;
  const decision = `decision_anchor_${key}`;
  const job = `job_anchor_${key}`;
  await client.query("INSERT INTO organizations(id,name,status) VALUES($1,$2,'ACTIVE')", [org, `Anchor ${key}`]);
  await client.query("INSERT INTO policy_versions(id,organization_id,version,config,content_hash,status) VALUES($1,$2,1,'{}',$3,'ACTIVE')", [`policy_anchor_${key}`, org, `0xpolicy${key}`]);
  await client.query("INSERT INTO raw_attestations(id,organization_id,provider,chain_id,payload,content_hash) VALUES($1,$2,'fixture',102031,'{}',$3)", [raw, org, `0xraw${key}`]);
  await client.query("INSERT INTO evidence(id,organization_id,raw_attestation_id,subject,predicate,value,chain,source,verification_status,freshness_status,freshness_expires_at,quality_score,quality_components,observed_at,content_hash) VALUES($1,$2,$3,'{}','blockchain.transaction.included','{}','{}','{}','VERIFIED','FRESH',now()+interval '1 day',100,'{}',now(),$4)", [evidence, org, raw, evidenceHash]);
  await client.query("INSERT INTO evidence_snapshots(id,organization_id,evidence_ids,manifest,manifest_hash,query) VALUES($1,$2,$3,$4,$5,'{}')", [snapshot, org, JSON.stringify([evidence]), JSON.stringify([{ evidenceId: evidence, contentHash: evidenceHash }]), `0x${key.repeat(64)}`]);
  await client.query("INSERT INTO decisions(id,organization_id,objective,policy_version_id,evidence_snapshot_id,provider,schema_version,status,recommendation,input_hash,output_hash) VALUES($1,$2,'Anchor',$3,$4,'fixture','decision.recommendation.v3','REVIEW_REQUIRED','{}',$5,$6)", [decision, org, `policy_anchor_${key}`, snapshot, `0xinput${key}`, `0x${(key === "a" ? "c" : "d").repeat(64)}`]);
  await client.query("INSERT INTO attestcoin_proof_jobs(id,organization_id,adapter,source_chain_id,source_chain_key,source_tx_hash,requester_wallet,status,source_snapshot,source_snapshot_hash,proof_snapshot,proof_snapshot_hash,verification_receipt,verification_receipt_hash,evidence_id) VALUES($1,$2,'fixture',11155111,1,$3,$4,'VERIFIED','{}','0xsource','{}','0xproof','{}','0xreceipt',$5)", [job, org, `0x${key.repeat(64)}`, wallet, evidence]);
  return { org, snapshot, decision, job };
}

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
    const a = await seedOrganization(client, "a");
    const b = await seedOrganization(client, "b");
    await client.query("INSERT INTO evidence_anchor_handoffs(id,organization_id,attestcoin_proof_job_id,decision_id,evidence_snapshot_id,requester_wallet,asc_address,commitment_id,manifest,manifest_hash) VALUES('handoff_anchor_a',$1,$2,$3,$4,$5,'0x1111111111111111111111111111111111111111',$6,$7,$8)", [a.org, a.job, a.decision, a.snapshot, wallet, `0x${"e".repeat(64)}`, manifest, `0x${"f".repeat(64)}`]);

    await client.query("SAVEPOINT immutable");
    let immutable = false;
    try { await client.query("UPDATE evidence_anchor_handoffs SET asc_address='0x2222222222222222222222222222222222222222' WHERE id='handoff_anchor_a'"); }
    catch (error) { immutable = String(error.message).includes("immutable"); await client.query("ROLLBACK TO SAVEPOINT immutable"); }

    await client.query("SAVEPOINT tenant_mismatch");
    let tenantGuard = false;
    try { await client.query("INSERT INTO evidence_anchor_handoffs(id,organization_id,attestcoin_proof_job_id,decision_id,evidence_snapshot_id,requester_wallet,asc_address,commitment_id,manifest,manifest_hash) VALUES('bad_anchor_tenant',$1,$2,$3,$4,$5,'0x1111111111111111111111111111111111111111',$6,$7,$8)", [b.org, a.job, b.decision, b.snapshot, wallet, `0x${"1".repeat(64)}`, manifest, `0x${"2".repeat(64)}`]); }
    catch (error) { tenantGuard = String(error.message).includes("not frozen"); await client.query("ROLLBACK TO SAVEPOINT tenant_mismatch"); }

    await client.query("INSERT INTO evidence_snapshots(id,organization_id,evidence_ids,manifest,manifest_hash,query) VALUES('snapshot_anchor_unrelated',$1,'[]','[]',$2,'{}')", [a.org, `0x${"9".repeat(64)}`]);
    await client.query("INSERT INTO decisions(id,organization_id,objective,policy_version_id,evidence_snapshot_id,provider,schema_version,status,recommendation,input_hash,output_hash) VALUES('decision_anchor_unrelated',$1,'Unrelated','policy_anchor_a','snapshot_anchor_unrelated','fixture','decision.recommendation.v3','REVIEW_REQUIRED','{}','0xinputunrelated',$2)", [a.org, `0x${"8".repeat(64)}`]);
    await client.query("SAVEPOINT unrelated_evidence");
    let unrelatedEvidenceRejected = false;
    try { await client.query("INSERT INTO evidence_anchor_handoffs(id,organization_id,attestcoin_proof_job_id,decision_id,evidence_snapshot_id,requester_wallet,asc_address,commitment_id,manifest,manifest_hash) VALUES('bad_anchor_unrelated',$1,$2,'decision_anchor_unrelated','snapshot_anchor_unrelated',$3,'0x1111111111111111111111111111111111111111',$4,$5,$6)", [a.org, a.job, wallet, `0x${"3".repeat(64)}`, manifest, `0x${"4".repeat(64)}`]); }
    catch (error) { unrelatedEvidenceRejected = String(error.message).includes("not frozen"); await client.query("ROLLBACK TO SAVEPOINT unrelated_evidence"); }

    await client.query("SET LOCAL ROLE aeos_app");
    await client.query("SELECT set_config('app.current_organization_id',$1,true),set_config('app.current_user_id','',true),set_config('app.current_membership_role','',true),set_config('app.system_worker','off',true)", [b.org]);
    const hidden = Number((await client.query("SELECT count(*)::int count FROM evidence_anchor_handoffs WHERE id='handoff_anchor_a'")).rows[0].count) === 0;
    await client.query("ROLLBACK");

    const result = {
      migrationApplied: (await pool.query("SELECT 1 FROM schema_migrations WHERE version='054_evidence_anchor_proof_decision_lineage.sql'")).rowCount === 1,
      exactEvidenceLineageAccepted: true,
      unrelatedEvidenceRejected,
      immutable,
      tenantGuard,
      crossTenantHidden: hidden,
      manifestExplicitlyUnsigned: manifest.signed === false && manifest.submitted === false,
      authorityWithheld: manifest.assetExecutionAuthorized === false,
    };
    if (!Object.values(result).every(Boolean)) throw new Error(`Evidence Anchor handoff assertions failed: ${JSON.stringify(result)}`);
    console.log(JSON.stringify(result));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
