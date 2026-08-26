const { randomUUID } = require("node:crypto");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");
const { Pool } = require("pg");
const { UscAttestcoinAdapter } = require("../dist/attestcoin-adapter");
const { persistEvidenceClassification } = require("../dist/evidence-classification");
const { hashValue } = require("../dist/decision-engine");
const { resolveActiveSession, applyTenantContext } = require("./reconcile-live-attestcoin-evidence.cjs");

require("dotenv").config({ path: resolve(__dirname, "../../../.env"), quiet: true });
const id = (prefix) => `${prefix}_${randomUUID().replaceAll("-", "")}`;
const load = (file) => JSON.parse(readFileSync(resolve(file), "utf8"));
const FRESHNESS_SECONDS = 300;

function validateFinality(proof, request, finality) {
  if (proof?.schemaVersion !== "aeos.live-economic-evidence.balance-observer-proof.v1" || proof.status !== "USC_PROOF_STATICALLY_VERIFIED") throw new Error("BALANCE_EVIDENCE_PROOF_INVALID");
  if (proof.verification?.blockProverStaticVerificationPassed !== true || proof.verification?.canonicalObserverFinalityMatched !== true || proof.controls?.assetExecutionAuthorized !== false) throw new Error("BALANCE_EVIDENCE_PROOF_BOUNDARY_INVALID");
  if (request?.schemaVersion !== "aeos.live-economic-evidence.balance-observer-verification-request.v1" || request.status !== "VERIFICATION_PREPARED" || request.controls?.assetExecutionAuthorized !== false) throw new Error("BALANCE_EVIDENCE_REQUEST_INVALID");
  if (finality?.schemaVersion !== "aeos.live-economic-evidence.balance-observer-transaction-verified.v1" || finality.status !== "TRANSACTION_VERIFIED" || finality.controls?.assetExecutionAuthorized !== false) throw new Error("BALANCE_EVIDENCE_FINALITY_INVALID");
  if (request.sourceProof?.bundleHash !== proof.verification.frozen.bundleHash || finality.sourceProof?.bundleHash !== proof.verification.frozen.bundleHash || finality.verificationRequestHash !== request.verificationRequestHash) throw new Error("BALANCE_EVIDENCE_LINEAGE_MISMATCH");
  if (proof.balanceObservation?.predicate !== "asset.balance" || proof.balanceObservation.observedBlockNumber !== proof.source.blockNumber || proof.balanceObservation.account !== request.verificationRequest.from) throw new Error("BALANCE_EVIDENCE_OBSERVATION_MISMATCH");
  const receipts = [finality.canonicalSubmission, ...(finality.equivalentDuplicateSubmissions ?? [])];
  if (finality.duplicateSubmissionCount !== receipts.length - 1 || finality.truthBoundary?.duplicateVerificationChangesEconomicFact !== false) throw new Error("BALANCE_EVIDENCE_DUPLICATE_BOUNDARY_INVALID");
  for (const receipt of receipts) {
    if (receipt?.chainId !== 102031 || receipt.from !== request.verificationRequest.from || receipt.to !== request.verificationRequest.to || receipt.status !== 1 || receipt.confirmations < 2 || receipt.canonicalBlockVerified !== true || receipt.calldataVerified !== true || receipt.zeroValueVerified !== true || receipt.transactionVerifiedEvent !== true) throw new Error("BALANCE_EVIDENCE_RECEIPT_INVALID");
    if (receipt.transactionVerified?.chainKey !== request.expectedCall.chainKey || receipt.transactionVerified?.height !== request.expectedCall.headerNumber || receipt.transactionVerified?.transactionIndex !== request.expectedCall.transactionIndex) throw new Error("BALANCE_EVIDENCE_EVENT_MISMATCH");
  }
  return { canonical: finality.canonicalSubmission, duplicates: finality.equivalentDuplicateSubmissions ?? [] };
}

