const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");
const { UscAttestcoinAdapter } = require("../dist/attestcoin-adapter");

const TX_HASH = /^0x[0-9a-f]{64}$/i;

function validateRequest(request) {
  if (request?.schemaVersion !== "aeos.live-economic-evidence.balance-observer-verification-request.v1" || request.status !== "VERIFICATION_PREPARED") throw new Error("BALANCE_OBSERVER_VERIFICATION_REQUEST_INVALID");
  if (request.verificationRequest?.chainId !== 102031 || request.verificationRequest?.to?.toLowerCase() !== "0x0000000000000000000000000000000000000fd2" || request.verificationRequest?.value !== "0x0") throw new Error("BALANCE_OBSERVER_VERIFICATION_BOUNDARY_INVALID");
  if (request.controls?.signed !== false || request.controls?.submitted !== false || request.controls?.signerCustody !== false || request.controls?.broadcastCapability !== false || request.controls?.assetExecutionAuthorized !== false) throw new Error("BALANCE_OBSERVER_VERIFICATION_CONTROL_BOUNDARY_INVALID");
}

function validateWalletSubmission(request, submission) {
  if (submission?.schemaVersion !== "aeos.live-economic-evidence.balance-observer-wallet-submission.v1" || submission.status !== "WALLET_SUBMITTED") throw new Error("BALANCE_OBSERVER_WALLET_SUBMISSION_INVALID");
  if (submission.verificationRequestHash !== request.verificationRequestHash || submission.sourceProofBundleHash !== request.sourceProof.bundleHash) throw new Error("BALANCE_OBSERVER_WALLET_SUBMISSION_LINEAGE_MISMATCH");
  if (submission.chainId !== request.verificationRequest.chainId || submission.from?.toLowerCase() !== request.verificationRequest.from || submission.to?.toLowerCase() !== request.verificationRequest.to || submission.value !== request.verificationRequest.value) throw new Error("BALANCE_OBSERVER_WALLET_SUBMISSION_BOUNDARY_MISMATCH");
  if (!TX_HASH.test(submission.transactionHash) || submission.walletConfirmed !== true || submission.receiptVerified !== false || submission.transactionVerifiedEventObserved !== false || submission.privateKeyReceived !== false || submission.signerCustody !== false || submission.broadcastCapability !== false || submission.assetExecutionAuthorized !== false) throw new Error("BALANCE_OBSERVER_WALLET_SUBMISSION_CONTROL_BOUNDARY_INVALID");
}

function assertReceipt(request, receipt) {
  const expected = request.expectedCall;
  if (receipt.status !== 1 || receipt.confirmations < 2 || receipt.canonicalBlockVerified !== true || receipt.calldataVerified !== true || receipt.zeroValueVerified !== true || receipt.transactionVerifiedEvent !== true) throw new Error("BALANCE_OBSERVER_RECEIPT_NOT_FINALIZED");
  if (receipt.transactionVerified?.chainKey !== expected.chainKey || receipt.transactionVerified?.height !== expected.headerNumber || receipt.transactionVerified?.transactionIndex !== expected.transactionIndex) throw new Error("BALANCE_OBSERVER_TRANSACTION_VERIFIED_EVENT_MISMATCH");
}

