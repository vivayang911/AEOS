const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
require("dotenv").config({ path:resolve(__dirname,"../../../.env"), quiet:true });
const { NestFactory } = require("@nestjs/core");
const { AppModule } = require("../dist/app.module");
const { DatabaseService } = require("../dist/database.service");
const load = (file) => JSON.parse(readFileSync(resolve(file),"utf8"));
const fail = (code) => { throw new Error(code); };

async function mutationBlocked(db,org,user,role,query,values) {
  return db.runWithTenant(org,user,role,() => db.transaction(async (client) => { await client.query("SAVEPOINT immutable_probe"); try { await client.query(query,values); return false; } catch (error) { await client.query("ROLLBACK TO SAVEPOINT immutable_probe"); return error?.code === "P0001"; } }));
}

async function main() {
  const imported = load(process.env.AEOS_LIVE_BALANCE_OBSERVER_EVIDENCE_IMPORT_OUTPUT || resolve(__dirname,"../../../reports/live-demo/live-balance-observer-evidence-import-v1.json"));
  const report = load(process.env.AEOS_LIVE_BALANCE_OBSERVER_CHILD_DECISION_OUTPUT || resolve(__dirname,"../../../reports/live-demo/live-balance-observer-child-decision-v1.json"));
  if (imported?.status !== "IMMUTABLE_EVIDENCE_IMPORTED" || imported.predicate !== "asset.balance" || report?.status !== "CHILD_DECISION_FROZEN_AND_COMPARED" || report.controls?.assetExecutionAuthorized !== false) fail("BALANCE_CHILD_DB_REPORT_INVALID");
  const app = await NestFactory.createApplicationContext(AppModule,{logger:false});
  try {
    const db = app.get(DatabaseService);
    const owner = await db.runAsSystem(() => db.query("SELECT organization_id FROM decisions WHERE id=$1",[report.lineage.childDecisionId])); if (owner.rowCount !== 1) fail("BALANCE_CHILD_DB_DECISION_MISSING");
    const org = owner.rows[0].organization_id;
    const context = await db.runAsSystem(() => db.query("SELECT DISTINCT s.user_id,m.role FROM auth_sessions s JOIN memberships m ON m.organization_id=s.active_organization_id AND m.user_id=s.user_id AND m.status='ACTIVE' WHERE s.active_organization_id=$1 AND s.revoked_at IS NULL AND s.expires_at>now()",[org])); if (context.rowCount !== 1) fail("BALANCE_CHILD_DB_TENANT_CONTEXT_REQUIRED");
    const {user_id:user,role} = context.rows[0], run = (work) => db.runWithTenant(org,user,role,work);
    const lineage = await run(() => db.query("SELECT d.id,d.parent_decision_id,d.revision_number,d.evidence_snapshot_id,d.retrieval_bundle_hash,d.recommendation,d.output_hash,s.evidence_ids,s.manifest_hash FROM decisions d JOIN evidence_snapshots s ON s.organization_id=d.organization_id AND s.id=d.evidence_snapshot_id WHERE d.organization_id=$1 AND d.id=ANY($2::text[]) ORDER BY d.revision_number",[org,[report.lineage.parentDecisionId,report.lineage.childDecisionId]]));
    if (lineage.rowCount !== 2) fail("BALANCE_CHILD_DB_LINEAGE_MISSING"); const parent = lineage.rows.find((row) => row.id === report.lineage.parentDecisionId), child = lineage.rows.find((row) => row.id === report.lineage.childDecisionId);
    if (!parent || !child || child.parent_decision_id !== parent.id || Number(child.revision_number) !== Number(parent.revision_number)+1 || child.retrieval_bundle_hash !== parent.retrieval_bundle_hash || !child.evidence_ids.includes(imported.evidenceId) || parent.evidence_ids.includes(imported.evidenceId)) fail("BALANCE_CHILD_DB_LINEAGE_MISMATCH");
    const evidence = await run(() => db.query("SELECT e.id,e.raw_attestation_id,e.predicate,e.value,e.chain,e.source,e.verification_status,e.freshness_status,e.quality_score,e.content_hash,c.labels,c.routes,c.classification_hash,c.asset_execution_authorized FROM evidence e JOIN evidence_classifications c ON c.organization_id=e.organization_id AND c.evidence_id=e.id WHERE e.organization_id=$1 AND e.id=$2",[org,imported.evidenceId]));
    const ev = evidence.rows[0]; if (evidence.rowCount !== 1 || ev.predicate !== "asset.balance" || ev.value?.amount !== "20000000" || ev.value?.currentAtObservationBlockOnly !== true || ev.value?.continuouslyCurrent !== false || Number(ev.chain?.id) !== 11155111 || ev.verification_status !== "VERIFIED" || ev.freshness_status !== imported.freshnessStatus || ev.asset_execution_authorized !== false) fail("BALANCE_CHILD_DB_EVIDENCE_MISMATCH");
    const job = await run(() => db.query("SELECT status,evidence_id,source_tx_hash,verification_tx_hash FROM attestcoin_proof_jobs WHERE organization_id=$1 AND id=$2",[org,imported.proofJobId])); if (job.rowCount !== 1 || job.rows[0].status !== "VERIFIED" || job.rows[0].evidence_id !== imported.evidenceId || job.rows[0].source_tx_hash !== imported.sourceTransactionHash || job.rows[0].verification_tx_hash !== imported.canonicalVerificationTransactionHash) fail("BALANCE_CHILD_DB_PROOF_JOB_MISMATCH");
    const manifests = await run(() => db.query("SELECT p.role,p.manifest_hash parent_hash,c.manifest_hash child_hash,p.items=c.items items_equal FROM decision_retrieval_manifests p JOIN decision_retrieval_manifests c ON c.organization_id=p.organization_id AND c.role=p.role WHERE p.organization_id=$1 AND p.decision_id=$2 AND c.decision_id=$3",[org,parent.id,child.id]));
    if (manifests.rowCount !== 8 || manifests.rows.some((row) => row.parent_hash !== row.child_hash || row.items_equal !== true)) fail("BALANCE_CHILD_DB_RAG_INHERITANCE_MISMATCH");
    const counts = await run(() => db.query("SELECT (SELECT count(*)::int FROM agent_runs WHERE organization_id=$1 AND decision_id=$2 AND run_state='SUCCEEDED') agent_runs,(SELECT count(*)::int FROM agent_messages WHERE organization_id=$1 AND decision_id=$2) messages,(SELECT count(*)::int FROM decision_challenges WHERE organization_id=$1 AND decision_id=$2) challenges",[org,child.id]));
    const positions = child.recommendation?.agentPositions ?? []; if (counts.rows[0].agent_runs !== 8 || counts.rows[0].messages < 1 || counts.rows[0].challenges < 2 || positions.length !== 8 || positions.some((item) => !(item.citations ?? []).includes(imported.evidenceId)) || child.recommendation?.actions?.length || child.recommendation?.assetExecutionAuthorized !== false) fail("BALANCE_CHILD_DB_AGENT_BOUNDARY_INVALID");
    const other = await db.runAsSystem(() => db.query("SELECT id FROM organizations WHERE id<>$1 ORDER BY id LIMIT 1",[org])); if (other.rowCount !== 1) fail("BALANCE_CHILD_DB_CROSS_TENANT_FIXTURE_REQUIRED");
    const hidden = await db.runWithTenant(other.rows[0].id,user,role,() => db.query("SELECT id FROM evidence WHERE id=$1 UNION ALL SELECT id FROM decisions WHERE id=$2 UNION ALL SELECT id FROM evidence_snapshots WHERE id=$3",[imported.evidenceId,child.id,child.evidence_snapshot_id])); if (hidden.rowCount !== 0) fail("BALANCE_CHILD_DB_RLS_LEAK");
    const evidenceMutationBlocked = await mutationBlocked(db,org,user,role,"UPDATE evidence SET value='{}'::jsonb WHERE organization_id=$1 AND id=$2",[org,imported.evidenceId]);
    const snapshotMutationBlocked = await mutationBlocked(db,org,user,role,"UPDATE evidence_snapshots SET query='{}'::jsonb WHERE organization_id=$1 AND id=$2",[org,child.evidence_snapshot_id]);
    const rawMutationBlocked = await mutationBlocked(db,org,user,role,"UPDATE raw_attestations SET payload='{}'::jsonb WHERE organization_id=$1 AND id=$2",[org,ev.raw_attestation_id]);
    const manifestMutationBlocked = await mutationBlocked(db,org,user,role,"UPDATE decision_retrieval_manifests SET status='REFUSED' WHERE organization_id=$1 AND decision_id=$2",[org,child.id]);
    if (!evidenceMutationBlocked || !snapshotMutationBlocked || !rawMutationBlocked || !manifestMutationBlocked) fail("BALANCE_CHILD_DB_IMMUTABILITY_MISSING");
    console.log(JSON.stringify({status:"LIVE_BALANCE_OBSERVER_CHILD_DECISION_DB_VERIFIED",evidenceId:imported.evidenceId,predicate:ev.predicate,freshnessStatus:ev.freshness_status,qualityScore:Number(ev.quality_score),parentDecisionId:parent.id,childDecisionId:child.id,parentSnapshotId:parent.evidence_snapshot_id,childSnapshotId:child.evidence_snapshot_id,retrievalBundleHash:child.retrieval_bundle_hash,manifestCount:manifests.rowCount,agentRuns:counts.rows[0].agent_runs,a2aMessages:counts.rows[0].messages,challenges:counts.rows[0].challenges,rolesCitingNewBalance:positions.filter((item) => item.citations.includes(imported.evidenceId)).length,crossTenantHidden:true,evidenceMutationBlocked:true,snapshotMutationBlocked:true,rawMutationBlocked:true,manifestMutationBlocked:true,signature:false,broadcast:false,assetExecutionAuthorized:false},null,2));
  } finally { await app.close(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "BALANCE_CHILD_DB_VERIFY_FAILED"); process.exit(1); });
