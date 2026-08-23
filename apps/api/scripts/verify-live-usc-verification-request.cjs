const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { Interface, JsonRpcProvider } = require("ethers");
const { BLOCK_PROVER_ADDRESS, CREDITCOIN_TESTNET_CHAIN_ID, buildUscVerificationRequest } = require("../dist/attestcoin-adapter");
const { hash } = require("./prepare-live-usc-verification-request.cjs");

async function main() {
  const step4 = JSON.parse(readFileSync(resolve(process.env.AEOS_LIVE_PROOF_OUTPUT || resolve(__dirname, "../../../reports/live-demo/step-4-usc-proof.json")), "utf8"));
  const step5 = JSON.parse(readFileSync(resolve(process.env.AEOS_LIVE_VERIFICATION_REQUEST_OUTPUT || resolve(__dirname, "../../../reports/live-demo/step-5-usc-verification-request.json")), "utf8"));
  if (step5?.step !== 5 || step5.status !== "VERIFICATION_PREPARED") throw new Error("LIVE_USC_STEP_5_INVALID");
  const expected = buildUscVerificationRequest(step4.proof, step5.verificationRequest.from);
  if (canonicalRequest(expected) !== canonicalRequest(step5.verificationRequest) || hash(expected) !== step5.verificationRequestHash) throw new Error("LIVE_USC_STEP_5_REQUEST_MISMATCH");
  if (expected.chainId !== CREDITCOIN_TESTNET_CHAIN_ID || expected.to !== BLOCK_PROVER_ADDRESS.toLowerCase() || expected.value !== "0x0") throw new Error("LIVE_USC_STEP_5_TARGET_MISMATCH");
  const parsed = new Interface(["function verifyAndEmit(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[])) returns (bool)"]).parseTransaction({ data: expected.data, value: 0n });
  if (!parsed || parsed.name !== "verifyAndEmit" || parsed.args[0] !== BigInt(step4.proof.chainKey) || parsed.args[1] !== BigInt(step4.proof.headerNumber)) throw new Error("LIVE_USC_STEP_5_CALLDATA_INVALID");
  const rpc = new JsonRpcProvider(process.env.CREDITCOIN_RPC_URL || "https://rpc.cc3-testnet.creditcoin.network/", CREDITCOIN_TESTNET_CHAIN_ID, { staticNetwork: true });
  const network = await rpc.getNetwork();
  if (Number(network.chainId) !== CREDITCOIN_TESTNET_CHAIN_ID) throw new Error("CREDITCOIN_CHAIN_MISMATCH");
  const transaction = { from: expected.from, to: expected.to, data: expected.data, value: 0n };
  const [callResult, estimatedGas, balance, blockNumber, feeData] = await Promise.all([rpc.call(transaction), rpc.estimateGas(transaction), rpc.getBalance(expected.from), rpc.getBlockNumber(), rpc.getFeeData()]);
  const simulationPassed = callResult === `0x${"0".repeat(63)}1`;
  if (!simulationPassed) throw new Error("VERIFY_AND_EMIT_SIMULATION_FALSE");
  const observedMaxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
  const estimatedMaximumCostWei = observedMaxFeePerGas == null ? null : estimatedGas * observedMaxFeePerGas;
  console.log(JSON.stringify({ status: "VERIFIED_FOR_USER_WALLET_HANDOFF", chainId: expected.chainId, observedAtBlock: blockNumber, from: expected.from, to: expected.to, value: expected.value, verificationRequestHash: step5.verificationRequestHash, method: parsed.name, chainKey: Number(parsed.args[0]), headerNumber: Number(parsed.args[1]), simulationPassed, estimatedGas: estimatedGas.toString(), observedMaxFeePerGasWei: observedMaxFeePerGas?.toString() ?? null, estimatedMaximumCostWei: estimatedMaximumCostWei?.toString() ?? null, observedWalletBalanceWei: balance.toString(), sufficientObservedBalanceForEstimate: estimatedMaximumCostWei == null ? null : balance >= estimatedMaximumCostWei, signed: false, submitted: false, transactionVerifiedEventObserved: false, signerCustody: false, broadcastCapability: false, assetExecutionAuthorized: false }, null, 2));
}

function canonicalRequest(value) {
  return JSON.stringify({ chainId: value.chainId, from: value.from.toLowerCase(), to: value.to.toLowerCase(), data: value.data.toLowerCase(), value: value.value });
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "LIVE_USC_VERIFICATION_REQUEST_VALIDATION_FAILED"); process.exit(1); });
