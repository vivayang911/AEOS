const assert = require("node:assert/strict");
const test = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { buildWalletHandoff } = require("./prepare-live-usdc-inflow-wallet-handoff.cjs");

const proof = JSON.parse(readFileSync(resolve(__dirname, "../../../reports/live-demo/real-usdc-inflow-usc-proof-v1.json"), "utf8"));
const request = JSON.parse(readFileSync(resolve(__dirname, "../../../reports/live-demo/real-usdc-inflow-usc-verification-request-v1.json"), "utf8"));
const observation = { observedAt: "2026-08-25T00:00:00.000Z", observedAtBlock: 1, chainId: 102031, targetIdentityVerified: true, targetCodeObserved: "0x", simulationPassed: true, estimatedGas: "100", observedMaxFeePerGasWei: "2", estimatedMaximumCostWei: "200", walletBalanceWei: "1000" };

test("freezes only a successful read-only preflight behind explicit wallet confirmation", () => {
  const value = buildWalletHandoff(proof, request, observation);
  assert.equal(value.status, "READY_FOR_USER_WALLET_CONFIRMATION");
  assert.equal(value.transaction.value, "0x0");
  assert.equal(value.preflight.simulationPassed, true);
  assert.equal(value.controls.requiresExplicitButtonClick, true);
  assert.equal(value.controls.signed, false);
  assert.equal(value.controls.submitted, false);
  assert.equal(value.controls.assetExecutionAuthorized, false);
});

test("fails closed on chain, precompile identity, simulation, gas, and balance failures", () => {
  assert.throws(() => buildWalletHandoff(proof, request, { ...observation, chainId: 1 }), /CHAIN_MISMATCH/);
  assert.throws(() => buildWalletHandoff(proof, request, { ...observation, targetIdentityVerified: false }), /IDENTITY_MISMATCH/);
  assert.throws(() => buildWalletHandoff(proof, request, { ...observation, simulationPassed: false }), /SIMULATION_FAILED/);
  assert.throws(() => buildWalletHandoff(proof, request, { ...observation, estimatedGas: "0" }), /GAS_INVALID/);
  assert.throws(() => buildWalletHandoff(proof, request, { ...observation, walletBalanceWei: "199" }), /BALANCE_INSUFFICIENT/);
});
