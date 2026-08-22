const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");
const { JsonRpcProvider, formatEther, getAddress, getCreateAddress } = require("ethers");
const { buildEvidenceAnchorDeploymentPlan, EVIDENCE_ANCHOR_CHAIN_ID, EVIDENCE_ANCHOR_NATIVE_QUERY_VERIFIER, EVIDENCE_ANCHOR_SOURCE_CHAIN_KEY } = require("../dist/deployment-engine");

async function main() {
  const deployer = getAddress(required("EVIDENCE_ANCHOR_DEPLOYER_ADDRESS"));
  const rpcUrl = process.env.EVIDENCE_ANCHOR_DEPLOY_RPC_URL || "https://rpc.cc3-testnet.creditcoin.network/";
  const artifactPath = resolve(process.env.EVIDENCE_ANCHOR_ARTIFACT_PATH || resolve(__dirname, "../../../contracts/out/EvidenceAnchorASC.sol/EvidenceAnchorASC.json"));
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const plan = buildEvidenceAnchorDeploymentPlan({ chainId: EVIDENCE_ANCHOR_CHAIN_ID, nativeQueryVerifier: EVIDENCE_ANCHOR_NATIVE_QUERY_VERIFIER, sourceChainKey: EVIDENCE_ANCHOR_SOURCE_CHAIN_KEY, creationBytecode: artifact.bytecode?.object, runtimeBytecode: artifact.deployedBytecode?.object, artifactCompiler: artifact.metadata?.compiler?.version || "unknown", artifactSource: "contracts/src/EvidenceAnchorASC.sol" });
  const rpc = new JsonRpcProvider(rpcUrl, EVIDENCE_ANCHOR_CHAIN_ID, { staticNetwork: true });
  const [network, blockNumber, balance, pendingNonce, feeData] = await Promise.all([rpc.getNetwork(), rpc.getBlockNumber(), rpc.getBalance(deployer), rpc.getTransactionCount(deployer, "pending"), rpc.getFeeData()]);
  if (Number(network.chainId) !== EVIDENCE_ANCHOR_CHAIN_ID) throw new Error("EVIDENCE_ANCHOR_DEPLOYMENT_CHAIN_INVALID");
  const gasEstimate = await rpc.estimateGas({ from: deployer, data: plan.unsignedTransaction.data, value: 0n });
  const maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
  if (!maxFeePerGas) throw new Error("EVIDENCE_ANCHOR_FEE_DATA_UNAVAILABLE");
  const handoff = {
    schemaVersion: "evidence-anchor.wallet-deployment-handoff.v1",
    generatedAt: new Date().toISOString(),
    observedBlockNumber: blockNumber,
    chain: { name: "Creditcoin Testnet", chainId: EVIDENCE_ANCHOR_CHAIN_ID, rpcUrl, explorerUrl: "https://creditcoin-testnet.blockscout.com/", currencySymbol: "CTC" },
    deployer,
    balance: { wei: balance.toString(), ctc: formatEther(balance) },
    pendingNonce,
    predictedContractAddress: getCreateAddress({ from: deployer, nonce: pendingNonce }),
    gas: { estimate: gasEstimate.toString(), observedMaxFeePerGas: maxFeePerGas.toString(), estimatedMaxCostWei: (gasEstimate * maxFeePerGas).toString() },
    plan,
    confirmation: { requiresUserWalletConfirmation: true, transactionHash: null, submitted: false, signed: false },
    warnings: ["Prediction is valid only while the deployer pending nonce is unchanged.", "Re-run this command immediately before wallet confirmation.", "AEOS cannot sign or broadcast this transaction."],
    containsPrivateKey: false,
    aeosSigningCapability: false,
    aeosBroadcastCapability: false,
    assetExecutionAuthorized: false,
  };
  const outputPath = resolve(process.env.EVIDENCE_ANCHOR_HANDOFF_PATH || resolve(__dirname, "../../../reports/deployment/evidence-anchor-wallet-handoff.json"));
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(handoff, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(JSON.stringify({ status: "PREPARED_UNSIGNED", outputPath, chainId: handoff.chain.chainId, deployer, pendingNonce, predictedContractAddress: handoff.predictedContractAddress, balanceCTC: handoff.balance.ctc, gasEstimate: handoff.gas.estimate, estimatedMaxCostWei: handoff.gas.estimatedMaxCostWei, planHash: plan.planHash, initCodeHash: plan.unsignedTransaction.initCodeHash, signed: false, submitted: false, assetExecutionAuthorized: false }, null, 2));
}

function required(name) { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; }
main().catch((error) => { console.error(error instanceof Error ? error.message : "EVIDENCE_ANCHOR_HANDOFF_FAILED"); process.exit(1); });
