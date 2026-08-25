const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const handoff = { schemaVersion: "aeos.live-attestcoin-step.v1", step: 5, status: "VERIFICATION_PREPARED", verificationRequestHash: `0x${"11".repeat(32)}`, verificationRequest: { chainId: 102031, from: "0x444d510728fb8072351cb5d0e88432e6a8501dfa", to: "0x0000000000000000000000000000000000000fd2", data: "0x02f4d16700", value: "0x0" }, controls: { signed: false, submitted: false, assetExecutionAuthorized: false } };
const liveUsdc = { schemaVersion: "aeos.live-economic-evidence.usdc-wallet-handoff.v1", status: "READY_FOR_USER_WALLET_CONFIRMATION", sourceProofBundleHash: `0x${"44".repeat(32)}`, verificationRequestHash: handoff.verificationRequestHash, transaction: handoff.verificationRequest, dataHash: `0x${"55".repeat(32)}`, preflight: { simulationPassed: true }, controls: { requiresExplicitButtonClick: true, signed: false, submitted: false, assetExecutionAuthorized: false } };

function loadWithPaths(value = handoff) {
  const directory = mkdtempSync(join(tmpdir(), "aeos-usc-handoff-"));
  const input = join(directory, "step5.json"); const output = join(directory, "step6.json");
  writeFileSync(input, JSON.stringify(value));
  process.env.AEOS_WALLET_HANDOFF_PATH = input; process.env.AEOS_WALLET_SUBMISSION_PATH = output;
  delete require.cache[require.resolve("./usc-verification-wallet-handoff-server.cjs")];
  return { ...require("./usc-verification-wallet-handoff-server.cjs"), output };
}

test("accepts only the exact unsigned Step 5 Creditcoin request", () => {
  assert.deepEqual(loadWithPaths().readHandoff(), handoff);
  assert.throws(() => loadWithPaths({ ...handoff, verificationRequest: { ...handoff.verificationRequest, value: "0x1" } }).readHandoff(), /transaction invalid/);
  assert.throws(() => loadWithPaths({ ...handoff, controls: { ...handoff.controls, assetExecutionAuthorized: true } }).readHandoff(), /authority boundary/);
});

test("accepts the live USDC preflight only when simulation and explicit-click gates passed", () => {
  assert.deepEqual(loadWithPaths(liveUsdc).readHandoff(), liveUsdc);
  assert.throws(() => loadWithPaths({ ...liveUsdc, preflight: { simulationPassed: false } }).readHandoff(), /authority boundary/);
  assert.throws(() => loadWithPaths({ ...liveUsdc, controls: { ...liveUsdc.controls, requiresExplicitButtonClick: false } }).readHandoff(), /authority boundary/);
});

test("records one immutable public transaction identity without custody claims", () => {
  const loaded = loadWithPaths(); const transactionHash = `0x${"22".repeat(32)}`;
  const record = loaded.recordSubmission({ transactionHash, from: handoff.verificationRequest.from }, handoff);
  assert.equal(record.status, "WALLET_SUBMITTED"); assert.equal(record.receiptVerified, false); assert.equal(record.transactionVerifiedEventObserved, false); assert.equal(record.privateKeyReceived, false); assert.equal(record.assetExecutionAuthorized, false);
  assert.deepEqual(JSON.parse(readFileSync(loaded.output, "utf8")), record);
  assert.throws(() => loaded.recordSubmission({ transactionHash: `0x${"33".repeat(32)}`, from: handoff.verificationRequest.from }, handoff), /different identity/);
});

test("live USDC submission remains a wallet identity only, not finality", () => {
  const loaded = loadWithPaths(liveUsdc); const transactionHash = `0x${"66".repeat(32)}`;
  const record = loaded.recordSubmission({ transactionHash, from: liveUsdc.transaction.from }, liveUsdc);
  assert.equal(record.schemaVersion, "aeos.live-economic-evidence.usdc-wallet-submission.v1");
  assert.equal(record.sourceProofBundleHash, liveUsdc.sourceProofBundleHash);
  assert.equal(record.receiptVerified, false);
  assert.equal(record.transactionVerifiedEventObserved, false);
  assert.equal(record.assetExecutionAuthorized, false);
});

test("wallet page rechecks code, calldata, simulation and gas only after explicit clicks", () => {
  const source = readFileSync(join(__dirname, "usc-verification-wallet-handoff.js"), "utf8");
  for (const method of ["eth_getCode", "eth_call", "eth_estimateGas", "eth_gasPrice", "eth_sendTransaction"]) assert.match(source, new RegExp(method));
  assert.match(source, /crypto\.subtle\.digest/);
  assert.match(source, /addEventListener\("click"/);
  assert.doesNotMatch(source, /privateKey|eth_signTransaction|wallet_sendCalls|setInterval/);
});
