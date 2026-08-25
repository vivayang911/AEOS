const { mkdirSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");
const { JsonRpcProvider } = require("ethers");
const { UscAttestcoinAdapter } = require("../dist/attestcoin-adapter");
const { buildArtifact } = require("./live-usdc-inflow-proof.cjs");

const SOURCE_TRANSACTION_HASH = "0x0488e4990ac7c43f7a5f7d8734a10be0af5fd36c8cd3843788501fccbcc9eea9";
const MONITORED_ADDRESS = "0x444D510728FB8072351cB5d0E88432e6a8501DFA";
const EXPECTED_AMOUNT_BASE_UNITS = "20000000";

async function main() {
  const transactionHash = (process.env.AEOS_USDC_INFLOW_TRANSACTION_HASH || SOURCE_TRANSACTION_HASH).toLowerCase();
  const sourceRpc = process.env.SEPOLIA_RPC_URL || process.env.AEOS_EVIDENCE_SOURCE_DEPLOY_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
  const monitoredAddress = process.env.AEOS_USDC_MONITORED_ADDRESS || MONITORED_ADDRESS;
  const expectedAmountBaseUnits = process.env.AEOS_USDC_EXPECTED_AMOUNT_BASE_UNITS || EXPECTED_AMOUNT_BASE_UNITS;
  const adapter = new UscAttestcoinAdapter(sourceRpc, process.env.CREDITCOIN_RPC_URL, process.env.ATTESTCOIN_PROOF_BUILDER_URL);
  const sourceProvider = new JsonRpcProvider(sourceRpc, 11155111, { staticNetwork: true });
  const sourceChainStatus = await adapter.sourceChainStatus();
  const source = await adapter.inspectSourceTransaction(transactionHash);
  const [proof, receipt, latestSourceBlock] = await Promise.all([
    adapter.fetchAndVerifyProof(source),
    sourceProvider.getTransactionReceipt(transactionHash),
    sourceProvider.getBlockNumber(),
  ]);
  if (!receipt) throw new Error("SOURCE_RECEIPT_NOT_FOUND");
  const artifact = buildArtifact({ sourceChainStatus, source, proof, receipt, latestSourceBlock, monitoredAddress, expectedAmountBaseUnits, observedAt: new Date().toISOString() });
  const outputPath = resolve(process.argv[2] || process.env.AEOS_LIVE_USDC_PROOF_OUTPUT || resolve(__dirname, "../../../reports/live-demo/real-usdc-inflow-usc-proof-v1.json"));
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(JSON.stringify({
    status: artifact.status,
    outputPath,
    transactionHash: artifact.source.transactionHash,
    sourceBlockNumber: artifact.source.blockNumber,
    latestAttestedHeight: artifact.sourceChainStatus.selected.latestAttestedHeight,
    amount: `${artifact.economicEvent.amountFormatted} ${artifact.economicEvent.token.symbol}`,
    monitoredAddress: artifact.economicEvent.monitoredAddress,
    bundleHash: artifact.verification.frozen.bundleHash,
    staticNativeVerificationPassed: artifact.verification.blockProverStaticVerificationPassed,
    signerCustody: false,
    broadcastCapability: false,
    assetExecutionAuthorized: false,
  }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "LIVE_USDC_PROOF_FAILED"); process.exit(1); });
