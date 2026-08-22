const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");
const { JsonRpcProvider, formatEther, getAddress, getCreateAddress } = require("ethers");
const { buildAEOSEvidenceSourceDeploymentPlan, AEOS_EVIDENCE_SOURCE_CHAIN_ID } = require("../dist/deployment-engine");

async function main() {
  const deployer = getAddress(required("AEOS_EVIDENCE_SOURCE_REPORTER_ADDRESS"));
  const rpcUrl = process.env.AEOS_EVIDENCE_SOURCE_DEPLOY_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
  const artifactPath = resolve(process.env.AEOS_EVIDENCE_SOURCE_ARTIFACT_PATH || resolve(__dirname, "../../../contracts/out/AEOSTreasuryEvidenceSource.sol/AEOSTreasuryEvidenceSource.json"));
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const plan = buildAEOSEvidenceSourceDeploymentPlan({ chainId: AEOS_EVIDENCE_SOURCE_CHAIN_ID, reporter: deployer, creationBytecode: artifact.bytecode?.object, runtimeBytecode: artifact.deployedBytecode?.object, artifactCompiler: artifact.metadata?.compiler?.version || "unknown", artifactSource: "contracts/src/AEOSTreasuryEvidenceSource.sol" });
  const rpc = new JsonRpcProvider(rpcUrl, AEOS_EVIDENCE_SOURCE_CHAIN_ID, { staticNetwork: true });
  const [network, blockNumber, balance, pendingNonce, feeData] = await Promise.all([rpc.getNetwork(), rpc.getBlockNumber(), rpc.getBalance(deployer), rpc.getTransactionCount(deployer, "pending"), rpc.getFeeData()]);
  if (Number(network.chainId) !== AEOS_EVIDENCE_SOURCE_CHAIN_ID) throw new Error("AEOS_EVIDENCE_SOURCE_DEPLOYMENT_CHAIN_INVALID");
  const gasEstimate = await rpc.estimateGas({ from: deployer, data: plan.unsignedTransaction.data, value: 0n });
  const maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
  if (!maxFeePerGas) throw new Error("AEOS_EVIDENCE_SOURCE_FEE_DATA_UNAVAILABLE");
  const handoff = {
    schemaVersion: "aeos-evidence-source.wallet-deployment-handoff.v1",
    generatedAt: new Date().toISOString(), observedBlockNumber: blockNumber,
    chain: { name: "Ethereum Sepolia", chainId: AEOS_EVIDENCE_SOURCE_CHAIN_ID, rpcUrl, explorerUrl: "https://sepolia.etherscan.io/", currencySymbol: "ETH" },
    deployer, balance: { wei: balance.toString(), native: formatEther(balance) }, pendingNonce,
    predictedContractAddress: getCreateAddress({ from: deployer, nonce: pendingNonce }),
    gas: { estimate: gasEstimate.toString(), observedMaxFeePerGas: maxFeePerGas.toString(), estimatedMaxCostWei: (gasEstimate * maxFeePerGas).toString() },
    plan, confirmation: { requiresUserWalletConfirmation: true, transactionHash: null, submitted: false, signed: false },
    warnings: ["Prediction is valid only while the deployer pending nonce is unchanged.", "Re-run this command immediately before wallet confirmation.", "AEOS cannot sign or broadcast this transaction."],
    containsPrivateKey: false, aeosSigningCapability: false, aeosBroadcastCapability: false, assetExecutionAuthorized: false,
  };
  const outputPath = resolve(process.env.AEOS_WALLET_HANDOFF_PATH || resolve(__dirname, "../../../reports/deployment/aeos-evidence-source-wallet-handoff.json"));
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(handoff, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(JSON.stringify({ status: "PREPARED_UNSIGNED", outputPath, chainId: handoff.chain.chainId, deployer, balanceETH: handoff.balance.native, pendingNonce, predictedContractAddress: handoff.predictedContractAddress, gasEstimate: handoff.gas.estimate, estimatedMaxCostWei: handoff.gas.estimatedMaxCostWei, planHash: plan.planHash, initCodeHash: plan.unsignedTransaction.initCodeHash, signed: false, submitted: false, assetExecutionAuthorized: false }, null, 2));
}

function required(name) { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; }
main().catch((error) => { console.error(error instanceof Error ? error.message : "AEOS_EVIDENCE_SOURCE_HANDOFF_FAILED"); process.exit(1); });