function buildArtifact(request, receipts) {
  validateRequest(request);
  if (!Array.isArray(receipts) || receipts.length === 0) throw new Error("BALANCE_OBSERVER_RECEIPTS_REQUIRED");
  for (const receipt of receipts) assertReceipt(request, receipt);
  const unique = receipts.filter((receipt, index, all) => all.findIndex((candidate) => candidate.transactionHash === receipt.transactionHash) === index);
  unique.sort((left, right) => left.blockNumber - right.blockNumber || left.transactionHash.localeCompare(right.transactionHash));
  const [canonicalSubmission, ...equivalentDuplicateSubmissions] = unique;
  return {
    schemaVersion: "aeos.live-economic-evidence.balance-observer-transaction-verified.v1",
    status: "TRANSACTION_VERIFIED",
    recordedAt: new Date().toISOString(),
    sourceProof: request.sourceProof,
    verificationRequestHash: request.verificationRequestHash,
    canonicalSelectionRule: "EARLIEST_CANONICAL_BLOCK_THEN_TRANSACTION_HASH",
    canonicalSubmission,
    equivalentDuplicateSubmissions,
    duplicateSubmissionCount: equivalentDuplicateSubmissions.length,
    controls: { walletConfirmed: true, receiptVerified: true, canonicalBlockVerified: true, exactCalldataVerified: true, zeroValueVerified: true, transactionVerifiedEventObserved: true, immutableTenantEvidenceCreated: false, signerCustody: false, broadcastCapability: false, assetExecutionAuthorized: false },
    truthBoundary: { verifiedClaim: "ATTESTCOIN_BALANCE_OBSERVATION_TRANSACTION_INCLUSION_AND_CALLDATA", duplicateVerificationChangesEconomicFact: false, observedBalanceContinuouslyCurrent: false, priceVerified: false, liquidityVerified: false, realFinancialValueClaimed: false, organizationEvidenceImportStatus: "PENDING_SERVER_RESOLVED_ORGANIZATION_CONTEXT" },
  };
}

async function main() {
  const suppliedHashes = process.argv.slice(2).map((value) => value.toLowerCase());
  if (!suppliedHashes.length || suppliedHashes.some((value) => !TX_HASH.test(value))) throw new Error("BALANCE_OBSERVER_SUBMISSION_TRANSACTION_HASHES_REQUIRED");
  const requestPath = resolve(process.env.AEOS_LIVE_BALANCE_OBSERVER_VERIFICATION_REQUEST_OUTPUT || resolve(__dirname, "../../../reports/live-demo/live-balance-observer-usc-verification-request-retry-1.json"));
  const walletSubmissionPath = resolve(process.env.AEOS_LIVE_BALANCE_OBSERVER_WALLET_SUBMISSION_OUTPUT || resolve(__dirname, "../../../reports/live-demo/live-balance-observer-usc-wallet-submission-retry-1.json"));
  const outputPath = resolve(process.env.AEOS_LIVE_BALANCE_OBSERVER_TRANSACTION_VERIFICATION_OUTPUT || resolve(__dirname, "../../../reports/live-demo/live-balance-observer-usc-transaction-verified-retry-1.json"));
  const request = JSON.parse(readFileSync(requestPath, "utf8"));
  validateRequest(request);
  const hashes = [...suppliedHashes];
  if (existsSync(walletSubmissionPath)) {
    const submission = JSON.parse(readFileSync(walletSubmissionPath, "utf8"));
    validateWalletSubmission(request, submission);
    hashes.push(submission.transactionHash.toLowerCase());
  }
  const uniqueHashes = [...new Set(hashes)];
  const adapter = new UscAttestcoinAdapter("https://sepolia.invalid", process.env.CREDITCOIN_RPC_URL);
  const receipts = [];
  for (const hash of uniqueHashes) receipts.push(await adapter.inspectVerificationTransaction(hash, request.verificationRequest));
  const artifact = buildArtifact(request, receipts);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(JSON.stringify({ status: artifact.status, outputPath, canonicalTransactionHash: artifact.canonicalSubmission.transactionHash, canonicalBlockNumber: artifact.canonicalSubmission.blockNumber, confirmations: artifact.canonicalSubmission.confirmations, transactionVerified: artifact.canonicalSubmission.transactionVerified, duplicateSubmissionCount: artifact.duplicateSubmissionCount, equivalentDuplicateTransactionHashes: artifact.equivalentDuplicateSubmissions.map((receipt) => receipt.transactionHash), immutableTenantEvidenceCreated: false, signerCustody: false, broadcastCapability: false, assetExecutionAuthorized: false }, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error instanceof Error ? error.message : "BALANCE_OBSERVER_SUBMISSION_VERIFICATION_FAILED"); process.exit(1); });
module.exports = { assertReceipt, buildArtifact, validateRequest, validateWalletSubmission };
