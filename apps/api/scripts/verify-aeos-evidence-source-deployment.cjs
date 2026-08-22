const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { Contract, JsonRpcProvider, getAddress } = require("ethers");
const { buildAEOSEvidenceSourceDeploymentPlan, verifyAEOSEvidenceSourceReadback, AEOS_EVIDENCE_SOURCE_CHAIN_ID } = require("../dist/deployment-engine");

function required(name) { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; }

async function main() {
  const chainId = Number(process.env.AEOS_EVIDENCE_SOURCE_DEPLOY_CHAIN_ID ?? AEOS_EVIDENCE_SOURCE_CHAIN_ID);
  const reporter = required("AEOS_EVIDENCE_SOURCE_REPORTER_ADDRESS");
  const artifactPath = resolve(process.env.AEOS_EVIDENCE_SOURCE_ARTIFACT_PATH || resolve(__dirname, "../../../contracts/out/AEOSTreasuryEvidenceSource.sol/AEOSTreasuryEvidenceSource.json"));
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const plan = buildAEOSEvidenceSourceDeploymentPlan({ chainId, reporter, creationBytecode: artifact.bytecode?.object, runtimeBytecode: artifact.deployedBytecode?.object, artifactCompiler: artifact.metadata?.compiler?.version || "unknown", artifactSource: "contracts/src/AEOSTreasuryEvidenceSource.sol" });
  const address = getAddress(required("AEOS_EVIDENCE_SOURCE_DEPLOYED_ADDRESS"));
  const txHash = required("AEOS_EVIDENCE_SOURCE_DEPLOYMENT_TX_HASH").toLowerCase();
  const rpc = new JsonRpcProvider(required("AEOS_EVIDENCE_SOURCE_DEPLOY_RPC_URL"), chainId, { staticNetwork: true });
  const contract = new Contract(address, ["function reporter() view returns(address)"], rpc);
  const [network, code, actualReporter, receipt, transaction, latest] = await Promise.all([rpc.getNetwork(), rpc.getCode(address), contract.reporter(), rpc.getTransactionReceipt(txHash), rpc.getTransaction(txHash), rpc.getBlockNumber()]);
  if (!receipt) throw new Error("AEOS_EVIDENCE_SOURCE_DEPLOYMENT_RECEIPT_MISSING");
  if (!transaction) throw new Error("AEOS_EVIDENCE_SOURCE_DEPLOYMENT_TRANSACTION_MISSING");
  const result = verifyAEOSEvidenceSourceReadback({ expectedChainId: chainId, actualChainId: Number(network.chainId), expectedReporter: reporter, actualReporter, expectedInitCodeHash: plan.unsignedTransaction.initCodeHash, deploymentTransactionData: transaction.data, deploymentTransactionTo: transaction.to, deploymentTransactionValue: transaction.value.toString(), address, code, deploymentTransactionHash: txHash, receiptStatus: receipt.status, receiptTo: receipt.to, receiptContractAddress: receipt.contractAddress, receiptBlockNumber: receipt.blockNumber, latestBlockNumber: latest, minimumConfirmations: Number(process.env.AEOS_EVIDENCE_SOURCE_MIN_CONFIRMATIONS ?? 2) });
  console.log(JSON.stringify({ ...result, expectedPlanHash: plan.planHash, expectedInitCodeHash: plan.unsignedTransaction.initCodeHash }, null, 2));
  if (result.status !== "VERIFIED") process.exitCode = 1;
}
main().catch(error => { console.error(error instanceof Error ? error.message : "AEOS_EVIDENCE_SOURCE_DEPLOYMENT_VERIFICATION_FAILED"); process.exit(1); });
