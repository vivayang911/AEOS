import { decisionRoles,hashValue } from "./decision-engine";

const fail=(code:string):never=>{throw new Error(code)};
const sorted=(values:ReadonlyArray<string>)=>[...new Set(values)].sort();

type Snapshot={id:string;manifestHash:string;evidenceIds:string[]};

export function buildLiveUsdcInflowChildDecisionArtifact(input:{
  recordedAt:string;
  parent:any;
  child:any;
  parentSnapshot:Snapshot;
  childSnapshot:Snapshot;
  newEvidence:{id:string;contentHash:string;predicate:string;freshnessStatus:string;verificationStatus:string};
}){
  const {parent,child,parentSnapshot,childSnapshot,newEvidence}=input;
  if(child.id===parent.id||child.parentDecisionId!==parent.id||child.revisionNumber!==parent.revisionNumber+1)fail("LIVE_USDC_CHILD_DECISION_LINEAGE_INVALID");
  if(parent.evidenceSnapshotId!==parentSnapshot.id||child.evidenceSnapshotId!==childSnapshot.id||parent.evidenceManifestHash!==parentSnapshot.manifestHash||child.evidenceManifestHash!==childSnapshot.manifestHash)fail("LIVE_USDC_CHILD_SNAPSHOT_BINDING_INVALID");
  if(newEvidence.predicate!=="asset.transfer.inflow"||newEvidence.verificationStatus!=="VERIFIED")fail("LIVE_USDC_CHILD_EVIDENCE_BOUNDARY_INVALID");
  if(!childSnapshot.evidenceIds.includes(newEvidence.id)||parentSnapshot.evidenceIds.includes(newEvidence.id))fail("LIVE_USDC_CHILD_EVIDENCE_ADDITION_INVALID");
  if(parentSnapshot.evidenceIds.some(id=>!childSnapshot.evidenceIds.includes(id))||childSnapshot.evidenceIds.length!==parentSnapshot.evidenceIds.length+1)fail("LIVE_USDC_CHILD_SNAPSHOT_INHERITANCE_INVALID");
  if(parent.retrievalBundleHash!==child.retrievalBundleHash||parent.retrievalManifests?.length!==8||child.retrievalManifests?.length!==8)fail("LIVE_USDC_CHILD_RAG_BUNDLE_NOT_INHERITED");

  const roleComparisons=decisionRoles.map(role=>{
    const parentManifest=parent.retrievalManifests.find((item:any)=>item.role===role);
    const childManifest=child.retrievalManifests.find((item:any)=>item.role===role);
    const parentPosition=parent.recommendation?.agentPositions?.find((item:any)=>item.role===role);
    const childPosition=child.recommendation?.agentPositions?.find((item:any)=>item.role===role);
    if(!parentManifest||!childManifest||!parentPosition||!childPosition)fail(`LIVE_USDC_CHILD_ROLE_MISSING_${role}`);
    const parentItems=parentManifest.items??[],childItems=childManifest.items??[];
    if(parentManifest.manifest_hash!==childManifest.manifest_hash||parentManifest.query_hash!==childManifest.query_hash||hashValue(parentItems)!==hashValue(childItems))fail(`LIVE_USDC_CHILD_RAG_MUTATED_${role}`);
    if(hashValue(parentPosition.knowledgeCitations??[])!==hashValue(childPosition.knowledgeCitations??[]))fail(`LIVE_USDC_CHILD_KNOWLEDGE_CITATIONS_MUTATED_${role}`);
    const parentEvidenceCitations=sorted(parentPosition.citations??[]),childEvidenceCitations=sorted(childPosition.citations??[]);
    if(!childEvidenceCitations.includes(newEvidence.id)||parentEvidenceCitations.some(id=>!childEvidenceCitations.includes(id)))fail(`LIVE_USDC_CHILD_EVIDENCE_CITATIONS_INVALID_${role}`);
    return {
      role,
      retrievalManifestHash:childManifest.manifest_hash,
      ragCitationCount:childItems.length,
      ragCitationsChanged:false,
      evidenceCitations:{before:parentEvidenceCitations,after:childEvidenceCitations,added:childEvidenceCitations.filter(id=>!parentEvidenceCitations.includes(id))},
      position:{before:parentPosition.position,after:childPosition.position,changed:parentPosition.position!==childPosition.position}
    };
  });

  const challenges=(decision:any)=>decision.recommendation?.challenges?.map((item:any)=>({raisedBy:item.raisedBy,targetRole:item.targetRole,code:item.code,status:item.status,challenge:item.challenge,response:item.response}))??[];
  const parentChallenges=challenges(parent),childChallenges=challenges(child);
  const strategy=roleComparisons.find(item=>item.role==="Strategy")!;
  const treasury=roleComparisons.find(item=>item.role==="Treasury")!;
  const treasuryMessages=(decision:any)=>decision.agentMessages?.filter((message:any)=>message.sender_role==="Treasury"||message.recipient_role==="Treasury").map((message:any)=>({code:message.code,content:message.content,evidenceIds:sorted(message.evidence_ids??[])}))??[];
  const core={
    schemaVersion:"aeos.live-economic-evidence.usdc-child-decision.v1",
    status:"CHILD_DECISION_FROZEN_AND_COMPARED",
    recordedAt:input.recordedAt,
    evidence:newEvidence,
    lineage:{parentDecisionId:parent.id,childDecisionId:child.id,parentSnapshot,parentSnapshotImmutable:true,childSnapshot,parentEvidenceInherited:true,newEvidenceAdded:true},
    retrieval:{bundleHash:child.retrievalBundleHash,inheritedExactly:true,roleComparisons},
    decisionComparison:{
      recommendation:{before:parent.recommendation?.recommendation,after:child.recommendation?.recommendation,changed:parent.recommendation?.recommendation!==child.recommendation?.recommendation},
      strategy,
      risk:{before:parentChallenges.filter((item:any)=>item.raisedBy==="Risk"),after:childChallenges.filter((item:any)=>item.raisedBy==="Risk")},
      compliance:{before:parentChallenges.filter((item:any)=>item.raisedBy==="Compliance"),after:childChallenges.filter((item:any)=>item.raisedBy==="Compliance")},
      treasury:{...treasury,preflightMessages:{before:treasuryMessages(parent),after:treasuryMessages(child)}},
      interpretation:"The verified inflow adds a fresh transfer fact, but it does not prove current balance, price, liquidity, volatility, or authorization. The inherited stale Evidence therefore remains a deterministic blocker; Strategy continues operational HOLD and Treasury still creates no transaction."
    },
    truthBoundary:{verifiedClaim:"ATTESTCOIN_VERIFIED_TEST_USDC_TRANSFER_INFLOW",currentBalanceVerified:false,priceVerified:false,liquidityVerified:false,staleParentEvidenceRemoved:false},
    controls:{eightAgentRun:true,humanApprovalRequired:true,proposalCreated:false,signature:false,broadcast:false,assetExecutionAuthorized:false}
  };
  if(child.agentRuns?.length!==8||child.recommendation?.actions?.length||child.recommendation?.assetExecutionAuthorized!==false||child.recommendation?.humanApprovalRequired!==true)fail("LIVE_USDC_CHILD_DECISION_AUTHORITY_INVALID");
  return {...core,artifactHash:hashValue(core)};
}