function buildEvidenceFact(proof, request, finality, now = new Date()) {
  validateFinality(proof, request, finality);
  const observation = proof.balanceObservation;
  const observedAt = proof.source.observedAt;
  const freshnessExpiresAt = new Date(new Date(observedAt).getTime() + FRESHNESS_SECONDS * 1000);
  const freshnessStatus = freshnessExpiresAt.getTime() > now.getTime() ? "FRESH" : "STALE";
  const qualityComponents = { proofStrength: 35, sourceReliability: 20, freshness: freshnessStatus === "FRESH" ? 20 : 0, completeness: 15, consistency: 10 };
  const fact = {
    subject: { type: "wallet", id: `eip155:11155111:${observation.account}` },
    predicate: "asset.balance",
    value: { amount: observation.balanceBaseUnits, amountBaseUnits: observation.balanceBaseUnits, decimals: observation.decimals, symbol: observation.symbol, tokenContract: observation.token, observerContract: observation.observer, observationId: observation.observationId, observationCommitment: observation.commitment, currentAtObservationBlockOnly: true, continuouslyCurrent: false, priceVerified: false, liquidityVerified: false, testnetAssetOnly: true },
    chain: { id: 11155111, blockNumber: proof.source.blockNumber, blockHash: proof.source.blockHash, transactionIndex: proof.proof.txIndex },
    source: { provider: proof.provider, sourceTransactionHash: proof.source.transactionHash, proofBundleHash: proof.verification.frozen.bundleHash, verificationRequestHash: request.verificationRequestHash, verificationTransactionHash: finality.canonicalSubmission.transactionHash, equivalentDuplicateVerificationTransactionHashes: (finality.equivalentDuplicateSubmissions ?? []).map((item) => item.transactionHash), verificationScope: "ATTESTCOIN_BALANCE_OBSERVATION_TRANSACTION_INCLUSION_AND_CALLDATA", observerReceiptAndStorageCorroborated: true },
    verificationStatus: "VERIFIED",
    observedAt,
  };
  return { fact, contentHash: hashValue(fact), freshnessStatus, freshnessExpiresAt: freshnessExpiresAt.toISOString(), qualityComponents, qualityScore: Object.values(qualityComponents).reduce((sum, value) => sum + value, 0) };
}

