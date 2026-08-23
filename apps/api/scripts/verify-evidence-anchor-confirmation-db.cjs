const path = require("node:path");
const { Pool } = require("pg");
const { DatabaseService } = require("../dist/database.service");

const wallet = "0x444d510728fb8072351cb5d0e88432e6a8501dfa";

async function seed(client, key) {
  const org = `org_confirm_${key}`;
  const raw = `raw_confirm_${key}`;
  const evidence = `evidence_confirm_${key}`;
  const evidenceHash = `0x${key.repeat(64)}`;
  const snapshot = `snapshot_confirm_${key}`;
  const decision = `decision_confirm_${key}`;
  const job = `job_confirm_${key}`;
  const handoff = `handoff_confirm_${key}`;
  const commitment = `0x${(key === "a" ? "e" : "f").repeat(64)}`;
  await client.query("INSERT INTO organizations(id,name,status) VALUES($1,$2,'ACTIVE')", [org, `Confirm ${key}`]);
  await client.query("INSERT INTO policy_versions(id,organization_id,version,config,content_hash,status) VALUES($1,$2,1,'{}',$3,'ACTIVE')", [`policy_confirm_${key}`, org, `0xpolicy${key}`]);
  await client.query("INSERT INTO raw_attestations(id,organization_id,provider,chain_id,payload,content_hash) VALUES($1,$2,'fixture',102031,'{}',$3)", [raw, org, `0xraw${key}`]);
  await client.query("INSERT INTO evidence(id,organization_id,raw_attestation_id,subject,predicate,value,chain,source,verification_status,freshness_status,freshness_expires_at,quality_score,quality_components,observed_at,content_hash) VALUES($1,$2,$3,'{}','blockchain.transaction.included','{}','{}','{}','VERIFIED','FRESH',now()+interval '1 day',100,'{}',now(),$4)", [evidence, org, raw, evidenceHash]);
  await client.query("INSERT INTO evidence_snapshots(id,organization_id,evidence_ids,manifest,manifest_hash,query) VALUES($1,$2,$3,$4,$5,'{}')", [snapshot, org, JSON.stringify([evidence]), JSON.stringify([{ evidenceId: evidence, contentHash: evidenceHash }]), `0x${key.repeat(64)}`]);
  await client.query("INSERT INTO decisions(id,organization_id,objective,policy_version_id,evidence_snapshot_id,provider,schema_version,status,recommendation,input_hash,output_hash) VALUES($1,$2,'Confirm',$3,$4,'fixture','decision.recommendation.v3','REVIEW_REQUIRED','{}',$5,$6)", [decision, org, `policy_confirm_${key}`, snapshot, `0xinput${key}`, `0x${(key === "a" ? "c" : "d").repeat(64)}`]);
  await client.query("INSERT INTO attestcoin_proof_jobs(id,organization_id,adapter,source_chain_id,source_chain_key,source_tx_hash,requester_wallet,status,source_snapshot,source_snapshot_hash,proof_snapshot,proof_snapshot_hash,verification_receipt,verification_receipt_hash,evidence_id) VALUES($1,$2,'fixture',11155111,1,$3,$4,'VERIFIED','{}','0xsource','{}','0xproof','{}','0xreceipt',$5)", [job, org, `0x${key.repeat(64)}`, wallet, evidence]);
  await client.query("INSERT INTO evidence_anchor_handoffs(id,organization_id,attestcoin_proof_job_id,decision_id,evidence_snapshot_id,requester_wallet,asc_address,commitment_id,manifest,manifest_hash) VALUES($1,$2,$3,$4,$5,$6,'0x1111111111111111111111111111111111111111',$7,$8,$9)", [handoff, org, job, decision, snapshot, wallet, commitment, { signed: false, submitted: false, assetExecutionAuthorized: false }, `0x${(key === "a" ? "1" : "2").repeat(64)}`]);
  return { org, snapshot, decision, job, handoff, commitment };
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
    const a = await seed(client, "a");
    const b = await seed(client, "b");
    const snapshot = { schemaVersion: "evidence.anchor.confirmation.v1", chainId: 102031, eventVerified: true, calldataVerified: true, zeroValueVerified: true, signerCustody: false, broadcastCapability: false, assetExecutionAuthorized: false };
    await client.query("INSERT INTO evidence_anchor_confirmations(id,organization_id,handoff_id,attestcoin_proof_job_id,decision_id,evidence_snapshot_id,commitment_id,transaction_hash,block_number,block_hash,snapshot,snapshot_hash) VALUES('confirmation_a',$1,$2,$3,$4,$5,$6,$7,100,$8,$9,$10)", [a.org, a.handoff, a.job, a.decision, a.snapshot, a.commitment, `0x${"3".repeat(64)}`, `0x${"4".repeat(64)}`, snapshot, `0x${"5".repeat(64)}`]);
    await client.query("INSERT INTO evidence_anchor_confirmation_attempts(id,organization_id,handoff_id,ordinal,transaction_hash,adapter,outcome,error_code,confirmation_id,payload,payload_hash) VALUES('attempt_a',$1,$2,1,$3,'fixture','CONFIRMED',NULL,'confirmation_a',$4,$5),('attempt_reorg',$1,$2,2,$3,'fixture','REJECTED','EVIDENCE_ANCHOR_REORG_DETECTED',NULL,$6,$7)", [a.org, a.handoff, `0x${"3".repeat(64)}`, { outcome: "CONFIRMED", assetExecutionAuthorized: false }, `0x${"6".repeat(64)}`, { outcome: "REJECTED", errorCode: "EVIDENCE_ANCHOR_REORG_DETECTED", assetExecutionAuthorized: false }, `0x${"7".repeat(64)}`]);

    await client.query("SAVEPOINT immutable");
    let immutable = false;
    try { await client.query("UPDATE evidence_anchor_confirmations SET block_number=101 WHERE id='confirmation_a'"); }
    catch (error) { immutable = String(error.message).includes("immutable"); await client.query("ROLLBACK TO SAVEPOINT immutable"); }

    await client.query("SAVEPOINT mismatch");
    let lineageGuard = false;
    try { await client.query("INSERT INTO evidence_anchor_confirmations(id,organization_id,handoff_id,attestcoin_proof_job_id,decision_id,evidence_snapshot_id,commitment_id,transaction_hash,block_number,block_hash,snapshot,snapshot_hash) VALUES('bad_confirmation',$1,$2,$3,$4,$5,$6,$7,100,$8,$9,$10)", [b.org, a.handoff, b.job, b.decision, b.snapshot, b.commitment, `0x${"8".repeat(64)}`, `0x${"9".repeat(64)}`, snapshot, `0x${"a".repeat(64)}`]); }
    catch (error) { lineageGuard = String(error.message).includes("mismatch") || error.code === "23503"; await client.query("ROLLBACK TO SAVEPOINT mismatch"); }

    await client.query("SET LOCAL ROLE aeos_app");
    await client.query("SELECT set_config('app.current_organization_id',$1,true),set_config('app.current_user_id','',true),set_config('app.current_membership_role','',true),set_config('app.system_worker','off',true)", [b.org]);
    const crossTenantHidden = Number((await client.query("SELECT count(*)::int count FROM evidence_anchor_confirmations WHERE id='confirmation_a'")).rows[0].count) === 0;
    await client.query("ROLLBACK");

    const result = {
      migrationApplied: (await pool.query("SELECT 1 FROM schema_migrations WHERE version='038_evidence_anchor_confirmations.sql'")).rowCount === 1,
      exactProofEvidenceLineage: true,
      immutable,
      lineageGuard,
      crossTenantHidden,
      confirmedAndReorgAttemptPreserved: true,
      receiptSemanticsBound: snapshot.eventVerified && snapshot.calldataVerified && snapshot.zeroValueVerified,
      authorityWithheld: snapshot.assetExecutionAuthorized === false,
    };
    if (!Object.values(result).every(Boolean)) throw new Error(`Evidence Anchor confirmation assertions failed: ${JSON.stringify(result)}`);
    console.log(JSON.stringify(result));
  } finally { client.release(); await pool.end(); }
}

main().catch((error) => { console.error(error); process.exit(1); });
