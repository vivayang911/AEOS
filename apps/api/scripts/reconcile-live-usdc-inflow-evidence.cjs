const { randomUUID } = require("node:crypto");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");
const { Pool } = require("pg");
const { UscAttestcoinAdapter } = require("../dist/attestcoin-adapter");
const { persistEvidenceClassification } = require("../dist/evidence-classification");
const { hashValue } = require("../dist/decision-engine");
const { validateStoredArtifact } = require("./live-usdc-inflow-proof.cjs");
const { validateVerificationArtifact } = require("./prepare-live-usdc-inflow-verification-request.cjs");
const { resolveActiveSession, applyTenantContext } = require("./reconcile-live-attestcoin-evidence.cjs");

require("dotenv").config({ path: resolve(__dirname, "../../../.env"), quiet: true });
const id = (prefix) => `${prefix}_${randomUUID().replaceAll("-", "")}`;
const load = (file) => JSON.parse(readFileSync(resolve(file), "utf8"));
const EXPECTED_REQUEST_ID = "evreq_bf3e479163564867b284bbbe81cc7de8";
const EXPECTED_PARENT_DECISION_ID = "decision_6967bcf81c7e43e9bba64b3bb5f7101a";

function validateFinality(proof, request, finality) {
  const proofSummary = validateStoredArtifact(proof);
  validateVerificationArtifact(proof, request);
  if (finality?.schemaVersion !== "aeos.live-economic-evidence.usdc-transaction-verified.v1" || finality.status !== "TRANSACTION_VERIFIED") throw new Error("LIVE_USDC_FINALITY_ARTIFACT_INVALID");
  if (finality.sourceProof?.bundleHash !== proofSummary.bundleHash || finality.sourceProof?.transactionHash !== proof.source.transactionHash || finality.verificationRequestHash !== request.verificationRequestHash) throw new Error("LIVE_USDC_FINALITY_LINEAGE_MISMATCH");
  const receipt = finality.canonicalSubmission;
  if (receipt?.chainId !== 102031 || receipt.from !== request.verificationRequest.from || receipt.to !== request.verificationRequest.to || receipt.status !== 1 || receipt.confirmations < 2 || receipt.canonicalBlockVerified !== true || receipt.calldataVerified !== true || receipt.zeroValueVerified !== true || receipt.transactionVerifiedEvent !== true) throw new Error("LIVE_USDC_FINALITY_RECEIPT_INVALID");
  if (receipt.transactionVerified?.chainKey !== request.expectedCall.chainKey || receipt.transactionVerified?.height !== request.expectedCall.headerNumber || receipt.transactionVerified?.transactionIndex !== request.expectedCall.transactionIndex) throw new Error("LIVE_USDC_FINALITY_EVENT_MISMATCH");
  if (finality.controls?.immutableTenantEvidenceCreated !== false || finality.controls?.signerCustody !== false || finality.controls?.broadcastCapability !== false || finality.controls?.assetExecutionAuthorized !== false) throw new Error("LIVE_USDC_FINALITY_AUTHORITY_INVALID");
  return { proofSummary, receipt };
}

function buildEvidenceFact(proof, request, finality, now = new Date()) {
  validateFinality(proof, request, finality);
  const event = proof.economicEvent;
  const observedAt = proof.source.blockObservedAt;
  const freshnessExpiresAt = new Date(new Date(observedAt).getTime() + 24 * 60 * 60 * 1000);
  const freshnessStatus = freshnessExpiresAt.getTime() > now.getTime() ? "FRESH" : "STALE";
  const qualityComponents = { proofStrength: 35, sourceReliability: 20, freshness: freshnessStatus === "FRESH" ? 20 : 0, completeness: 15, consistency: 10 };
  const fact = {
    subject: { type: "wallet", id: `eip155:11155111:${event.monitoredAddress}` },
    predicate: "asset.transfer.inflow",
    value: {
      transactionHash: proof.source.transactionHash,
      tokenContract: event.token.contract,
      tokenStandard: event.token.standard,
      symbol: event.token.symbol,
      decimals: event.token.decimals,
      amountBaseUnits: event.amountBaseUnits,
      amountFormatted: event.amountFormatted,
      sender: event.sender,
      recipient: event.monitoredAddress,
      currentBalanceVerified: false,
      priceVerified: false,
      liquidityVerified: false,
      testnetAssetOnly: true,
    },
    chain: { id: 11155111, blockNumber: proof.source.blockNumber, blockHash: proof.source.blockHash, transactionIndex: proof.proof.txIndex, logIndex: event.transferLogIndex },
    source: {
      provider: proof.provider,
      sourceTransactionHash: proof.source.transactionHash,
      proofBundleHash: proof.verification.frozen.bundleHash,
      verificationRequestHash: request.verificationRequestHash,
      verificationTransactionHash: finality.canonicalSubmission.transactionHash,
      verificationScope: "ATTESTCOIN_SOURCE_TRANSACTION_INCLUSION_AND_CALLDATA",
      receiptTransferLogCorroborated: true,
    },
    verificationStatus: "VERIFIED",
    observedAt,
  };
  return { fact, contentHash: hashValue(fact), freshnessStatus, freshnessExpiresAt: freshnessExpiresAt.toISOString(), qualityComponents, qualityScore: Object.values(qualityComponents).reduce((sum, value) => sum + value, 0) };
}

