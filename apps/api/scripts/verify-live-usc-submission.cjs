const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");
const { UscAttestcoinAdapter } = require("../dist/attestcoin-adapter");

function validateIdentity(step5, step6) {
  if (step5?.schemaVersion !== "aeos.live-attestcoin-step.v1" || step5.step !== 5 || step5.status !== "VERIFICATION_PREPARED") throw new Error("LIVE_USC_STEP_5_INVALID");
  if (step6?.schemaVersion !== "aeos.live-attestcoin-step.v1" || step6.step !== 6 || step6.status !== "WALLET_SUBMITTED") throw new Error("LIVE_USC_STEP_6_INVALID");
  if (step6.verificationRequestHash !== step5.verificationRequestHash) throw new Error("LIVE_USC_SUBMISSION_REQUEST_HASH_MISMATCH");
  if (step6.chainId !== step5.verificationRequest.chainId || step6.from?.toLowerCase() !== step5.verificationRequest.from || step6.to?.toLowerCase() !== step5.verificationRequest.to || step6.value !== step5.verificationRequest.value) throw new Error("LIVE_USC_SUBMISSION_BOUNDARY_MISMATCH");
  if (!/^0x[0-9a-f]{64}$/i.test(step6.transactionHash)) throw new Error("LIVE_USC_SUBMISSION_TRANSACTION_HASH_INVALID");
  if (step6.walletConfirmed !== true || step6.signerCustody !== false || step6.broadcastCapability !== false || step6.assetExecutionAuthorized !== false) throw new Error("LIVE_USC_SUBMISSION_CONTROL_BOUNDARY_INVALID");
}

function buildArtifact(step5, step6, receipt) {
  validateIdentity(step5, step6);
  if (receipt.transactionHash !== step6.transactionHash.toLowerCase() || receipt.status !== 1 || receipt.transactionVerifiedEvent !== true || receipt.canonicalBlockVerified !== true || receipt.calldataVerified !== true || receipt.zeroValueVerified !== true || receipt.confirmations < 2) throw new Error("LIVE_USC_RECEIPT_NOT_FINALIZED");
  const expected = step5.expectedCall;
  const observed = receipt.transactionVerified;
  if (observed.chainKey !== expected.chainKey || observed.height !== expected.headerNumber || observed.transactionIndex !== expected.transactionIndex) throw new Error("LIVE_USC_TRANSACTION_VERIFIED_EVENT_MISMATCH");
  return {
    schemaVersion: "aeos.live-attestcoin-step.v1",
    step: 7,
    status: "TRANSACTION_VERIFIED",
    provider: step5.provider,
    recordedAt: new Date().toISOString(),
    verificationRequestHash: step5.verificationRequestHash,
    transactionHash: receipt.transactionHash,
    receipt,
    controls: {
      walletConfirmed: true,
      receiptVerified: true,
      canonicalBlockVerified: true,
      exactCalldataVerified: true,
      zeroValueVerified: true,
      transactionVerifiedEventObserved: true,
      immutableEvidenceCreated: false,
      signerCustody: false,
      broadcastCapability: false,
      assetExecutionAuthorized: false,
    },
    truthBoundary: {
      verifiedClaim: "SOURCE_TRANSACTION_INCLUSION",
      payloadEconomicTruthVerified: false,
      organizationEvidenceImportStatus: "PENDING_SERVER_RESOLVED_ORGANIZATION_CONTEXT",
    },
  };
}

async function main() {
  const step5Path = resolve(process.env.AEOS_LIVE_VERIFICATION_REQUEST_OUTPUT || resolve(__dirname, "../../../reports/live-demo/step-5-usc-verification-request.json"));
  const step6Path = resolve(process.env.AEOS_LIVE_WALLET_SUBMISSION_OUTPUT || resolve(__dirname, "../../../reports/live-demo/step-6-wallet-submission.json"));
  const outputPath = resolve(process.env.AEOS_LIVE_TRANSACTION_VERIFICATION_OUTPUT || resolve(__dirname, "../../../reports/live-demo/step-7-transaction-verified.json"));
  const step5 = JSON.parse(readFileSync(step5Path, "utf8"));
  const step6 = JSON.parse(readFileSync(step6Path, "utf8"));
  validateIdentity(step5, step6);
  const adapter = new UscAttestcoinAdapter("https://sepolia.invalid", process.env.CREDITCOIN_RPC_URL);
  const receipt = await adapter.inspectVerificationTransaction(step6.transactionHash, step5.verificationRequest);
  const artifact = buildArtifact(step5, step6, receipt);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(JSON.stringify({ status: artifact.status, outputPath, transactionHash: artifact.transactionHash, blockNumber: receipt.blockNumber, confirmations: receipt.confirmations, transactionVerified: receipt.transactionVerified, immutableEvidenceCreated: false, signerCustody: false, broadcastCapability: false, assetExecutionAuthorized: false }, null, 2));
}

if (require.main === module) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : "LIVE_USC_SUBMISSION_VERIFICATION_FAILED"); process.exit(1); });
}

module.exports = { buildArtifact, validateIdentity };
