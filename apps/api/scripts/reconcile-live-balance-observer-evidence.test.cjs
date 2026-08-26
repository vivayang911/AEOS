const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { buildEvidenceFact, validateFinality } = require("./reconcile-live-balance-observer-evidence.cjs");

const load = (name) => JSON.parse(readFileSync(resolve(__dirname, `../../../reports/live-demo/${name}`), "utf8"));
const proof = load("live-balance-observer-usc-proof-retry-1.json");
const request = load("live-balance-observer-usc-verification-request-retry-1.json");
const finality = load("live-balance-observer-usc-transaction-verified-retry-1.json");

test("normalizes the observer return as a block-specific balance fact", () => {
  assert.doesNotThrow(() => validateFinality(proof, request, finality));
  const built = buildEvidenceFact(proof, request, finality, new Date("2026-08-25T12:57:00.000Z"));
  assert.equal(built.fact.predicate, "asset.balance");
  assert.equal(built.fact.value.amount, "20000000");
  assert.equal(built.fact.value.currentAtObservationBlockOnly, true);
  assert.equal(built.fact.value.continuouslyCurrent, false);
  assert.equal(built.freshnessStatus, "FRESH");
  assert.equal(built.qualityScore, 100);
});

test("expires volatile balance state independently of proof validity", () => {
  const built = buildEvidenceFact(proof, request, finality, new Date("2026-08-25T13:02:00.000Z"));
  assert.equal(built.freshnessStatus, "STALE");
  assert.equal(built.qualityScore, 80);
  assert.equal(built.fact.verificationStatus, "VERIFIED");
});

test("rejects lineage, event, and authority promotion", () => {
  assert.throws(() => validateFinality(proof, request, { ...finality, verificationRequestHash: `0x${"9".repeat(64)}` }), /LINEAGE_MISMATCH/);
  assert.throws(() => validateFinality(proof, request, { ...finality, canonicalSubmission: { ...finality.canonicalSubmission, transactionVerified: { ...finality.canonicalSubmission.transactionVerified, transactionIndex: 9 } } }), /EVENT_MISMATCH/);
  assert.throws(() => validateFinality(proof, request, { ...finality, controls: { ...finality.controls, assetExecutionAuthorized: true } }), /FINALITY_INVALID/);
});
