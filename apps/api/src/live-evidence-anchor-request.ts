import { Interface,getAddress,keccak256 } from "ethers";
import { EVIDENCE_ANCHOR_ABI } from "./evidence-anchor-engine";
import { hashValue } from "./decision-engine";

type Input={recordedAt:string;handoff:any;expected:{proofJobId:string;proofSnapshotHash:string;verificationReceiptHash:string;decisionId:string;decisionOutputHash:string;snapshotId:string;snapshotHash:string;ascAddress:string;deploymentTransactionHash:string}};
const fail=(code:string):never=>{throw new Error(code)};

export function buildLiveEvidenceAnchorRequestArtifact(input:Input){
  const h=input.handoff,m=h?.manifest,t=m?.transaction,e=input.expected;
  if(!h||!m||m.schemaVersion!=="evidence.anchor.handoff.v1")fail("LIVE_STEP_9_HANDOFF_SCHEMA_INVALID");
  if(h.attestcoinProofJobId!==e.proofJobId||h.decisionId!==e.decisionId||h.evidenceSnapshotId!==e.snapshotId)fail("LIVE_STEP_9_LINEAGE_IDENTITY_MISMATCH");
  if(m.decisionId!==e.decisionId||m.decisionOutputHash!==e.decisionOutputHash||m.evidenceSnapshotId!==e.snapshotId||m.evidenceSnapshotHash!==e.snapshotHash)fail("LIVE_STEP_9_FROZEN_HASH_MISMATCH");
  const asc=getAddress(e.ascAddress).toLowerCase();if(h.ascAddress!==asc||m.ascAddress!==asc||t?.to!==asc)fail("LIVE_STEP_9_ASC_ADDRESS_MISMATCH");
  if(t.chainId!==102031||t.from!==m.requester||t.value!=="0x0"||!/^0x[0-9a-f]+$/i.test(t.data)||m.signed!==false||m.submitted!==false||m.assetExecutionAuthorized!==false)fail("LIVE_STEP_9_TRANSACTION_BOUNDARY_INVALID");
  const decoded=new Interface(EVIDENCE_ANCHOR_ABI).decodeFunctionData("verifyAndAnchor",t.data);
  if(String(decoded.decisionId).toLowerCase()!==m.decisionKey||String(decoded.snapshotHash).toLowerCase()!==m.evidenceSnapshotHash||Number(decoded.sourceChainKey)!==m.sourceChainKey||Number(decoded.sourceBlockHeight)!==m.sourceBlockHeight||keccak256(decoded.encodedTransaction)!==m.encodedTransactionHash)fail("LIVE_STEP_9_CALLDATA_MISMATCH");
  const core={schemaVersion:"aeos.live-attestcoin-step.v1",step:9,status:"ANCHOR_REQUEST_PREPARED",recordedAt:input.recordedAt,tenantBinding:"SERVER_RESOLVED_ACTIVE_SESSION",rawTenantIdentifiersDisclosed:false,
    deployment:{ascAddress:asc,deploymentTransactionHash:e.deploymentTransactionHash,verificationStatus:"VERIFIED"},
    lineage:{attestcoinProofJobId:e.proofJobId,proofSnapshotHash:e.proofSnapshotHash,verificationReceiptHash:e.verificationReceiptHash,decisionId:e.decisionId,decisionOutputHash:e.decisionOutputHash,evidenceSnapshotId:e.snapshotId,evidenceSnapshotHash:e.snapshotHash},
    handoff:{id:h.id,manifestHash:h.manifestHash,commitmentId:h.commitmentId,decisionKey:m.decisionKey,encodedTransactionHash:m.encodedTransactionHash,sourceChainKey:m.sourceChainKey,sourceBlockHeight:m.sourceBlockHeight},
    unsignedTransaction:{chainId:t.chainId,from:t.from,to:t.to,value:t.value,data:t.data,dataHash:keccak256(t.data)},
    controls:{requiresUserWalletConfirmation:true,signed:false,submitted:false,containsPrivateKey:false,signerCustody:false,broadcastCapability:false,assetExecutionAuthorized:false},
    truthBoundary:{verifiedClaim:"SOURCE_TRANSACTION_INCLUSION",decisionOutputHashRecordedOffChain:true,decisionOutputHashDirectlyAnchoredOnChain:false,economicTruthVerified:false}
  };
  return {...core,artifactHash:hashValue(core)};
}
