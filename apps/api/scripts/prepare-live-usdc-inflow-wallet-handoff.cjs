const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");
const { JsonRpcProvider } = require("ethers");
const { CREDITCOIN_TESTNET_CHAIN_ID } = require("../dist/attestcoin-adapter");
const { hash } = require("./live-usdc-inflow-proof.cjs");
const { validateVerificationArtifact } = require("./prepare-live-usdc-inflow-verification-request.cjs");

function buildWalletHandoff(proofArtifact, requestArtifact, observation) {
  const request = validateVerificationArtifact(proofArtifact, requestArtifact);
  if (observation.chainId !== CREDITCOIN_TESTNET_CHAIN_ID) throw new Error("CREDITCOIN_CHAIN_MISMATCH");
  if (observation.targetIdentityVerified !== true) throw new Error("BLOCK_PROVER_IDENTITY_MISMATCH");
  if (observation.simulationPassed !== true) throw new Error("VERIFY_AND_EMIT_SIMULATION_FAILED");
  if (BigInt(observation.estimatedGas) <= 0n) throw new Error("VERIFY_AND_EMIT_GAS_INVALID");
  if (BigInt(observation.walletBalanceWei) < BigInt(observation.estimatedMaximumCostWei)) throw new Error("VERIFY_AND_EMIT_BALANCE_INSUFFICIENT");
  const transaction = { chainId: request.chainId, from: request.from, to: request.to, data: request.data, value: request.value };
  return {
    schemaVersion: "aeos.live-economic-evidence.usdc-wallet-handoff.v1",
    status: "READY_FOR_USER_WALLET_CONFIRMATION",
    sourceProofBundleHash: requestArtifact.sourceProof.bundleHash,
    verificationRequestHash: request.verificationRequestHash,
    transaction,
    dataHash: hash(transaction.data.toLowerCase()),
    preflight: {
      observedAt: observation.observedAt,
      observedAtBlock: observation.observedAtBlock,
      chainId: observation.chainId,
      targetIdentityVerified: true,
      targetCodeObserved: observation.targetCodeObserved,
      simulationPassed: true,
      estimatedGas: BigInt(observation.estimatedGas).toString(),
      observedMaxFeePerGasWei: BigInt(observation.observedMaxFeePerGasWei).toString(),
      estimatedMaximumCostWei: BigInt(observation.estimatedMaximumCostWei).toString(),
      walletBalanceWei: BigInt(observation.walletBalanceWei).toString(),
      sufficientObservedBalanceForEstimate: true,
    },
    controls: {
      requiresExplicitButtonClick: true,
      requiresMetaMaskConfirmation: true,
      signed: false,
      submitted: false,
      receiptVerified: false,
      transactionVerifiedEventObserved: false,
      signerCustody: false,
      broadcastCapability: false,
      assetExecutionAuthorized: false,
    },
  };
}

async function main() {
  const proofPath = resolve(process.argv[2] || process.env.AEOS_LIVE_USDC_PROOF_OUTPUT || resolve(__dirname, "../../../reports/live-demo/real-usdc-inflow-usc-proof-v1.json"));
  const requestPath = resolve(process.argv[3] || process.env.AEOS_LIVE_USDC_VERIFICATION_REQUEST_OUTPUT || resolve(__dirname, "../../../reports/live-demo/real-usdc-inflow-usc-verification-request-v1.json"));
  const outputPath = resolve(process.argv[4] || process.env.AEOS_LIVE_USDC_WALLET_HANDOFF_OUTPUT || resolve(__dirname, "../../../reports/live-demo/real-usdc-inflow-usc-wallet-handoff-v1.json"));
  const proofArtifact = JSON.parse(readFileSync(proofPath, "utf8"));
  const requestArtifact = JSON.parse(readFileSync(requestPath, "utf8"));
  const request = validateVerificationArtifact(proofArtifact, requestArtifact);
  const rpc = new JsonRpcProvider(process.env.CREDITCOIN_RPC_URL || "https://rpc.cc3-testnet.creditcoin.network/", CREDITCOIN_TESTNET_CHAIN_ID, { staticNetwork: true });
  const transaction = { from: request.from, to: request.to, data: request.data, value: 0n };
  const [network, code, callResult, estimatedGas, balance, blockNumber, feeData] = await Promise.all([
    rpc.getNetwork(), rpc.getCode(request.to), rpc.call(transaction), rpc.estimateGas(transaction), rpc.getBalance(request.from), rpc.getBlockNumber(), rpc.getFeeData(),
  ]);
  const maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
  if (maxFeePerGas == null) throw new Error("CREDITCOIN_FEE_DATA_UNAVAILABLE");
  const handoff = buildWalletHandoff(proofArtifact, requestArtifact, {
    observedAt: new Date().toISOString(),
    observedAtBlock: blockNumber,
    chainId: Number(network.chainId),
    targetIdentityVerified: request.to === "0x0000000000000000000000000000000000000fd2",
    targetCodeObserved: code,
    simulationPassed: callResult === `0x${"0".repeat(63)}1`,
    estimatedGas: estimatedGas.toString(),
    observedMaxFeePerGasWei: maxFeePerGas.toString(),
    estimatedMaximumCostWei: (estimatedGas * maxFeePerGas).toString(),
    walletBalanceWei: balance.toString(),
  });
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(handoff, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(JSON.stringify({ status: handoff.status, outputPath, verificationRequestHash: handoff.verificationRequestHash, ...handoff.preflight, ...handoff.controls }, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error instanceof Error ? error.message : "LIVE_USDC_WALLET_PREFLIGHT_FAILED"); process.exit(1); });

module.exports = { buildWalletHandoff };
