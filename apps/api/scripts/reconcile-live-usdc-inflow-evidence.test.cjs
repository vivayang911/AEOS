const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { buildEvidenceFact, validateFinality } = require("./reconcile-live-usdc-inflow-evidence.cjs");

const proof = JSON.parse(readFileSync(resolve(__dirname, "../../../reports/live-demo/real-usdc-inflow-usc-proof-retry-1.json"), "utf8"));
const request = JSON.parse(readFileSync(resolve(__dirname, "../../../reports/live-demo/real-usdc-inflow-usc-verification-request-retry-1.json"), "utf8"));
const finality = JSON.parse(readFileSync(resolve(__dirname, "../../../reports/live-demo/real-usdc-inflow-usc-transaction-verified-retry-1.json"), "utf8"));

test("normalizes the verified test-USDC inflow without promoting it to a balance", () => {
  assert.doesNotThrow(() => validateFinality(proof, request, finality));
  const built = buildEvidenceFact(proof, request, finality, new Date("2026-08-25T07:00:00.000Z"));
  assert.equal(built.fact.predicate, "asset.transfer.inflow");
  assert.equal(built.fact.value.amountBaseUnits, "20000000");
  assert.equal(built.fact.value.currentBalanceVerified, false);
  assert.equal(built.fact.value.testnetAssetOnly, true);
  assert.equal(built.qualityScore, 100);
  assert.equal(built.freshnessStatus, "FRESH");
});

test("fails closed when finality lineage or authority is promoted", () => {
  assert.throws(() => validateFinality(proof, request, { ...finality, verificationRequestHash: `0x${"99".repeat(32)}` }), /LINEAGE_MISMATCH/);
  assert.throws(() => validateFinality(proof, request, { ...finality, controls: { ...finality.controls, assetExecutionAuthorized: true } }), /AUTHORITY_INVALID/);
  assert.throws(() => validateFinality(proof, request, { ...finality, canonicalSubmission: { ...finality.canonicalSubmission, transactionVerified: { ...finality.canonicalSubmission.transactionVerified, transactionIndex: 8 } } }), /EVENT_MISMATCH/);
});
