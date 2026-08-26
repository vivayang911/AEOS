import { decisionRoles, hashValue } from "./decision-engine";

const fail = (code:string):never => { throw new Error(code); };
const sorted = (values:ReadonlyArray<string>) => [...new Set(values)].sort();
type Snapshot = { id:string; manifestHash:string; evidenceIds:string[] };

export function buildLiveBalanceObserverChildDecisionArtifact(input:{ recordedAt:string; parent:any; child:any; parentSnapshot:Snapshot; childSnapshot:Snapshot; newEvidence:{id:string;contentHash:string;predicate:string;freshnessStatus:string;verificationStatus:string} }) {
  const { parent, child, parentSnapshot, childSnapshot, newEvidence } = input;
  if (child.id === parent.id || child.parentDecisionId !== parent.id || child.revisionNumber !== parent.revisionNumber + 1) fail("BALANCE_CHILD_DECISION_LINEAGE_INVALID");
  if (parent.evidenceSnapshotId !== parentSnapshot.id || child.evidenceSnapshotId !== childSnapshot.id || parent.evidenceManifestHash !== parentSnapshot.manifestHash || child.evidenceManifestHash !== childSnapshot.manifestHash) fail("BALANCE_CHILD_SNAPSHOT_BINDING_INVALID");
  if (newEvidence.predicate !== "asset.balance" || newEvidence.verificationStatus !== "VERIFIED") fail("BALANCE_CHILD_EVIDENCE_BOUNDARY_INVALID");
  if (!childSnapshot.evidenceIds.includes(newEvidence.id) || parentSnapshot.evidenceIds.includes(newEvidence.id)) fail("BALANCE_CHILD_EVIDENCE_ADDITION_INVALID");
  if (parentSnapshot.evidenceIds.some((id) => !childSnapshot.evidenceIds.includes(id)) || childSnapshot.evidenceIds.length !== parentSnapshot.evidenceIds.length + 1) fail("BALANCE_CHILD_SNAPSHOT_INHERITANCE_INVALID");
  if (parent.retrievalBundleHash !== child.retrievalBundleHash || parent.retrievalManifests?.length !== 8 || child.retrievalManifests?.length !== 8) fail("BALANCE_CHILD_RAG_BUNDLE_NOT_INHERITED");

  const roleComparisons = decisionRoles.map((role) => {
    const parentManifest = parent.retrievalManifests.find((item:any) => item.role === role), childManifest = child.retrievalManifests.find((item:any) => item.role === role);
    const parentPosition = parent.recommendation?.agentPositions?.find((item:any) => item.role === role), childPosition = child.recommendation?.agentPositions?.find((item:any) => item.role === role);
    if (!parentManifest || !childManifest || !parentPosition || !childPosition) fail(`BALANCE_CHILD_ROLE_MISSING_${role}`);
    const parentItems = parentManifest.items ?? [], childItems = childManifest.items ?? [];
    const parentManifestHash = parentManifest.manifest_hash ?? parentManifest.manifestHash, childManifestHash = childManifest.manifest_hash ?? childManifest.manifestHash;
    const parentQueryHash = parentManifest.query_hash ?? parentManifest.queryHash, childQueryHash = childManifest.query_hash ?? childManifest.queryHash;
    if (!parentManifestHash || !childManifestHash || parentManifestHash !== childManifestHash || parentQueryHash !== childQueryHash || hashValue(parentItems) !== hashValue(childItems)) fail(`BALANCE_CHILD_RAG_MUTATED_${role}`);
    if (hashValue(parentPosition.knowledgeCitations ?? []) !== hashValue(childPosition.knowledgeCitations ?? [])) fail(`BALANCE_CHILD_KNOWLEDGE_CITATIONS_MUTATED_${role}`);
    const before = sorted(parentPosition.citations ?? []), after = sorted(childPosition.citations ?? []);
    if (!after.includes(newEvidence.id) || before.some((id) => !after.includes(id))) fail(`BALANCE_CHILD_EVIDENCE_CITATIONS_INVALID_${role}`);
    return { role, retrievalManifestHash: childManifestHash, ragCitationCount: childItems.length, ragCitationsChanged: false, evidenceCitations: { before, after, added: after.filter((id) => !before.includes(id)) }, position: { before: parentPosition.position, after: childPosition.position, changed: parentPosition.position !== childPosition.position } };
  });
  const challenges = (decision:any) => decision.recommendation?.challenges?.map((item:any) => ({ raisedBy:item.raisedBy,targetRole:item.targetRole,code:item.code,status:item.status,challenge:item.challenge,response:item.response })) ?? [];
  const parentChallenges = challenges(parent), childChallenges = challenges(child);
  const strategy = roleComparisons.find((item) => item.role === "Strategy")!, treasury = roleComparisons.find((item) => item.role === "Treasury")!;
  const treasuryMessages = (decision:any) => decision.agentMessages?.filter((message:any) => message.sender_role === "Treasury" || message.recipient_role === "Treasury").map((message:any) => ({ code:message.code,content:message.content,evidenceIds:sorted(message.evidence_ids ?? []) })) ?? [];
  const core = {
    schemaVersion:"aeos.live-economic-evidence.balance-observer-child-decision.v1", status:"CHILD_DECISION_FROZEN_AND_COMPARED", recordedAt:input.recordedAt, evidence:newEvidence,
    lineage:{ parentDecisionId:parent.id,childDecisionId:child.id,parentSnapshot,parentSnapshotImmutable:true,childSnapshot,parentEvidenceInherited:true,newEvidenceAdded:true },
    retrieval:{ bundleHash:child.retrievalBundleHash,inheritedExactly:true,roleComparisons },
    decisionComparison:{ recommendation:{before:parent.recommendation?.recommendation,after:child.recommendation?.recommendation,changed:parent.recommendation?.recommendation !== child.recommendation?.recommendation}, strategy, risk:{before:parentChallenges.filter((item:any) => item.raisedBy === "Risk"),after:childChallenges.filter((item:any) => item.raisedBy === "Risk")}, compliance:{before:parentChallenges.filter((item:any) => item.raisedBy === "Compliance"),after:childChallenges.filter((item:any) => item.raisedBy === "Compliance")}, treasury:{...treasury,preflightMessages:{before:treasuryMessages(parent),after:treasuryMessages(child)}}, interpretation:"The verified observer transaction adds a block-specific balanceOf return. Its five-minute balance freshness window is expired, and it proves neither price, liquidity nor authorization. Deterministic guardrails therefore preserve INSUFFICIENT_EVIDENCE and operational HOLD; all eight roles cite the new fact but Treasury creates no transaction." },
    truthBoundary:{ verifiedClaim:"ATTESTCOIN_VERIFIED_BLOCK_SPECIFIC_TEST_USDC_BALANCE_OBSERVATION",currentAtObservationBlockOnly:true,continuouslyCurrent:false,priceVerified:false,liquidityVerified:false,staleEvidenceRemoved:false },
    controls:{ eightAgentRun:true,humanApprovalRequired:true,proposalCreated:false,signature:false,broadcast:false,assetExecutionAuthorized:false }
  };
  if (child.agentRuns?.length !== 8 || child.recommendation?.actions?.length || child.recommendation?.assetExecutionAuthorized !== false || child.recommendation?.humanApprovalRequired !== true) fail("BALANCE_CHILD_DECISION_AUTHORITY_INVALID");
  return { ...core, artifactHash:hashValue(core) };
}
