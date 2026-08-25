const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");
const { UscAttestcoinAdapter } = require("../dist/attestcoin-adapter");

const TX_HASH = /^0x[0-9a-f]{64}$/i;

function validateRequest(request) {
  if (request?.schemaVersion !== "aeos.live-economic-evidence.usdc-verification-request.v1" || request.status !== "VERIFICATION_PREPARED") {
    throw new Error("LIVE_USDC_VERIFICATION_REQUEST_INVALID");
  }
  if (request.verificationRequest?.chainId !== 102031 || request.verificationRequest?.to?.toLowerCase() !== "0x0000000000000000000000000000000000000fd2" || request.verificationRequest?.value !== "0x0") {
    throw new Error("LIVE_USDC_VERIFICATION_BOUNDARY_INVALID");
  }
  if (request.controls?.signed !== false || request.controls?.submitted !== false || request.controls?.signerCustody !== false || request.controls?.broadcastCapability !== false || request.controls?.assetExecutionAuthorized !== false) {
    throw new Error("LIVE_USDC_VERIFICATION_CONTROL_BOUNDARY_INVALID");
  }
}

function validateWalletSubmission(request, submission) {
  if (submission?.schemaVersion !== "aeos.live-economic-evidence.usdc-wallet-submission.v1" || submission.status !== "WALLET_SUBMITTED") {
    throw new Error("LIVE_USDC_WALLET_SUBMISSION_INVALID");
  }
  if (submission.verificationRequestHash !== request.verificationRequestHash || submission.sourceProofBundleHash !== request.sourceProof.bundleHash) {
    throw new Error("LIVE_USDC_WALLET_SUBMISSION_LINEAGE_MISMATCH");
  }
  if (submission.chainId !== request.verificationRequest.chainId || submission.from?.toLowerCase() !== request.verificationRequest.from || submission.to?.toLowerCase() !== request.verificationRequest.to || submission.value !== request.verificationRequest.value) {
    throw new Error("LIVE_USDC_WALLET_SUBMISSION_BOUNDARY_MISMATCH");
  }
  if (!TX_HASH.test(submission.transactionHash) || submission.walletConfirmed !== true || submission.receiptVerified !== false || submission.transactionVerifiedEventObserved !== false || submission.privateKeyReceived !== false || submission.signerCustody !== false || submission.broadcastCapability !== false || submission.assetExecutionAuthorized !== false) {
    throw new Error("LIVE_USDC_WALLET_SUBMISSION_CONTROL_BOUNDARY_INVALID");
  }
}

function assertReceipt(request, receipt) {
  const expected = request.expectedCall;
  if (receipt.status !== 1 || receipt.confirmations < 2 || receipt.canonicalBlockVerified !== true || receipt.calldataVerified !== true || receipt.zeroValueVerified !== true || receipt.transactionVerifiedEvent !== true) {
    throw new Error("LIVE_USDC_RECEIPT_NOT_FINALIZED");
  }
  if (receipt.transactionVerified.chainKey !== expected.chainKey || receipt.transactionVerified.height !== expected.headerNumber || receipt.transactionVerified.transactionIndex !== expected.transactionIndex) {
    throw new Error("LIVE_USDC_TRANSACTION_VERIFIED_EVENT_MISMATCH");
  }
}

