const assert = require("node:assert/strict");
const test = require("node:test");
const { Interface } = require("ethers");
const { buildArtifact } = require("./prepare-live-usc-verification-request.cjs");

const proof = { chainKey: 1, headerNumber: 123, txIndex: 4, txHash: `0x${"11".repeat(32)}`, txBytes: "0x01", merkleProof: { root: `0x${"22".repeat(32)}`, siblings: [] }, continuityProof: { lowerEndpointDigest: `0x${"33".repeat(32)}`, roots: [] }, cached: false, generatedAt: "2026-08-22T00:00:00.000Z" };
const step4 = { schemaVersion: "aeos.live-attestcoin-step.v1", step: 4, status: "PROOF_VERIFIED", provider: "attestcoin-usc-sdk-0.18.0", source: { transactionHash: proof.txHash, blockNumber: proof.headerNumber }, proof, verification: { staticNativeVerificationPassed: true, assetExecutionAuthorized: false } };

test("builds a deterministic unsigned zero-value step 5 handoff", () => {
  const first = buildArtifact(step4, "0x444D510728FB8072351cB5d0E88432e6a8501DFA");
  const second = buildArtifact(step4, "0x444D510728FB8072351cB5d0E88432e6a8501DFA");
  assert.deepEqual(first, second);
  assert.equal(first.verificationRequest.chainId, 102031);
  assert.equal(first.verificationRequest.to, "0x0000000000000000000000000000000000000fd2");
  assert.equal(first.verificationRequest.value, "0x0");
  assert.deepEqual(first.controls, { zeroValue: true, requiresUserWalletConfirmation: true, signed: false, submitted: false, signerCustody: false, broadcastCapability: false, assetExecutionAuthorized: false });
  const parsed = new Interface(["function verifyAndEmit(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[])) returns (bool)"]).parseTransaction({ data: first.verificationRequest.data, value: 0n });
  assert.equal(parsed.name, "verifyAndEmit");
  assert.equal(parsed.args[0], 1n);
  assert.equal(parsed.args[1], 123n);
});

test("rejects a proof/source mismatch and a promoted authority claim", () => {
  assert.throws(() => buildArtifact({ ...step4, source: { ...step4.source, blockNumber: 124 } }, "0x444D510728FB8072351cB5d0E88432e6a8501DFA"), /PROOF_SOURCE_MISMATCH/);
  assert.throws(() => buildArtifact({ ...step4, verification: { ...step4.verification, assetExecutionAuthorized: true } }, "0x444D510728FB8072351cB5d0E88432e6a8501DFA"), /TRUTH_BOUNDARY_INVALID/);
});
