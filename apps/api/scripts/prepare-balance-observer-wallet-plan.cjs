const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");
const { createHash } = require("node:crypto");
const { JsonRpcProvider, formatEther, getCreateAddress, keccak256 } = require("ethers");
const { buildBalanceObservationRequestFromCommitments, buildBalanceObserverDeploymentPlan, BALANCE_OBSERVER_CHAIN_ID } = require("../dist/balance-observer-engine");

const REPORTER = "0x444d510728fb8072351cb5d0e88432e6a8501dfa";
const USDC = "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238";
const ACCOUNT = REPORTER;
const ORGANIZATION_COMMITMENT = "0x54749dcf1164b0cf5c9efb6cf96e6163004cfb24bddd3b7a5104bdae0266817e";
const TREASURY_COMMITMENT = "0x72e65dd802308cdd9bbb43789fdf89c46e105ed8dc58d6ea965b9f69444f29c1";
const RPC_URL = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const OUTPUT_PATH = resolve(process.env.AEOS_BALANCE_OBSERVER_WALLET_PLAN_PATH || resolve(__dirname, "../../../reports/deployment/balance-observer-wallet-plan.json"));
const ARTIFACT_PATH = resolve(process.env.AEOS_BALANCE_OBSERVER_ARTIFACT_PATH || resolve(__dirname, "../../../contracts/out/AEOSBalanceObserver.sol/AEOSBalanceObserver.json"));
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}` : JSON.stringify(value);
const sha256 = (value) => `0x${createHash("sha256").update(canonical(value)).digest("hex")}`;

function transaction(sequence, nonce, operation, to, data, extra = {}) {
  const identity = { sequence, nonce, to, value: "0x0", data };
  return { ...identity, operation, dataHash: keccak256(data), requestHash: sha256(identity), requiresUserWalletConfirmation: true, signed: false, submitted: false, ...extra };
}

async function main() {
  const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));
  const provider = new JsonRpcProvider(RPC_URL, BALANCE_OBSERVER_CHAIN_ID, { staticNetwork: true });
  const [network, pendingNonce, balance, latestBlock, tokenCode] = await Promise.all([provider.getNetwork(), provider.getTransactionCount(REPORTER, "pending"), provider.getBalance(REPORTER), provider.getBlockNumber(), provider.getCode(USDC, "latest")]);
  if (Number(network.chainId) !== BALANCE_OBSERVER_CHAIN_ID || tokenCode === "0x") throw new Error("BALANCE_OBSERVER_LIVE_PREREQUISITE_INVALID");
  const deployment = buildBalanceObserverDeploymentPlan({ chainId: Number(network.chainId), reporter: REPORTER, creationBytecode: artifact.bytecode?.object, runtimeBytecode: artifact.deployedBytecode?.object, artifactCompiler: artifact.metadata?.compiler?.version || "unknown", artifactSource: "contracts/src/AEOSBalanceObserver.sol" });
  const predictedAddress = getCreateAddress({ from: REPORTER, nonce: pendingNonce }).toLowerCase();
  const observation = buildBalanceObservationRequestFromCommitments({ chainId: Number(network.chainId), observerContract: predictedAddress, reporter: REPORTER, observationKey: "sepolia-usdc-current-balance-v1", token: USDC, account: ACCOUNT, tokenRuntimeBytecode: tokenCode, organizationCommitment: ORGANIZATION_COMMITMENT, treasuryCommitment: TREASURY_COMMITMENT });
  const deploymentTx = transaction(1, pendingNonce, "DEPLOY_AEOS_BALANCE_OBSERVER", null, deployment.unsignedTransaction.data, { predictedAddress, initCodeHash: deployment.unsignedTransaction.initCodeHash, expectedRuntimeBytecodeHash: deployment.artifact.runtimeBytecodeTemplateHash });
  const observationTx = transaction(2, pendingNonce + 1, "OBSERVE_SEPOLIA_USDC_BALANCE", predictedAddress, observation.unsignedTransaction.data, { observationId: observation.observation.observationId, token: USDC, account: ACCOUNT, tokenCodeHash: observation.observation.tokenCodeHash, organizationCommitment: ORGANIZATION_COMMITMENT, treasuryCommitment: TREASURY_COMMITMENT, observationRequestHash: observation.requestHash });
  const frozen = { schemaVersion: "aeos-balance-observer.wallet-plan.v1", chainId: BALANCE_OBSERVER_CHAIN_ID, network: "Ethereum Sepolia", currencySymbol: "ETH", explorerUrl: "https://sepolia.etherscan.io", reporter: REPORTER, observedBlockNumber: latestBlock, observedPendingNonce: pendingNonce, observedBalanceWei: balance.toString(), observedBalanceNative: formatEther(balance), observer: { predictedAddress, runtimeBytecodeHash: deployment.artifact.runtimeBytecodeTemplateHash, deploymentPlanHash: deployment.planHash }, token: { address: USDC, symbol: "USDC", decimals: 6, runtimeCodeHash: keccak256(tokenCode) }, account: ACCOUNT, tenantBinding: { rawTenantIdentifiersDisclosed: false, organizationCommitment: ORGANIZATION_COMMITMENT, treasuryCommitment: TREASURY_COMMITMENT }, transactions: [deploymentTx, observationTx], authority: { requiresTwoSeparateUserConfirmations: true, automaticContinuation: false, privateKeyReceived: false, signerCustody: false, aeosSigningCapability: false, aeosBroadcastCapability: false, assetExecutionAuthorized: false } };
  const plan = { ...frozen, generatedAt: new Date().toISOString(), planHash: sha256(frozen) };
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  if (existsSync(OUTPUT_PATH)) {
    const existing = JSON.parse(readFileSync(OUTPUT_PATH, "utf8"));
    if (existing.planHash !== plan.planHash) throw new Error("BALANCE_OBSERVER_WALLET_PLAN_ALREADY_EXISTS_WITH_DIFFERENT_NONCE_OR_STATE");
  } else writeFileSync(OUTPUT_PATH, `${JSON.stringify(plan, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ status: "BALANCE_OBSERVER_WALLET_PLAN_PREPARED", outputPath: OUTPUT_PATH, planHash: plan.planHash, pendingNonce, predictedAddress, tokenCodeHash: plan.token.runtimeCodeHash, transactionCount: 2, signed: false, submitted: false, assetExecutionAuthorized: false }, null, 2));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