function buildArtifact(request, primaryReceipt, equivalentReceipts = []) {
  validateRequest(request);
  assertReceipt(request, primaryReceipt);
  for (const receipt of equivalentReceipts) assertReceipt(request, receipt);
  const uniqueEquivalentReceipts = equivalentReceipts.filter((receipt, index, all) =>
    receipt.transactionHash !== primaryReceipt.transactionHash && all.findIndex((candidate) => candidate.transactionHash === receipt.transactionHash) === index,
  );
  return {
    schemaVersion: "aeos.live-economic-evidence.usdc-transaction-verified.v1",
    status: "TRANSACTION_VERIFIED",
    recordedAt: new Date().toISOString(),
    sourceProof: request.sourceProof,
    verificationRequestHash: request.verificationRequestHash,
    canonicalSubmission: primaryReceipt,
    equivalentDuplicateSubmissions: uniqueEquivalentReceipts,
    duplicateSubmissionCount: uniqueEquivalentReceipts.length,
    controls: {
      walletConfirmed: true,
      receiptVerified: true,
      canonicalBlockVerified: true,
      exactCalldataVerified: true,
      zeroValueVerified: true,
      transactionVerifiedEventObserved: true,
      immutableTenantEvidenceCreated: false,
      signerCustody: false,
      broadcastCapability: false,
      assetExecutionAuthorized: false,
    },
    truthBoundary: {
      verifiedClaim: "ATTESTCOIN_SOURCE_TRANSACTION_INCLUSION_AND_CALLDATA",
      duplicateVerificationChangesEconomicFact: false,
      currentBalanceVerifiedByAttestcoin: false,
      priceVerified: false,
      realFinancialValueClaimed: false,
      organizationEvidenceImportStatus: "PENDING_SERVER_RESOLVED_ORGANIZATION_CONTEXT",
    },
  };
}

async function main() {
  const transactionHash = (process.argv[2] || process.env.AEOS_LIVE_USDC_SUBMISSION_TRANSACTION_HASH || "").toLowerCase();
  if (!TX_HASH.test(transactionHash)) throw new Error("LIVE_USDC_SUBMISSION_TRANSACTION_HASH_REQUIRED");
  const requestPath = resolve(process.env.AEOS_LIVE_USDC_VERIFICATION_REQUEST_OUTPUT || resolve(__dirname, "../../../reports/live-demo/real-usdc-inflow-usc-verification-request-retry-1.json"));
  const walletSubmissionPath = resolve(process.env.AEOS_LIVE_USDC_WALLET_SUBMISSION_OUTPUT || resolve(__dirname, "../../../reports/live-demo/real-usdc-inflow-usc-wallet-submission-retry-1.json"));
  const outputPath = resolve(process.env.AEOS_LIVE_USDC_TRANSACTION_VERIFICATION_OUTPUT || resolve(__dirname, "../../../reports/live-demo/real-usdc-inflow-usc-transaction-verified-retry-1.json"));
  const request = JSON.parse(readFileSync(requestPath, "utf8"));
  validateRequest(request);
  const adapter = new UscAttestcoinAdapter("https://sepolia.invalid", process.env.CREDITCOIN_RPC_URL);
  const primaryReceipt = await adapter.inspectVerificationTransaction(transactionHash, request.verificationRequest);
  const equivalentReceipts = [];
  if (existsSync(walletSubmissionPath)) {
    const walletSubmission = JSON.parse(readFileSync(walletSubmissionPath, "utf8"));
    validateWalletSubmission(request, walletSubmission);
    const walletHash = walletSubmission.transactionHash.toLowerCase();
    if (walletHash !== transactionHash) equivalentReceipts.push(await adapter.inspectVerificationTransaction(walletHash, request.verificationRequest));
  }
  const artifact = buildArtifact(request, primaryReceipt, equivalentReceipts);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(JSON.stringify({
    status: artifact.status,
    outputPath,
    transactionHash: primaryReceipt.transactionHash,
    blockNumber: primaryReceipt.blockNumber,
    confirmations: primaryReceipt.confirmations,
    transactionVerified: primaryReceipt.transactionVerified,
    duplicateSubmissionCount: artifact.duplicateSubmissionCount,
    equivalentDuplicateTransactionHashes: artifact.equivalentDuplicateSubmissions.map((receipt) => receipt.transactionHash),
    immutableTenantEvidenceCreated: false,
    signerCustody: false,
    broadcastCapability: false,
    assetExecutionAuthorized: false,
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "LIVE_USDC_SUBMISSION_VERIFICATION_FAILED");
    process.exit(1);
  });
}

module.exports = { assertReceipt, buildArtifact, validateRequest, validateWalletSubmission };
