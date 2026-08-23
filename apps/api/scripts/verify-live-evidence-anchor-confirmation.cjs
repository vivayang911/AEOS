const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");
require("dotenv").config({ path: resolve(__dirname, "../../../.env"), quiet: true });
process.env.ADVISORY_PROVIDER = "mock-deterministic";
process.env.EVIDENCE_ANCHOR_RECEIPT_ADAPTER = "rpc-readonly";
process.env.EVIDENCE_ANCHOR_MIN_CONFIRMATIONS ??= "2";
const deployment = JSON.parse(readFileSync(resolve(__dirname, "../../../reports/deployment/evidence-anchor-deployment-verification.json"), "utf8"));
process.env.EVIDENCE_ANCHOR_ASC_ADDRESS = deployment.address;
const { NestFactory } = require("@nestjs/core");
const { AppModule } = require("../dist/app.module");
const { DatabaseService } = require("../dist/database.service");
const { AttestcoinService } = require("../dist/attestcoin.service");
const { buildLiveEvidenceAnchorConfirmationArtifact } = require("../dist/live-evidence-anchor-confirmation");

const STEP9_PATH = resolve(__dirname, "../../../reports/live-demo/step-9-evidence-anchor-request.json");
const STEP10_PATH = resolve(__dirname, "../../../reports/live-demo/step-10-wallet-submission.json");

async function main() {
  const step9 = JSON.parse(readFileSync(STEP9_PATH, "utf8"));
  const step10 = JSON.parse(readFileSync(STEP10_PATH, "utf8"));
  const wallet = step10.from;
  if (!wallet || step10.transactionHash !== "0x181ab1d51085f845b76cdc5c4971622f550dafd33ed2e501dcc6c284c8bb9731") throw new Error("LIVE_STEP_11_FIXED_TRANSACTION_MISMATCH");
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const db = app.get(DatabaseService);
    const service = app.get(AttestcoinService);
    const sessions = await db.runAsSystem(() => db.query("SELECT s.user_id,s.active_organization_id AS organization_id,m.role FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN memberships m ON m.organization_id=s.active_organization_id AND m.user_id=s.user_id AND m.status='ACTIVE' WHERE lower(u.wallet_address)=lower($1) AND s.revoked_at IS NULL AND s.expires_at>now() ORDER BY s.created_at DESC", [wallet]));
    if (sessions.rowCount !== 1) throw new Error(sessions.rowCount ? "LIVE_STEP_11_ACTIVE_SESSION_AMBIGUOUS" : "LIVE_STEP_11_ACTIVE_SESSION_REQUIRED");
    const session = sessions.rows[0];
    const confirmation = await db.runWithTenant(session.organization_id, session.user_id, session.role, () => service.confirmEvidenceAnchor(session.organization_id, step9.handoff.id, step10.transactionHash));
    const artifact = buildLiveEvidenceAnchorConfirmationArtifact({ recordedAt: new Date().toISOString(), step9, step10, confirmation });
    const outputPath = resolve(process.env.AEOS_LIVE_STEP_11_OUTPUT || resolve(__dirname, "../../../reports/live-demo/step-11-evidence-anchored.json"));
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    console.log(JSON.stringify({ status: artifact.status, outputPath, transactionHash: artifact.chainReceipt.transactionHash, blockNumber: artifact.chainReceipt.blockNumber, blockHash: artifact.chainReceipt.blockHash, confirmations: artifact.chainReceipt.confirmations, commitmentId: artifact.lineage.commitmentId, eventVerified: true, calldataVerified: true, zeroValueVerified: true, assetExecutionAuthorized: false }, null, 2));
  } finally { await app.close(); }
}

if (require.main === module) main().catch((error) => {
  const response = error && typeof error === "object" ? error.response : null;
  const safe = response && typeof response === "object" ? { code: response.code || "LIVE_STEP_11_FAILED", message: response.message || "Evidence Anchor verification failed", retryable: response.retryable === true } : { code: "LIVE_STEP_11_FAILED", message: error instanceof Error && error.message ? error.message : "Evidence Anchor verification failed", retryable: false };
  console.error(JSON.stringify(safe));
  process.exit(1);
});
