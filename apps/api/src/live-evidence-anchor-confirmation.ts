import { hashValue } from "./decision-engine";

type Input = {
  recordedAt: string;
  step9: any;
  step10: any;
  confirmation: any;
};

const fail = (code: string): never => { throw new Error(code); };

export function buildLiveEvidenceAnchorConfirmationArtifact(input: Input) {
  const { step9, step10, confirmation } = input;
  const snapshot = confirmation?.snapshot;
  if (step9?.schemaVersion !== "aeos.live-attestcoin-step.v1" || step9.step !== 9 || step9.status !== "ANCHOR_REQUEST_PREPARED") fail("LIVE_STEP_11_STEP_9_INVALID");
  if (step10?.schemaVersion !== "aeos.live-attestcoin-step.v1" || step10.step !== 10 || step10.status !== "ANCHOR_WALLET_SUBMITTED") fail("LIVE_STEP_11_STEP_10_INVALID");
  if (step10.step9ArtifactHash !== step9.artifactHash || step10.handoffId !== step9.handoff.id || step10.commitmentId !== step9.handoff.commitmentId || step10.calldataHash !== step9.unsignedTransaction.dataHash) fail("LIVE_STEP_11_SUBMISSION_LINEAGE_MISMATCH");
  if (step10.chainId !== step9.unsignedTransaction.chainId || step10.from !== step9.unsignedTransaction.from || step10.to !== step9.unsignedTransaction.to || step10.value !== "0x0") fail("LIVE_STEP_11_SUBMISSION_TRANSACTION_MISMATCH");
  if (!confirmation || confirmation.handoffId !== step9.handoff.id || confirmation.transactionHash !== step10.transactionHash || confirmation.commitmentId !== step9.handoff.commitmentId || confirmation.decisionId !== step9.lineage.decisionId || confirmation.evidenceSnapshotId !== step9.lineage.evidenceSnapshotId) fail("LIVE_STEP_11_CONFIRMATION_LINEAGE_MISMATCH");
  if (snapshot?.schemaVersion !== "evidence.anchor.confirmation.v1" || snapshot.chainId !== 102031 || snapshot.from !== step10.from || snapshot.to !== step10.to || snapshot.status !== 1 || snapshot.commitmentId !== step9.handoff.commitmentId || snapshot.decisionKey !== step9.handoff.decisionKey || snapshot.snapshotHash !== step9.lineage.evidenceSnapshotHash) fail("LIVE_STEP_11_RECEIPT_IDENTITY_MISMATCH");
  if (snapshot.eventVerified !== true || snapshot.calldataVerified !== true || snapshot.zeroValueVerified !== true || snapshot.confirmations < snapshot.minimumConfirmations) fail("LIVE_STEP_11_RECEIPT_NOT_FINAL");
  if (snapshot.signerCustody !== false || snapshot.broadcastCapability !== false || snapshot.assetExecutionAuthorized !== false) fail("LIVE_STEP_11_AUTHORITY_BOUNDARY_INVALID");

  const core = {
    schemaVersion: "aeos.live-attestcoin-step.v1",
    step: 11,
    status: "EVIDENCE_ANCHORED",
    recordedAt: input.recordedAt,
    tenantBinding: "SERVER_RESOLVED_ACTIVE_SESSION",
    rawTenantIdentifiersDisclosed: false,
    lineage: {
      attestcoinProofJobId: step9.lineage.attestcoinProofJobId,
      decisionId: step9.lineage.decisionId,
      decisionOutputHash: step9.lineage.decisionOutputHash,
      evidenceSnapshotId: step9.lineage.evidenceSnapshotId,
      evidenceSnapshotHash: step9.lineage.evidenceSnapshotHash,
      handoffId: step9.handoff.id,
      handoffManifestHash: step9.handoff.manifestHash,
      commitmentId: step9.handoff.commitmentId,
      confirmationId: confirmation.id,
      confirmationSnapshotHash: confirmation.snapshotHash,
    },
    chainReceipt: {
      chainId: snapshot.chainId,
      transactionHash: snapshot.transactionHash,
      blockNumber: snapshot.blockNumber,
      blockHash: snapshot.blockHash,
      confirmations: snapshot.confirmations,
      minimumConfirmations: snapshot.minimumConfirmations,
      from: snapshot.from,
      to: snapshot.to,
      value: "0x0",
      observedAt: snapshot.observedAt,
      event: "EvidenceAnchored",
      eventVerified: true,
      calldataVerified: true,
      zeroValueVerified: true,
    },
    controls: {
      userWalletSubmitted: true,
      canonicalReceiptVerified: true,
      signerCustody: false,
      broadcastCapability: false,
      assetExecutionAuthorized: false,
    },
    truthBoundary: {
      verifiedClaim: "SOURCE_TRANSACTION_INCLUSION_AND_ANCHOR_COMMITMENT",
      decisionOutputHashRecordedOffChain: true,
      decisionOutputHashDirectlyAnchoredOnChain: false,
      payloadEconomicTruthVerified: false,
      investmentPerformanceVerified: false,
    },
  };
  return { ...core, artifactHash: hashValue(core) };
}
