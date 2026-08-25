const test = require("node:test");
const assert = require("node:assert/strict");
const { buildArtifact, validateWalletSubmission } = require("./verify-live-usdc-inflow-submission.cjs");

const requestHash = `0x${"11".repeat(32)}`;
const bundleHash = `0x${"22".repeat(32)}`;
const request = {
  schemaVersion: "aeos.live-economic-evidence.usdc-verification-request.v1",
  status: "VERIFICATION_PREPARED",
  sourceProof: { bundleHash },
  verificationRequestHash: requestHash,
  verificationRequest: { chainId: 102031, from: `0x${"33".repeat(20)}`, to: "0x0000000000000000000000000000000000000fd2", data: "0x1234", value: "0x0" },
  expectedCall: { chainKey: 1, headerNumber: 11561243, transactionIndex: 9 },
  controls: { signed: false, submitted: false, signerCustody: false, broadcastCapability: false, assetExecutionAuthorized: false },
};
const receipt = (hash, blockNumber) => ({
  chainId: 102031, transactionHash: hash, blockNumber, blockHash: `0x${"44".repeat(32)}`, from: request.verificationRequest.from, to: request.verificationRequest.to,
  status: 1, confirmations: 3, canonicalBlockVerified: true, calldataVerified: true, zeroValueVerified: true, transactionVerifiedEvent: true,
  transactionVerified: { chainKey: 1, height: 11561243, transactionIndex: 9 },
});

test("records a canonical verified transaction and preserves an equivalent duplicate", () => {
  const primary = receipt(`0x${"55".repeat(32)}`, 101);
  const duplicate = receipt(`0x${"66".repeat(32)}`, 100);
  const artifact = buildArtifact(request, primary, [duplicate, duplicate]);
  assert.equal(artifact.status, "TRANSACTION_VERIFIED");
  assert.equal(artifact.canonicalSubmission.transactionHash, primary.transactionHash);
  assert.equal(artifact.duplicateSubmissionCount, 1);
  assert.equal(artifact.equivalentDuplicateSubmissions[0].transactionHash, duplicate.transactionHash);
  assert.equal(artifact.controls.immutableTenantEvidenceCreated, false);
  assert.equal(artifact.controls.assetExecutionAuthorized, false);
});

test("fails closed on mismatched event lineage", () => {
  assert.throws(() => buildArtifact(request, receipt(`0x${"55".repeat(32)}`, 101), [{ ...receipt(`0x${"66".repeat(32)}`, 100), transactionVerified: { chainKey: 1, height: 11561244, transactionIndex: 9 } }]), /EVENT_MISMATCH/);
});

test("rejects a wallet submission that crosses the frozen request boundary", () => {
  const submission = {
    schemaVersion: "aeos.live-economic-evidence.usdc-wallet-submission.v1", status: "WALLET_SUBMITTED", sourceProofBundleHash: bundleHash,
    verificationRequestHash: requestHash, chainId: 102031, from: request.verificationRequest.from, to: request.verificationRequest.to, value: "0x0",
    transactionHash: `0x${"77".repeat(32)}`, walletConfirmed: true, receiptVerified: false, transactionVerifiedEventObserved: false,
    privateKeyReceived: false, signerCustody: false, broadcastCapability: false, assetExecutionAuthorized: false,
  };
  assert.doesNotThrow(() => validateWalletSubmission(request, submission));
  assert.throws(() => validateWalletSubmission(request, { ...submission, chainId: 11155111 }), /BOUNDARY_MISMATCH/);
});
