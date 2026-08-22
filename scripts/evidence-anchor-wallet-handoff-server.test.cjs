const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const handoff = JSON.parse(readFileSync(join(__dirname, "../reports/deployment/evidence-anchor-wallet-handoff.json"), "utf8"));

test("wallet page retains explicit user confirmation and deterministic checks", () => {
  const source = readFileSync(join(__dirname, "evidence-anchor-wallet-handoff.js"), "utf8");
  assert.match(source, /eth_requestAccounts/);
  assert.match(source, /wallet_switchEthereumChain/);
  assert.match(source, /wallet_requestPermissions/);
  assert.match(source, /wallet_revokePermissions/);
  assert.match(source, /eth_getTransactionCount/);
  assert.match(source, /web3_sha3/);
  assert.match(source, /eth_sendTransaction/);
  assert.match(source, /handoff\.chain\.chainId\.toString\(16\)/);
  assert.doesNotMatch(source, /privateKey|eth_signTransaction|wallet_sendCalls/);
  assert.match(source, /deployButton\.disabled = true/);
});

test("server accepts the bounded Sepolia evidence-source handoff schema", () => {
  const directory = mkdtempSync(join(tmpdir(), "aeos-source-handoff-"));
  const sourcePath = join(directory, "handoff.json");
  const originalPath = process.env.AEOS_WALLET_HANDOFF_PATH;
  writeFileSync(sourcePath, JSON.stringify({ ...handoff, schemaVersion: "aeos-evidence-source.wallet-deployment-handoff.v1", chain: { ...handoff.chain, name: "Ethereum Sepolia", chainId: 11155111, currencySymbol: "ETH" } }));
  process.env.AEOS_WALLET_HANDOFF_PATH = sourcePath;
  const modulePath = require.resolve("./evidence-anchor-wallet-handoff-server.cjs");
  delete require.cache[modulePath];
  const { readHandoff } = require(modulePath);
  assert.equal(readHandoff().chain.chainId, 11155111);
  if (originalPath === undefined) delete process.env.AEOS_WALLET_HANDOFF_PATH;
  else process.env.AEOS_WALLET_HANDOFF_PATH = originalPath;
  rmSync(directory, { recursive: true, force: true });
});

test("handoff is a zero-value contract creation for the expected chain", () => {
  assert.equal(handoff.chain.chainId, 102031);
  assert.equal(handoff.plan.unsignedTransaction.to, null);
  assert.equal(handoff.plan.unsignedTransaction.value, "0");
  assert.equal(handoff.plan.requiresUserWalletConfirmation, true);
  assert.equal(handoff.aeosSigningCapability, false);
  assert.equal(handoff.aeosBroadcastCapability, false);
});

test("submission records are immutable", () => {
  const directory = mkdtempSync(join(tmpdir(), "aeos-handoff-"));
  const submissionPath = join(directory, "submission.json");
  const originalPath = process.env.EVIDENCE_ANCHOR_SUBMISSION_PATH;
  process.env.EVIDENCE_ANCHOR_SUBMISSION_PATH = submissionPath;
  const modulePath = require.resolve("./evidence-anchor-wallet-handoff-server.cjs");
  delete require.cache[modulePath];
  const { recordSubmission } = require(modulePath);
  const firstHash = `0x${"1".repeat(64)}`;
  const secondHash = `0x${"2".repeat(64)}`;
  const first = recordSubmission({ transactionHash: firstHash, from: handoff.deployer }, handoff);
  assert.equal(first.transactionHash, firstHash);
  assert.throws(() => recordSubmission({ transactionHash: secondHash, from: handoff.deployer }, handoff), /Immutable submission record/);
  assert.equal(JSON.parse(readFileSync(submissionPath, "utf8")).transactionHash, firstHash);
  if (originalPath === undefined) delete process.env.EVIDENCE_ANCHOR_SUBMISSION_PATH;
  else process.env.EVIDENCE_ANCHOR_SUBMISSION_PATH = originalPath;
  rmSync(directory, { recursive: true, force: true });
});
