const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const handoff = { schemaVersion: "aeos.live-attestcoin-step.v1", step: 9, status: "ANCHOR_REQUEST_PREPARED", artifactHash: `0x${"11".repeat(32)}`, handoff: { id: "anchorhandoff_test", commitmentId: `0x${"22".repeat(32)}` }, unsignedTransaction: { chainId: 102031, from: "0x444d510728fb8072351cb5d0e88432e6a8501dfa", to: "0x5de85313c5622e3707c3fed8932f51e5991e62c2", data: "0x250e9b3f00", dataHash: `0x${"33".repeat(32)}`, value: "0x0" }, controls: { signed: false, submitted: false, signerCustody: false, broadcastCapability: false, assetExecutionAuthorized: false } };

function loadWithPaths(value = handoff) {
  const directory = mkdtempSync(join(tmpdir(), "aeos-live-anchor-handoff-"));
  const input = join(directory, "step9.json"); const output = join(directory, "step10.json");
  writeFileSync(input, JSON.stringify(value));
  process.env.AEOS_WALLET_HANDOFF_PATH = input; process.env.AEOS_WALLET_SUBMISSION_PATH = output;
  delete require.cache[require.resolve("./live-evidence-anchor-wallet-handoff-server.cjs")];
  return { ...require("./live-evidence-anchor-wallet-handoff-server.cjs"), output };
}

test("accepts only the exact unsigned zero-value Step 9 ASC request", () => {
  assert.deepEqual(loadWithPaths().readHandoff(), handoff);
  assert.throws(() => loadWithPaths({ ...handoff, unsignedTransaction: { ...handoff.unsignedTransaction, value: "0x1" } }).readHandoff(), /transaction invalid/);
  assert.throws(() => loadWithPaths({ ...handoff, unsignedTransaction: { ...handoff.unsignedTransaction, to: "0x1111111111111111111111111111111111111111" } }).readHandoff(), /transaction invalid/);
  assert.throws(() => loadWithPaths({ ...handoff, controls: { ...handoff.controls, broadcastCapability: true } }).readHandoff(), /authority boundary/);
});

test("page requires code, calldata and static-call preflight before MetaMask", () => {
  const source = readFileSync(join(__dirname, "live-evidence-anchor-wallet-handoff.js"), "utf8");
  for (const method of ["wallet_switchEthereumChain", "eth_getCode", "web3_sha3", "eth_call", "eth_estimateGas", "eth_sendTransaction"]) assert.match(source, new RegExp(method));
  assert.match(source, /to: tx\.to, data: tx\.data, value: "0x0"/);
  assert.doesNotMatch(source, /privateKey|eth_signTransaction|wallet_sendCalls/);
});

test("records one immutable public submission without custody claims", () => {
  const loaded = loadWithPaths(); const transactionHash = `0x${"44".repeat(32)}`;
  const record = loaded.recordSubmission({ transactionHash, from: handoff.unsignedTransaction.from }, handoff);
  assert.equal(record.status, "ANCHOR_WALLET_SUBMITTED"); assert.equal(record.receiptVerified, false); assert.equal(record.evidenceAnchoredEventObserved, false); assert.equal(record.privateKeyReceived, false); assert.equal(record.assetExecutionAuthorized, false);
  assert.deepEqual(JSON.parse(readFileSync(loaded.output, "utf8")), record);
  assert.throws(() => loaded.recordSubmission({ transactionHash: `0x${"55".repeat(32)}`, from: handoff.unsignedTransaction.from }, handoff), /different identity/);
});