async function persist(client, session, proof, request, finality, observedReceipt, requestId) {
  const org = session.organization_id;
  const built = buildEvidenceFact(proof, request, finality);
  if (session.wallet_address.toLowerCase() !== proof.economicEvent.monitoredAddress || session.wallet_address.toLowerCase() !== request.verificationRequest.from) throw new Error("LIVE_USDC_SESSION_WALLET_MISMATCH");
  const reverse = await client.query("SELECT r.*,e.status terminal_status,e.evidence_id terminal_evidence_id,l.gap_id,l.agent_message_id FROM evidence_requests r JOIN LATERAL(SELECT status,evidence_id FROM evidence_request_events WHERE organization_id=r.organization_id AND request_id=r.id ORDER BY ordinal DESC LIMIT 1)e ON true JOIN decision_evidence_gap_links l ON l.organization_id=r.organization_id AND l.evidence_request_id=r.id WHERE r.organization_id=$1 AND r.id=$2", [org, requestId]);
  if (reverse.rowCount !== 1) throw new Error("LIVE_USDC_REVERSE_REQUEST_NOT_FOUND");
  const reverseRow = reverse.rows[0];
  if (reverseRow.decision_id !== EXPECTED_PARENT_DECISION_ID || reverseRow.gap_type !== "BALANCE" || reverseRow.source_chain_id !== 11155111 || reverseRow.subject !== proof.economicEvent.monitoredAddress || reverseRow.terminal_status !== "SATISFIED" || reverseRow.broker_version !== "deterministic-mock-evidence-broker-v1") throw new Error("LIVE_USDC_REVERSE_REQUEST_BOUNDARY_MISMATCH");

  const existingJob = await client.query("SELECT * FROM attestcoin_proof_jobs WHERE organization_id=$1 AND source_chain_id=11155111 AND source_tx_hash=$2", [org, proof.source.transactionHash]);
  if (existingJob.rowCount) {
    const row = existingJob.rows[0];
    if (row.status !== "VERIFIED" || !row.evidence_id || row.proof_snapshot_hash !== proof.verification.frozen.proofPayloadHash || row.verification_request_hash !== request.verificationRequestHash || row.verification_tx_hash !== observedReceipt.transactionHash) throw new Error("LIVE_USDC_EXISTING_JOB_MISMATCH");
    return { jobId: row.id, evidenceId: row.evidence_id, created: false, ...built, reverseRequestId: requestId };
  }

  const jobId = id("uscjob");
  await client.query("INSERT INTO attestcoin_proof_jobs(id,organization_id,adapter,source_chain_id,source_chain_key,source_tx_hash,requester_wallet,status,source_snapshot,source_snapshot_hash,proof_snapshot,proof_snapshot_hash,verification_request,verification_request_hash,verification_receipt,verification_receipt_hash,verification_tx_hash) VALUES($1,$2,$3,11155111,1,$4,$5,'VERIFIED',$6,$7,$8,$9,$10,$11,$12,$13,$14)", [jobId, org, proof.provider, proof.source.transactionHash, request.verificationRequest.from, proof.source, proof.verification.frozen.sourceSnapshotHash, proof.proof, proof.verification.frozen.proofPayloadHash, request.verificationRequest, request.verificationRequestHash, observedReceipt, hashValue(observedReceipt), observedReceipt.transactionHash]);
  const rawPayload = { schemaVersion: "aeos.live-economic-evidence.usdc-inflow.raw.v1", source: proof.source, economicEvent: proof.economicEvent, proofBundleHash: proof.verification.frozen.bundleHash, verificationRequestHash: request.verificationRequestHash, verificationReceipt: observedReceipt, truthBoundary: { verifiedClaim: "ATTESTCOIN_SOURCE_TRANSACTION_INCLUSION_AND_CALLDATA", currentBalanceVerified: false, priceVerified: false, liquidityVerified: false, testnetAssetOnly: true, assetExecutionAuthorized: false } };
  const rawHash = hashValue(rawPayload);
  const raw = await client.query("INSERT INTO raw_attestations(id,organization_id,provider,chain_id,payload,content_hash) VALUES($1,$2,$3,11155111,$4,$5) ON CONFLICT(organization_id,content_hash) DO NOTHING RETURNING id", [id("raw"), org, proof.provider, rawPayload, rawHash]);
  const rawId = raw.rowCount ? raw.rows[0].id : (await client.query("SELECT id FROM raw_attestations WHERE organization_id=$1 AND content_hash=$2", [org, rawHash])).rows[0]?.id;
  if (!rawId) throw new Error("LIVE_USDC_RAW_ATTESTATION_NOT_PERSISTED");
  const evidenceId = id("ev");
  const evidence = await client.query("INSERT INTO evidence(id,organization_id,raw_attestation_id,subject,predicate,value,chain,source,verification_status,freshness_status,freshness_expires_at,quality_score,quality_components,observed_at,content_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'VERIFIED',$9,$10,$11,$12,$13,$14) ON CONFLICT(organization_id,content_hash) DO NOTHING RETURNING id", [evidenceId, org, rawId, built.fact.subject, built.fact.predicate, built.fact.value, built.fact.chain, built.fact.source, built.freshnessStatus, built.freshnessExpiresAt, built.qualityScore, built.qualityComponents, built.fact.observedAt, built.contentHash]);
  const resolvedEvidenceId = evidence.rowCount ? evidence.rows[0].id : (await client.query("SELECT id FROM evidence WHERE organization_id=$1 AND content_hash=$2", [org, built.contentHash])).rows[0]?.id;
  if (!resolvedEvidenceId) throw new Error("LIVE_USDC_EVIDENCE_NOT_PERSISTED");
  const classification = await persistEvidenceClassification(client, org, { id: resolvedEvidenceId, contentHash: built.contentHash, subject: built.fact.subject, predicate: built.fact.predicate, value: built.fact.value, source: built.fact.source, verificationStatus: "VERIFIED" });
  await client.query("UPDATE attestcoin_proof_jobs SET evidence_id=$3 WHERE organization_id=$1 AND id=$2", [org, jobId, resolvedEvidenceId]);

  const existingResponse = await client.query("SELECT id FROM agent_messages WHERE organization_id=$1 AND decision_id=$2 AND evidence_request_id=$3 AND code='LIVE_TRANSFER_INFLOW_SUPPLEMENT'", [org, reverseRow.decision_id, requestId]);
  if (!existingResponse.rowCount) {
    const ordinal = Number((await client.query("SELECT COALESCE(max(ordinal),-1)+1 ordinal FROM agent_messages WHERE organization_id=$1 AND decision_id=$2", [org, reverseRow.decision_id])).rows[0].ordinal);
    const message = { ordinal, round: 5, senderRole: "Research", recipientRole: "Governor", messageType: "RESPONSE", code: "LIVE_TRANSFER_INFLOW_SUPPLEMENT", content: "Verified test-USDC inflow Evidence is available. It supplements the request but does not satisfy the requested current-balance predicate.", evidenceIds: [resolvedEvidenceId], evidenceRequestId: requestId, requestClaimSatisfied: false, reasonCode: "PREDICATE_SCOPE_MISMATCH_BALANCE_VS_TRANSFER" };
    await client.query("INSERT INTO agent_messages(id,organization_id,decision_id,ordinal,round,sender_role,recipient_role,message_type,code,content,evidence_ids,input_hash,content_hash,evidence_request_id) VALUES($1,$2,$3,$4,5,'Research','Governor','RESPONSE',$5,$6,$7,$8,$9,$10)", [id("message"), org, reverseRow.decision_id, ordinal, message.code, message.content, JSON.stringify(message.evidenceIds), reverseRow.request_hash, hashValue(message), requestId]);
  }
  const auditData = { parentDecisionId: reverseRow.decision_id, reverseEvidenceRequestId: requestId, originalRequestPredicate: "asset.balance", importedEvidencePredicate: built.fact.predicate, requestClaimSatisfied: false, reasonCode: "PREDICATE_SCOPE_MISMATCH_BALANCE_VS_TRANSFER", evidenceId: resolvedEvidenceId, proofJobId: jobId, sourceTransactionHash: proof.source.transactionHash, verificationTransactionHash: observedReceipt.transactionHash, classificationHash: classification.classificationHash, signerCustody: false, broadcastCapability: false, assetExecutionAuthorized: false };
  const auditPayload = { eventType: "evidence.request_supplemental_live_evidence_imported", organizationId: org, objectType: "evidence_request", objectId: requestId, data: auditData };
  await client.query("INSERT INTO audit_events(id,organization_id,event_type,actor,action,object_type,object_id,data,payload_hash) VALUES($1,$2,$3,$4,$3,'evidence_request',$5,$6,$7)", [id("audit"), org, auditPayload.eventType, { type: "human", id: session.user_id, walletAddress: session.wallet_address }, requestId, auditData, hashValue(auditPayload)]);
  return { jobId, evidenceId: resolvedEvidenceId, created: true, classification, ...built, reverseRequestId: requestId };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
  const proofPath = process.env.AEOS_LIVE_USDC_PROOF_OUTPUT || resolve(__dirname, "../../../reports/live-demo/real-usdc-inflow-usc-proof-retry-1.json");
  const requestPath = process.env.AEOS_LIVE_USDC_VERIFICATION_REQUEST_OUTPUT || resolve(__dirname, "../../../reports/live-demo/real-usdc-inflow-usc-verification-request-retry-1.json");
  const finalityPath = process.env.AEOS_LIVE_USDC_TRANSACTION_VERIFICATION_OUTPUT || resolve(__dirname, "../../../reports/live-demo/real-usdc-inflow-usc-transaction-verified-retry-1.json");
  const outputPath = resolve(process.env.AEOS_LIVE_USDC_EVIDENCE_IMPORT_OUTPUT || resolve(__dirname, "../../../reports/live-demo/real-usdc-inflow-evidence-import-v1.json"));
  const proof = load(proofPath), request = load(requestPath), finality = load(finalityPath);
  validateFinality(proof, request, finality);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL }); const client = await pool.connect();
  try {
    const session = await resolveActiveSession(client, request.verificationRequest.from);
    const adapter = new UscAttestcoinAdapter("https://sepolia.invalid", process.env.CREDITCOIN_RPC_URL);
    const observedReceipt = await adapter.inspectVerificationTransaction(finality.canonicalSubmission.transactionHash, request.verificationRequest);
    await client.query("BEGIN");
    try {
      await applyTenantContext(client, session);
      const imported = await persist(client, session, proof, request, finality, observedReceipt, process.env.AEOS_REVERSE_EVIDENCE_REQUEST_ID || EXPECTED_REQUEST_ID);
      await client.query("COMMIT");
      const artifact = { schemaVersion: "aeos.live-economic-evidence.usdc-evidence-import.v1", status: "IMMUTABLE_EVIDENCE_IMPORTED", recordedAt: new Date().toISOString(), tenantBinding: "SERVER_RESOLVED_ACTIVE_SIWE_SESSION", rawTenantIdentifiersDisclosed: false, proofJobId: imported.jobId, evidenceId: imported.evidenceId, evidenceContentHash: imported.contentHash, predicate: imported.fact.predicate, freshnessStatus: imported.freshnessStatus, freshnessExpiresAt: imported.freshnessExpiresAt, qualityScore: imported.qualityScore, reverseEvidenceRequest: { id: imported.reverseRequestId, requestedPredicate: "asset.balance", importedPredicate: imported.fact.predicate, requestClaimSatisfied: false, reasonCode: "PREDICATE_SCOPE_MISMATCH_BALANCE_VS_TRANSFER", originalLifecycleMutated: false }, sourceTransactionHash: proof.source.transactionHash, verificationTransactionHash: observedReceipt.transactionHash, idempotentReplay: !imported.created, controls: { immutableEvidenceCreated: true, organizationRlsRequired: true, signerCustody: false, broadcastCapability: false, assetExecutionAuthorized: false }, truthBoundary: { verifiedClaim: "ATTESTCOIN_SOURCE_TRANSACTION_INCLUSION_AND_CALLDATA", currentBalanceVerified: false, priceVerified: false, liquidityVerified: false, realFinancialValueClaimed: false, childDecisionCreated: false } };
      if (existsSync(outputPath)) {
        const existing = load(outputPath);
        if (existing?.schemaVersion !== artifact.schemaVersion || existing?.status !== artifact.status || existing?.evidenceId !== artifact.evidenceId || existing?.evidenceContentHash !== artifact.evidenceContentHash || existing?.sourceTransactionHash !== artifact.sourceTransactionHash || existing?.verificationTransactionHash !== artifact.verificationTransactionHash || existing?.controls?.assetExecutionAuthorized !== false) throw new Error("LIVE_USDC_EVIDENCE_IMPORT_ARTIFACT_MISMATCH");
      } else {
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      }
      console.log(JSON.stringify({ status: artifact.status, outputPath, evidenceId: artifact.evidenceId, predicate: artifact.predicate, freshnessStatus: artifact.freshnessStatus, qualityScore: artifact.qualityScore, idempotentReplay: !imported.created, reverseRequestClaimSatisfied: false, childDecisionCreated: false, signerCustody: false, broadcastCapability: false, assetExecutionAuthorized: false }, null, 2));
    } catch (error) { await client.query("ROLLBACK"); throw error; }
  } finally { client.release(); await pool.end(); }
}

if (require.main === module) main().catch(error => { console.error(error instanceof Error ? error.message : "LIVE_USDC_EVIDENCE_RECONCILIATION_FAILED"); process.exit(1); });
module.exports = { buildEvidenceFact, persist, validateFinality };
