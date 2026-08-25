const assert = require("node:assert/strict");
const test = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { Interface } = require("ethers");
const { buildVerificationArtifact, validateVerificationArtifact } = require("./prepare-live-usdc-inflow-verification-request.cjs");

const proof = JSON.parse(readFileSync(resolve(__dirname, "../../../reports/live-demo/real-usdc-inflow-usc-proof-v1.json"), "utf8"));
const wallet = "0x444D510728FB8072351cB5d0E88432e6a8501DFA";

test("builds deterministic zero-value unsigned verifyAndEmit calldata from the frozen USDC proof", () => {
  const first = buildVerificationArtifact(proof, wallet);
  const second = buildVerificationArtifact(proof, wallet);
  assert.deepEqual(first, second);
  assert.equal(first.verificationRequest.chainId, 102031);
  assert.equal(first.verificationRequest.to, "0x0000000000000000000000000000000000000fd2");
  assert.equal(first.verificationRequest.value, "0x0");
  assert.equal(first.controls.signed, false);
  assert.equal(first.controls.submitted, false);
  assert.equal(first.controls.assetExecutionAuthorized, false);
  const parsed = new Interface(["function verifyAndEmit(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[])) returns (bool)"]).parseTransaction({ data: first.verificationRequest.data, value: 0n });
  assert.equal(parsed.name, "verifyAndEmit");
  assert.equal(parsed.args[0], 1n);
  assert.equal(parsed.args[1], 11_561_243n);
  assert.equal(validateVerificationArtifact(proof, first).verificationRequestHash, first.verificationRequestHash);
});

test("rejects request, lineage, truth, and authority mutation", () => {
  const artifact = buildVerificationArtifact(proof, wallet);
  assert.throws(() => validateVerificationArtifact(proof, { ...artifact, verificationRequest: { ...artifact.verificationRequest, value: "0x1" } }), /REQUEST_HASH_MISMATCH/);
  assert.throws(() => validateVerificationArtifact(proof, { ...artifact, sourceProof: { ...artifact.sourceProof, sourceBlockNumber: 1 } }), /LINEAGE_MISMATCH/);
  assert.throws(() => validateVerificationArtifact(proof, { ...artifact, controls: { ...artifact.controls, submitted: true } }), /AUTHORITY_BOUNDARY_INVALID/);
  assert.throws(() => validateVerificationArtifact(proof, { ...artifact, truthBoundary: { ...artifact.truthBoundary, priceVerified: true } }), /TRUTH_BOUNDARY_INVALID/);
});