async function persist(client, session, proof, request, finality, observedReceipt) {
  const org = session.organization_id;
  const built = buildEvidenceFact(proof, request, finality);
  if (session.wallet_address.toLowerCase() !== proof.balanceObservation.account || session.wallet_address.toLowerCase() !== request.verificationRequest.from) throw new Error("BALANCE_EVIDENCE_SESSION_WALLET_MISMATCH");
  const existingJob = await client.query("SELECT * FROM attestcoin_proof_jobs WHERE organization_id=$1 AND source_chain_id=11155111 AND source_tx_hash=$2", [org, proof.source.transactionHash]);
  if (existingJob.rowCount) {
    const row = existingJob.rows[0];
    if (row.status !== "VERIFIED" || !row.evidence_id || row.proof_snapshot_hash !== proof.verification.frozen.proofPayloadHash || row.verification_request_hash !== request.verificationRequestHash || row.verification_tx_hash !== observedReceipt.transactionHash) throw new Error("BALANCE_EVIDENCE_EXISTING_JOB_MISMATCH");
    return { jobId: row.id, evidenceId: row.evidence_id, created: false, ...built };
  }
  const jobId = id("uscjob");
  await client.query("INSERT INTO attestcoin_proof_jobs(id,organization_id,adapter,source_chain_id,source_chain_key,source_tx_hash,requester_wallet,status,source_snapshot,source_snapshot_hash,proof_snapshot,proof_snapshot_hash,verification_request,verification_request_hash,verification_receipt,verification_receipt_hash,verification_tx_hash) VALUES($1,$2,$3,11155111,1,$4,$5,'VERIFIED',$6,$7,$8,$9,$10,$11,$12,$13,$14)", [jobId, org, proof.provider, proof.source.transactionHash, request.verificationRequest.from, proof.source, proof.verification.frozen.sourceSnapshotHash, proof.proof, proof.verification.frozen.proofPayloadHash, request.verificationRequest, request.verificationRequestHash, observedReceipt, hashValue(observedReceipt), observedReceipt.transactionHash]);
  const rawPayload = { schemaVersion: "aeos.live-economic-evidence.balance-observer.raw.v1", source: proof.source, balanceObservation: proof.balanceObservation, proofBundleHash: proof.verification.frozen.bundleHash, verificationRequestHash: request.verificationRequestHash, canonicalVerificationReceipt: observedReceipt, equivalentDuplicateVerificationTransactionHashes: built.fact.source.equivalentDuplicateVerificationTransactionHashes, truthBoundary: { verifiedClaim: "ATTESTCOIN_BALANCE_OBSERVATION_TRANSACTION_INCLUSION_AND_CALLDATA", currentAtObservationBlockOnly: true, continuouslyCurrent: false, priceVerified: false, liquidityVerified: false, testnetAssetOnly: true, assetExecutionAuthorized: false } };
  const rawHash = hashValue(rawPayload);
  const raw = await client.query("INSERT INTO raw_attestations(id,organization_id,provider,chain_id,payload,content_hash) VALUES($1,$2,$3,11155111,$4,$5) ON CONFLICT(organization_id,content_hash) DO NOTHING RETURNING id", [id("raw"), org, proof.provider, rawPayload, rawHash]);
  const rawId = raw.rowCount ? raw.rows[0].id : (await client.query("SELECT id FROM raw_attestations WHERE organization_id=$1 AND content_hash=$2", [org, rawHash])).rows[0]?.id;
  if (!rawId) throw new Error("BALANCE_EVIDENCE_RAW_NOT_PERSISTED");
  const evidence = await client.query("INSERT INTO evidence(id,organization_id,raw_attestation_id,subject,predicate,value,chain,source,verification_status,freshness_status,freshness_expires_at,quality_score,quality_components,observed_at,content_hash) VALUES($1,$2,$3,$4,'asset.balance',$5,$6,$7,'VERIFIED',$8,$9,$10,$11,$12,$13) ON CONFLICT(organization_id,content_hash) DO NOTHING RETURNING id", [id("ev"), org, rawId, built.fact.subject, built.fact.value, built.fact.chain, built.fact.source, built.freshnessStatus, built.freshnessExpiresAt, built.qualityScore, built.qualityComponents, built.fact.observedAt, built.contentHash]);
  const evidenceId = evidence.rowCount ? evidence.rows[0].id : (await client.query("SELECT id FROM evidence WHERE organization_id=$1 AND content_hash=$2", [org, built.contentHash])).rows[0]?.id;
  if (!evidenceId) throw new Error("BALANCE_EVIDENCE_NOT_PERSISTED");
  const classification = await persistEvidenceClassification(client, org, { id: evidenceId, contentHash: built.contentHash, subject: built.fact.subject, predicate: built.fact.predicate, value: built.fact.value, source: built.fact.source, verificationStatus: "VERIFIED" });
  await client.query("UPDATE attestcoin_proof_jobs SET evidence_id=$3 WHERE organization_id=$1 AND id=$2", [org, jobId, evidenceId]);
  const auditData = { evidenceId, proofJobId: jobId, sourceTransactionHash: proof.source.transactionHash, verificationTransactionHash: observedReceipt.transactionHash, duplicateVerificationTransactionHashes: built.fact.source.equivalentDuplicateVerificationTransactionHashes, classificationHash: classification.classificationHash, predicate: "asset.balance", freshnessStatus: built.freshnessStatus, currentAtObservationBlockOnly: true, signerCustody: false, broadcastCapability: false, assetExecutionAuthorized: false };
  const auditPayload = { eventType: "evidence.live_balance_imported", organizationId: org, objectType: "evidence", objectId: evidenceId, data: auditData };
  await client.query("INSERT INTO audit_events(id,organization_id,event_type,actor,action,object_type,object_id,data,payload_hash) VALUES($1,$2,$3,$4,$3,'evidence',$5,$6,$7)", [id("audit"), org, auditPayload.eventType, { type: "human", id: session.user_id, walletAddress: session.wallet_address }, evidenceId, auditData, hashValue(auditPayload)]);
  return { jobId, evidenceId, created: true, classification, ...built };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
  const proof = load(process.env.AEOS_LIVE_BALANCE_OBSERVER_PROOF_OUTPUT || resolve(__dirname, "../../../reports/live-demo/live-balance-observer-usc-proof-retry-1.json"));
  const request = load(process.env.AEOS_LIVE_BALANCE_OBSERVER_VERIFICATION_REQUEST_OUTPUT || resolve(__dirname, "../../../reports/live-demo/live-balance-observer-usc-verification-request-retry-1.json"));
  const finality = load(process.env.AEOS_LIVE_BALANCE_OBSERVER_TRANSACTION_VERIFICATION_OUTPUT || resolve(__dirname, "../../../reports/live-demo/live-balance-observer-usc-transaction-verified-retry-1.json"));
  validateFinality(proof, request, finality);
  const outputPath = resolve(process.env.AEOS_LIVE_BALANCE_OBSERVER_EVIDENCE_IMPORT_OUTPUT || resolve(__dirname, "../../../reports/live-demo/live-balance-observer-evidence-import-v1.json"));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL }); const client = await pool.connect();
  try {
    const session = await resolveActiveSession(client, request.verificationRequest.from);
    const adapter = new UscAttestcoinAdapter("https://sepolia.invalid", process.env.CREDITCOIN_RPC_URL);
    const observedReceipt = await adapter.inspectVerificationTransaction(finality.canonicalSubmission.transactionHash, request.verificationRequest);
    await client.query("BEGIN");
    try {
      await applyTenantContext(client, session);
      const imported = await persist(client, session, proof, request, finality, observedReceipt);
      await client.query("COMMIT");
      const artifact = { schemaVersion: "aeos.live-economic-evidence.balance-observer-evidence-import.v1", status: "IMMUTABLE_EVIDENCE_IMPORTED", recordedAt: new Date().toISOString(), tenantBinding: "SERVER_RESOLVED_ACTIVE_SIWE_SESSION", rawTenantIdentifiersDisclosed: false, proofJobId: imported.jobId, evidenceId: imported.evidenceId, evidenceContentHash: imported.contentHash, predicate: "asset.balance", freshnessPolicySeconds: FRESHNESS_SECONDS, freshnessStatus: imported.freshnessStatus, freshnessExpiresAt: imported.freshnessExpiresAt, qualityScore: imported.qualityScore, sourceTransactionHash: proof.source.transactionHash, canonicalVerificationTransactionHash: observedReceipt.transactionHash, equivalentDuplicateVerificationTransactionHashes: finality.equivalentDuplicateSubmissions.map((item) => item.transactionHash), idempotentReplay: !imported.created, controls: { immutableEvidenceCreated: true, organizationRlsRequired: true, signerCustody: false, broadcastCapability: false, assetExecutionAuthorized: false }, truthBoundary: { verifiedClaim: "ATTESTCOIN_BALANCE_OBSERVATION_TRANSACTION_INCLUSION_AND_CALLDATA", corroboratedClaim: "OBSERVER_EXECUTED_ERC20_BALANCEOF_AND_FROZE_RETURN_AT_SOURCE_BLOCK", currentAtObservationBlockOnly: true, continuouslyCurrent: false, priceVerified: false, liquidityVerified: false, realFinancialValueClaimed: false, childDecisionCreated: false } };
      if (existsSync(outputPath)) { const existing = load(outputPath); if (existing.evidenceId !== artifact.evidenceId || existing.evidenceContentHash !== artifact.evidenceContentHash || existing.canonicalVerificationTransactionHash !== artifact.canonicalVerificationTransactionHash || existing.controls?.assetExecutionAuthorized !== false) throw new Error("BALANCE_EVIDENCE_IMPORT_ARTIFACT_MISMATCH"); }
      else { mkdirSync(dirname(outputPath), { recursive: true }); writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", flag: "wx" }); }
      console.log(JSON.stringify({ status: artifact.status, outputPath, evidenceId: artifact.evidenceId, predicate: artifact.predicate, freshnessStatus: artifact.freshnessStatus, qualityScore: artifact.qualityScore, idempotentReplay: !imported.created, childDecisionCreated: false, signerCustody: false, broadcastCapability: false, assetExecutionAuthorized: false }, null, 2));
    } catch (error) { await client.query("ROLLBACK"); throw error; }
  } finally { client.release(); await pool.end(); }
}

if (require.main === module) main().catch((error) => { console.error(error instanceof Error ? error.message : "BALANCE_EVIDENCE_RECONCILIATION_FAILED"); process.exit(1); });
module.exports = { buildEvidenceFact, main, persist, validateFinality };
