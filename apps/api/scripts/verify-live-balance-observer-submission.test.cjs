const test = require("node:test");
const assert = require("node:assert/strict");
const { buildArtifact, validateWalletSubmission } = require("./verify-live-balance-observer-submission.cjs");

const request = { schemaVersion: "aeos.live-economic-evidence.balance-observer-verification-request.v1", status: "VERIFICATION_PREPARED", sourceProof: { bundleHash: `0x${"1".repeat(64)}` }, verificationRequest: { chainId: 102031, from: "0x444d510728fb8072351cb5d0e88432e6a8501dfa", to: "0x0000000000000000000000000000000000000fd2", value: "0x0" }, verificationRequestHash: `0x${"2".repeat(64)}`, expectedCall: { chainKey: 1, headerNumber: 11564181, transactionIndex: 8 }, controls: { signed: false, submitted: false, signerCustody: false, broadcastCapability: false, assetExecutionAuthorized: false } };
const receipt = (hash, blockNumber) => ({ chainId: 102031, transactionHash: hash, blockNumber, status: 1, confirmations: 2, canonicalBlockVerified: true, calldataVerified: true, zeroValueVerified: true, transactionVerifiedEvent: true, transactionVerified: { chainKey: 1, height: 11564181, transactionIndex: 8 } });

test("selects the earliest canonical duplicate without creating a second economic fact", () => {
  const later = receipt(`0x${"f".repeat(64)}`, 20), earlier = receipt(`0x${"e".repeat(64)}`, 10);
  const artifact = buildArtifact(request, [later, earlier]);
  assert.equal(artifact.canonicalSubmission.transactionHash, earlier.transactionHash);
  assert.equal(artifact.duplicateSubmissionCount, 1);
  assert.equal(artifact.truthBoundary.duplicateVerificationChangesEconomicFact, false);
  assert.equal(artifact.controls.assetExecutionAuthorized, false);
});

test("rejects an event that does not identify the frozen source transaction", () => {
  const invalid = receipt(`0x${"a".repeat(64)}`, 10);
  invalid.transactionVerified.transactionIndex = 9;
  assert.throws(() => buildArtifact(request, [invalid]), /EVENT_MISMATCH/);
});

test("requires the append-only wallet record to remain pre-finality and zero-authority", () => {
  const submission = { schemaVersion: "aeos.live-economic-evidence.balance-observer-wallet-submission.v1", status: "WALLET_SUBMITTED", sourceProofBundleHash: request.sourceProof.bundleHash, verificationRequestHash: request.verificationRequestHash, chainId: 102031, from: request.verificationRequest.from, to: request.verificationRequest.to, value: "0x0", transactionHash: `0x${"3".repeat(64)}`, walletConfirmed: true, receiptVerified: false, transactionVerifiedEventObserved: false, privateKeyReceived: false, signerCustody: false, broadcastCapability: false, assetExecutionAuthorized: false };
  assert.doesNotThrow(() => validateWalletSubmission(request, submission));
  assert.throws(() => validateWalletSubmission(request, { ...submission, receiptVerified: true }), /CONTROL_BOUNDARY_INVALID/);
});
