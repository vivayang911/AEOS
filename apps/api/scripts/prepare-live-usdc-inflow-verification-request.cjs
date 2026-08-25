const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");
const { Interface, getAddress } = require("ethers");
const { BLOCK_PROVER_ADDRESS, CREDITCOIN_TESTNET_CHAIN_ID, buildUscVerificationRequest } = require("../dist/attestcoin-adapter");
const { hash, validateStoredArtifact } = require("./live-usdc-inflow-proof.cjs");

const VERIFY_AND_EMIT = new Interface([
  "function verifyAndEmit(uint64 chainKey,uint64 height,bytes encodedTransaction,(bytes32 root,(bytes32 hash,bool isLeft)[] siblings) merkleProof,(bytes32 lowerEndpointDigest,bytes32[] roots) continuityProof) returns (bool)",
]);

function buildVerificationArtifact(proofArtifact, requesterWallet) {
  const verified = validateStoredArtifact(proofArtifact);
  const request = buildUscVerificationRequest(proofArtifact.proof, getAddress(requesterWallet));
  const parsed = VERIFY_AND_EMIT.parseTransaction({ data: request.data, value: 0n });
  if (!parsed || parsed.name !== "verifyAndEmit") throw new Error("LIVE_USDC_VERIFY_AND_EMIT_CALLDATA_INVALID");
  if (Number(parsed.args[0]) !== proofArtifact.proof.chainKey || Number(parsed.args[1]) !== proofArtifact.proof.headerNumber) throw new Error("LIVE_USDC_VERIFY_AND_EMIT_PROOF_MISMATCH");
  if (request.chainId !== CREDITCOIN_TESTNET_CHAIN_ID || request.to !== BLOCK_PROVER_ADDRESS.toLowerCase() || request.value !== "0x0") throw new Error("LIVE_USDC_VERIFY_AND_EMIT_TARGET_INVALID");
  const verificationRequestHash = hash(request);
  return {
    schemaVersion: "aeos.live-economic-evidence.usdc-verification-request.v1",
    status: "VERIFICATION_PREPARED",
    sourceProof: {
      artifactSchemaVersion: proofArtifact.schemaVersion,
      transactionHash: verified.transactionHash,
      sourceBlockNumber: verified.sourceBlockNumber,
      proofPayloadHash: proofArtifact.verification.frozen.proofPayloadHash,
      economicEventHash: proofArtifact.verification.frozen.economicEventHash,
      bundleHash: verified.bundleHash,
    },
    verificationRequest: request,
    verificationRequestHash,
    expectedCall: {
      method: "verifyAndEmit",
      chainKey: Number(parsed.args[0]),
      headerNumber: Number(parsed.args[1]),
      transactionIndex: proofArtifact.proof.txIndex,
      expectedEvent: "TransactionVerified(uint64,uint64,uint64)",
    },
    controls: {
      zeroValue: true,
      requiresUserWalletConfirmation: true,
      signed: false,
      submitted: false,
      signerCustody: false,
      broadcastCapability: false,
      assetExecutionAuthorized: false,
    },
    truthBoundary: {
      requestedVerification: "ATTESTCOIN_TRANSACTION_INCLUSION_AND_CALLDATA",
      transactionVerifiedEventObserved: false,
      immutableTenantEvidenceCreated: false,
      childSnapshotCreated: false,
      childDecisionCreated: false,
      currentBalanceVerifiedByAttestcoin: false,
      priceVerified: false,
      realFinancialValueClaimed: false,
    },
  };
}

function validateVerificationArtifact(proofArtifact, requestArtifact) {
  const rebuilt = buildVerificationArtifact(proofArtifact, requestArtifact?.verificationRequest?.from);
  if (requestArtifact?.schemaVersion !== rebuilt.schemaVersion || requestArtifact.status !== rebuilt.status) throw new Error("LIVE_USDC_VERIFICATION_ARTIFACT_INVALID");
  if (hash(requestArtifact.verificationRequest) !== requestArtifact.verificationRequestHash || requestArtifact.verificationRequestHash !== rebuilt.verificationRequestHash) throw new Error("LIVE_USDC_VERIFICATION_REQUEST_HASH_MISMATCH");
  if (JSON.stringify(requestArtifact.verificationRequest) !== JSON.stringify(rebuilt.verificationRequest)) throw new Error("LIVE_USDC_VERIFICATION_REQUEST_MISMATCH");
  if (JSON.stringify(requestArtifact.sourceProof) !== JSON.stringify(rebuilt.sourceProof) || JSON.stringify(requestArtifact.expectedCall) !== JSON.stringify(rebuilt.expectedCall)) throw new Error("LIVE_USDC_VERIFICATION_LINEAGE_MISMATCH");
  if (JSON.stringify(requestArtifact.controls) !== JSON.stringify(rebuilt.controls)) throw new Error("LIVE_USDC_VERIFICATION_AUTHORITY_BOUNDARY_INVALID");
  if (JSON.stringify(requestArtifact.truthBoundary) !== JSON.stringify(rebuilt.truthBoundary)) throw new Error("LIVE_USDC_VERIFICATION_TRUTH_BOUNDARY_INVALID");
  return { verificationRequestHash: rebuilt.verificationRequestHash, ...rebuilt.verificationRequest, ...rebuilt.controls };
}

function main() {
  const inputPath = resolve(process.argv[2] || process.env.AEOS_LIVE_USDC_PROOF_OUTPUT || resolve(__dirname, "../../../reports/live-demo/real-usdc-inflow-usc-proof-v1.json"));
  const outputPath = resolve(process.argv[3] || process.env.AEOS_LIVE_USDC_VERIFICATION_REQUEST_OUTPUT || resolve(__dirname, "../../../reports/live-demo/real-usdc-inflow-usc-verification-request-v1.json"));
  const requesterWallet = process.env.AEOS_LIVE_REQUESTER_WALLET || "0x444D510728FB8072351cB5d0E88432e6a8501DFA";
  const artifact = buildVerificationArtifact(JSON.parse(readFileSync(inputPath, "utf8")), requesterWallet);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(JSON.stringify({ status: artifact.status, outputPath, sourceTransactionHash: artifact.sourceProof.transactionHash, sourceProofBundleHash: artifact.sourceProof.bundleHash, verificationRequestHash: artifact.verificationRequestHash, ...artifact.verificationRequest, ...artifact.controls }, null, 2));
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error instanceof Error ? error.message : "LIVE_USDC_VERIFICATION_PREPARATION_FAILED"); process.exit(1); }
}

module.exports = { buildVerificationArtifact, validateVerificationArtifact };
