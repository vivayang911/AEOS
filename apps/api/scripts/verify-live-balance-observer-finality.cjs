const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { Contract, JsonRpcProvider } = require("ethers");
const { buildBalanceObservationRequestFromCommitments, materializeBalanceObserverRuntimeBytecode, verifyBalanceObservationReceipt, verifyBalanceObserverDeploymentReadback } = require("../dist/balance-observer-engine");

const ROOT = resolve(__dirname, "../../..");
const PLAN_PATH = resolve(ROOT, "reports/deployment/balance-observer-wallet-plan.json");
const SUBMISSION_DIR = resolve(ROOT, "reports/deployment/balance-observer-wallet-submissions");
const ARTIFACT_PATH = resolve(ROOT, "contracts/out/AEOSBalanceObserver.sol/AEOSBalanceObserver.json");
const OUTPUT_PATH = resolve(ROOT, "reports/live-demo/live-balance-observer-finality-v1.json");
const RPC_URL = process.argv[2];

function readJson(path) { return JSON.parse(readFileSync(path, "utf8")); }
function requiredHttpsRpc(value) { if (!/^https:\/\//u.test(value || "")) throw new Error("PUBLIC_HTTPS_RPC_REQUIRED"); return value; }

async function main() {
  const plan = readJson(PLAN_PATH);
  const artifact = readJson(ARTIFACT_PATH);
  const deploymentSubmission = readJson(resolve(SUBMISSION_DIR, "01-submitted.json"));
  const observationSubmission = readJson(resolve(SUBMISSION_DIR, "02-submitted.json"));
  const deploymentRequest = plan.transactions[0];
  const observationRequest = plan.transactions[1];
  if (deploymentSubmission.planHash !== plan.planHash || observationSubmission.planHash !== plan.planHash || deploymentSubmission.requestHash !== deploymentRequest.requestHash || observationSubmission.requestHash !== observationRequest.requestHash) throw new Error("BALANCE_OBSERVER_SUBMISSION_LINEAGE_INVALID");

  const provider = new JsonRpcProvider(requiredHttpsRpc(RPC_URL), plan.chainId, { staticNetwork: true });
  const observer = new Contract(plan.observer.predictedAddress, artifact.abi, provider);
  const [network, latestBlock, deploymentTx, deploymentReceipt, observationTx, observationReceipt, runtimeCode, tokenCode, reporter, storedCommitment, storedBalance] = await Promise.all([
    provider.getNetwork(), provider.getBlockNumber(), provider.getTransaction(deploymentSubmission.transactionHash), provider.getTransactionReceipt(deploymentSubmission.transactionHash), provider.getTransaction(observationSubmission.transactionHash), provider.getTransactionReceipt(observationSubmission.transactionHash), provider.getCode(plan.observer.predictedAddress), provider.getCode(plan.token.address), observer.reporter(), observer.observationCommitment(observationRequest.observationId), observer.observedBalance(observationRequest.observationId),
  ]);
  if (!deploymentTx || !deploymentReceipt || !observationTx || !observationReceipt) throw new Error("BALANCE_OBSERVER_TRANSACTION_OR_RECEIPT_MISSING");
  const [deploymentBlock, observationBlock] = await Promise.all([provider.getBlock(deploymentReceipt.blockNumber, true), provider.getBlock(observationReceipt.blockNumber, true)]);
  if (!deploymentBlock?.hash || !observationBlock?.hash) throw new Error("BALANCE_OBSERVER_CANONICAL_BLOCK_MISSING");
  const immutableReferences = Object.values(artifact.deployedBytecode?.immutableReferences || {}).flat();
  const expectedRuntime = materializeBalanceObserverRuntimeBytecode({ runtimeBytecode: artifact.deployedBytecode.object, reporter: plan.reporter, reporterImmutableReferences: immutableReferences });
  const deployment = verifyBalanceObserverDeploymentReadback({ expectedChainId: plan.chainId, actualChainId: Number(network.chainId), expectedReporter: plan.reporter, actualReporter: reporter, expectedInitCodeHash: deploymentRequest.initCodeHash, expectedRuntimeBytecodeHash: require("ethers").keccak256(expectedRuntime), deploymentTransactionData: deploymentTx.data, deploymentTransactionTo: deploymentTx.to, deploymentTransactionValue: deploymentTx.value.toString(), deploymentTransactionHash: deploymentTx.hash, receiptStatus: deploymentReceipt.status, receiptTo: deploymentReceipt.to, receiptContractAddress: deploymentReceipt.contractAddress, receiptBlockNumber: deploymentReceipt.blockNumber, latestBlockNumber: latestBlock, minimumConfirmations: 2, address: plan.observer.predictedAddress, runtimeBytecode: runtimeCode });
  const request = buildBalanceObservationRequestFromCommitments({ chainId: plan.chainId, observerContract: plan.observer.predictedAddress, reporter: plan.reporter, observationKey: "sepolia-usdc-current-balance-v1", token: plan.token.address, account: plan.account, tokenRuntimeBytecode: tokenCode, organizationCommitment: plan.tenantBinding.organizationCommitment, treasuryCommitment: plan.tenantBinding.treasuryCommitment });
  if (request.requestHash !== observationRequest.observationRequestHash || request.unsignedTransaction.data.toLowerCase() !== observationRequest.data.toLowerCase()) throw new Error("BALANCE_OBSERVER_OBSERVATION_REQUEST_MISMATCH");
  const observation = verifyBalanceObservationReceipt({ request, expectedTransactionHash: observationSubmission.transactionHash, expectedNonce: observationRequest.nonce, minimumConfirmations: 2, transaction: { hash: observationTx.hash, from: observationTx.from, to: observationTx.to, data: observationTx.data, value: observationTx.value.toString(), nonce: observationTx.nonce }, receipt: { hash: observationReceipt.hash, status: observationReceipt.status, from: observationReceipt.from, to: observationReceipt.to, blockNumber: observationReceipt.blockNumber, blockHash: observationReceipt.blockHash, logs: observationReceipt.logs.map((log) => ({ address: log.address, topics: [...log.topics], data: log.data })) }, latestBlockNumber: latestBlock, canonicalBlockHash: observationBlock.hash, canonicalBlockTimestamp: observationBlock.timestamp, tokenRuntimeBytecode: tokenCode, storedCommitment: String(storedCommitment), storedBalance: storedBalance.toString() });
  const canonicalTransactions = (block) => block.transactions.map((item) => typeof item === "string" ? item.toLowerCase() : item.hash.toLowerCase());
  const extraChecks = { deploymentTransactionInCanonicalBlock: canonicalTransactions(deploymentBlock).includes(deploymentTx.hash.toLowerCase()), observationTransactionInCanonicalBlock: canonicalTransactions(observationBlock).includes(observationTx.hash.toLowerCase()) };
  const status = deployment.status === "VERIFIED" && observation.status === "VERIFIED" && Object.values(extraChecks).every(Boolean) ? "BALANCE_OBSERVATION_CANONICALLY_VERIFIED" : "REJECTED";
  const output = { schemaVersion: "aeos.live-balance-observer-finality.v1", status, verifiedAt: new Date().toISOString(), planHash: plan.planHash, deployment, observation, extraChecks, attestcoinProofReady: status === "BALANCE_OBSERVATION_CANONICALLY_VERIFIED", privateKeyReceived: false, signerCustody: false, broadcastCapability: false, assetExecutionAuthorized: false };
  if (existsSync(OUTPUT_PATH)) { const existing = readJson(OUTPUT_PATH); if (existing.planHash !== output.planHash || existing.observation?.transactionHash !== output.observation.transactionHash) throw new Error("BALANCE_OBSERVER_FINALITY_ARTIFACT_CONFLICT"); }
  else writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ status, deploymentTransactionHash: deployment.transactionHash, observerAddress: deployment.address, observationTransactionHash: observation.transactionHash, observationBlock: observation.blockNumber, observationTimestamp: observation.blockTimestamp, balanceBaseUnits: observation.balanceBaseUnits, token: observation.token, account: observation.account, confirmations: observation.confirmations, commitment: observation.commitment, outputPath: OUTPUT_PATH, attestcoinProofReady: output.attestcoinProofReady, assetExecutionAuthorized: false }, null, 2));
  if (status === "REJECTED") process.exitCode = 1;
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
