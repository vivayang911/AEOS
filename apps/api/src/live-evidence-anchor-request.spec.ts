import { buildEvidenceAnchorManifest } from "./evidence-anchor-engine";
import { buildLiveEvidenceAnchorRequestArtifact } from "./live-evidence-anchor-request";
import { hashValue } from "./decision-engine";

const proof:any={chainKey:1,headerNumber:11543014,txBytes:"0x1234",merkleProof:{root:`0x${"11".repeat(32)}`,siblings:[]},continuityProof:{lowerEndpointDigest:`0x${"22".repeat(32)}`,roots:[]}};
const manifest=buildEvidenceAnchorManifest({ascAddress:"0x5DE85313c5622e3707C3fED8932F51e5991e62C2",requester:"0x444D510728FB8072351cB5d0E88432e6a8501DFA",decisionId:"decision_live",decisionOutputHash:`0x${"33".repeat(32)}`,evidenceSnapshotId:"snap_live",evidenceSnapshotHash:`0x${"44".repeat(32)}`,proof});
const expected={proofJobId:"job_live",proofSnapshotHash:`0x${"55".repeat(32)}`,verificationReceiptHash:`0x${"66".repeat(32)}`,decisionId:manifest.decisionId,decisionOutputHash:manifest.decisionOutputHash,snapshotId:manifest.evidenceSnapshotId,snapshotHash:manifest.evidenceSnapshotHash,ascAddress:manifest.ascAddress,deploymentTransactionHash:`0x${"77".repeat(32)}`};
const handoff={id:"anchor_live",attestcoinProofJobId:expected.proofJobId,decisionId:expected.decisionId,evidenceSnapshotId:expected.snapshotId,ascAddress:manifest.ascAddress,commitmentId:manifest.commitmentId,manifest,manifestHash:hashValue(manifest)};

describe("live Step 9 anchor request",()=>{
  it("freezes exact zero-value calldata and zero authority",()=>expect(buildLiveEvidenceAnchorRequestArtifact({recordedAt:"2026-08-23T00:00:00.000Z",handoff,expected})).toMatchObject({step:9,status:"ANCHOR_REQUEST_PREPARED",unsignedTransaction:{chainId:102031,value:"0x0"},controls:{signed:false,submitted:false,assetExecutionAuthorized:false},truthBoundary:{decisionOutputHashDirectlyAnchoredOnChain:false}}));
  it("rejects a Decision output hash mismatch",()=>expect(()=>buildLiveEvidenceAnchorRequestArtifact({recordedAt:"2026-08-23T00:00:00.000Z",handoff,expected:{...expected,decisionOutputHash:`0x${"88".repeat(32)}`}})).toThrow("LIVE_STEP_9_FROZEN_HASH_MISMATCH"));
  it("rejects a substituted ASC target",()=>expect(()=>buildLiveEvidenceAnchorRequestArtifact({recordedAt:"2026-08-23T00:00:00.000Z",handoff:{...handoff,ascAddress:"0x1111111111111111111111111111111111111111"},expected})).toThrow("LIVE_STEP_9_ASC_ADDRESS_MISMATCH"));
});
