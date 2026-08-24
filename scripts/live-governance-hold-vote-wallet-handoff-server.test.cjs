const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const h = (character) => `0x${character.repeat(64)}`;
const from = "0x444d510728fb8072351cb5d0e88432e6a8501dfa";
const to = "0xfe90b087fae789e043514b6ac3dbd7fd2d970268";
const handoff = {
  schemaVersion: "aeos.live-governance-hold-vote.v1",
  status: "VOTE_FOR_REQUEST_PREPARED",
  artifactHash: h("a"),
  lineage: { proposalArtifactHash: h("b"), proposalId: "123", attemptNumber: 3, attemptIdentity: h("c") },
  activeWindow: { votingWindowBlocks: 240 },
  votingCapacity: { singleWalletMeetsQuorum: true, voterVotes: "1000000", quorumVotes: "40000" },
  unsignedTransaction: { chainId: 102031, from, to, value: "0x0", data: "0x1234", dataHash: h("d"), support: 1, validOnlyWhenProposalState: "Active" },
  controls: { signed: false, submitted: false, broadcastCapability: false, assetExecutionAuthorized: false },
};

function load(value = handoff) {
  const directory = mkdtempSync(join(tmpdir(), "aeos-hold-vote-"));
  const input = join(directory, "handoff.json");
  const output = join(directory, "submission.json");
  writeFileSync(input, JSON.stringify(value));
  process.env.AEOS_GOVERNANCE_HOLD_VOTE_PATH = input;
  process.env.AEOS_GOVERNANCE_HOLD_VOTE_SUBMISSION_PATH = output;
  delete require.cache[require.resolve("./live-governance-hold-vote-wallet-handoff-server.cjs")];
  return { ...require("./live-governance-hold-vote-wallet-handoff-server.cjs"), output };
}

test("accepts only an append-only active zero-value For vote", () => {
  assert.deepEqual(load().readHandoff(), handoff);
  assert.throws(() => load({ ...handoff, lineage: { ...handoff.lineage, attemptNumber: 1 } }).readHandoff(), /lineage/);
  assert.throws(() => load({ ...handoff, activeWindow: { votingWindowBlocks: 8 } }).readHandoff(), /lineage/);
  assert.throws(() => load({ ...handoff, controls: { ...handoff.controls, broadcastCapability: true } }).readHandoff(), /authority/);
});

test("records the actual attempt without finality claims", () => {
  const loaded = load();
  const record = loaded.recordSubmission({ transactionHash: h("e"), from }, handoff);
  assert.equal(record.status, "VOTE_FOR_WALLET_SUBMITTED");
  assert.equal(record.attemptNumber, 3);
  assert.equal(record.voteCastEventVerified, false);
  assert.equal(record.quorumVerified, false);
  assert.equal(record.assetExecutionAuthorized, false);
  assert.deepEqual(JSON.parse(readFileSync(loaded.output, "utf8")), record);
});

test("UI selects the injected MetaMask provider and exposes connection progress", () => {
  const source = readFileSync(join(__dirname, "live-governance-hold-vote-wallet-handoff.js"), "utf8");
  assert.match(source, /selectMetaMaskProvider/);
  assert.match(source, /injected\.providers/);
  assert.match(source, /candidate\?\.isMetaMask/);
  assert.match(source, /ethereum#initialized/);
  assert.match(source, /CONNECTING: waiting for MetaMask account approval/);
  assert.match(source, /CONNECT FAILED:/);
  assert.doesNotMatch(source, /(?<![\w.])ethereum\.request/);
});

test("UI rechecks Active window and never batches", () => {
  const source = readFileSync(join(__dirname, "live-governance-hold-vote-wallet-handoff.js"), "utf8");
  for (const value of ["state(uint256)", "proposalDeadline(uint256)", "votingPeriod()", "eth_call", "eth_estimateGas", "eth_sendTransaction"]) {
    assert.match(source, new RegExp(value.replace(/[()]/g, "\\$&")));
  }
  assert.doesNotMatch(source, /wallet_sendCalls|privateKey|setInterval/);
});
