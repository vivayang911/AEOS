const test = require("node:test");
const assert = require("node:assert/strict");
const { buildArtifact, validateIdentity } = require("./verify-live-usc-submission.cjs");

const requestHash = `0x${"11".repeat(32)}`;
const txHash = `0x${"22".repeat(32)}`;
const step5 = { schemaVersion: "aeos.live-attestcoin-step.v1", step: 5, status: "VERIFICATION_PREPARED", provider: "attestcoin-usc-sdk-0.18.0", verificationRequestHash: requestHash, verificationRequest: { chainId: 102031, from: `0x${"33".repeat(20)}`, to: "0x0000000000000000000000000000000000000fd2", data: "0x1234", value: "0x0" }, expectedCall: { chainKey: 1, headerNumber: 123, transactionIndex: 6 } };
const step6 = { schemaVersion: "aeos.live-attestcoin-step.v1", step: 6, status: "WALLET_SUBMITTED", chainId: 102031, from: step5.verificationRequest.from, to: step5.verificationRequest.to, value: "0x0", transactionHash: txHash, verificationRequestHash: requestHash, walletConfirmed: true, signerCustody: false, broadcastCapability: false, assetExecutionAuthorized: false };
const receipt = { chainId: 102031, transactionHash: txHash, blockNumber: 100, blockHash: `0x${"44".repeat(32)}`, from: step6.from, to: step6.to, status: 1, confirmations: 3, canonicalBlockVerified: true, calldataVerified: true, zeroValueVerified: true, transactionVerifiedEvent: true, transactionVerified: { chainKey: 1, height: 123, transactionIndex: 6 } };

test("builds a fail-closed Step 7 receipt artifact without claiming Evidence import", () => {
  const artifact = buildArtifact(step5, step6, receipt);
  assert.equal(artifact.status, "TRANSACTION_VERIFIED");
  assert.equal(artifact.controls.transactionVerifiedEventObserved, true);
  assert.equal(artifact.controls.immutableEvidenceCreated, false);
  assert.equal(artifact.controls.signerCustody, false);
  assert.equal(artifact.truthBoundary.organizationEvidenceImportStatus, "PENDING_SERVER_RESOLVED_ORGANIZATION_CONTEXT");
});

test("rejects mismatched request identity and event lineage", () => {
  assert.throws(() => validateIdentity(step5, { ...step6, verificationRequestHash: `0x${"99".repeat(32)}` }), /REQUEST_HASH_MISMATCH/);
  assert.throws(() => buildArtifact(step5, step6, { ...receipt, transactionVerified: { ...receipt.transactionVerified, transactionIndex: 7 } }), /EVENT_MISMATCH/);
});
