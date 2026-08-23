const { createHash } = require("node:crypto");
const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");
const { buildUscVerificationRequest } = require("../dist/attestcoin-adapter");

const canonical = (value) => Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`
    : JSON.stringify(value);
const hash = (value) => `0x${createHash("sha256").update(canonical(value)).digest("hex")}`;

function validateStep4(artifact) {
  if (artifact?.schemaVersion !== "aeos.live-attestcoin-step.v1" || artifact.step !== 4 || artifact.status !== "PROOF_VERIFIED") throw new Error("LIVE_ATTESTCOIN_STEP_4_INVALID");
  if (artifact.verification?.staticNativeVerificationPassed !== true || artifact.verification?.assetExecutionAuthorized !== false) throw new Error("LIVE_ATTESTCOIN_STEP_4_TRUTH_BOUNDARY_INVALID");
  if (artifact.proof?.chainKey !== 1 || artifact.proof?.headerNumber !== artifact.source?.blockNumber || artifact.proof?.txHash?.toLowerCase() !== artifact.source?.transactionHash?.toLowerCase()) throw new Error("LIVE_ATTESTCOIN_STEP_4_PROOF_SOURCE_MISMATCH");
}

function buildArtifact(step4, requesterWallet) {
  validateStep4(step4);
  const transaction = buildUscVerificationRequest(step4.proof, requesterWallet);
  return {
    schemaVersion: "aeos.live-attestcoin-step.v1",
    step: 5,
    status: "VERIFICATION_PREPARED",
    provider: step4.provider,
    sourceTransactionHash: step4.source.transactionHash.toLowerCase(),
    proofSnapshotHash: hash(step4.proof),
    verificationRequest: transaction,
    verificationRequestHash: hash(transaction),
    expectedCall: {
      method: "verifyAndEmit",
      chainKey: step4.proof.chainKey,
      headerNumber: step4.proof.headerNumber,
      transactionIndex: step4.proof.txIndex,
      expectedEvent: "TransactionVerified(uint64,uint64,uint64)",
    },
    controls: {
      zeroValue: transaction.value === "0x0",
      requiresUserWalletConfirmation: true,
      signed: false,
      submitted: false,
      signerCustody: false,
      broadcastCapability: false,
      assetExecutionAuthorized: false,
    },
    truthBoundary: {
      requestedVerification: "SOURCE_TRANSACTION_INCLUSION",
      transactionVerifiedEventObserved: false,
      immutableEvidenceCreated: false,
      payloadEconomicTruthVerified: false,
    },
  };
}

function main() {
  const inputPath = resolve(process.env.AEOS_LIVE_PROOF_OUTPUT || resolve(__dirname, "../../../reports/live-demo/step-4-usc-proof.json"));
  const outputPath = resolve(process.env.AEOS_LIVE_VERIFICATION_REQUEST_OUTPUT || resolve(__dirname, "../../../reports/live-demo/step-5-usc-verification-request.json"));
  const requesterWallet = process.env.AEOS_LIVE_REQUESTER_WALLET || "0x444D510728FB8072351cB5d0E88432e6a8501DFA";
  const artifact = buildArtifact(JSON.parse(readFileSync(inputPath, "utf8")), requesterWallet);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(JSON.stringify({ status: artifact.status, outputPath, verificationRequestHash: artifact.verificationRequestHash, ...artifact.verificationRequest, ...artifact.controls }, null, 2));
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error instanceof Error ? error.message : "LIVE_USC_VERIFICATION_REQUEST_PREPARATION_FAILED"); process.exit(1); }
}

module.exports = { buildArtifact, canonical, hash, validateStep4 };
