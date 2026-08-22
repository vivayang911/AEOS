import { Interface } from "ethers";
import { buildEvidenceAnchorManifest, EVIDENCE_ANCHOR_ABI, parseAndValidateEvidenceAnchoredLog } from "./evidence-anchor-engine";

const proof:any={chainKey:1,headerNumber:123,txIndex:0,txHash:`0x${"11".repeat(32)}`,txBytes:"0x1234",merkleProof:{root:`0x${"22".repeat(32)}`,siblings:[]},continuityProof:{lowerEndpointDigest:`0x${"33".repeat(32)}`,roots:[]},cached:false,generatedAt:"2026-08-12T00:00:00.000Z"};
const input={ascAddress:"0x1111111111111111111111111111111111111111",requester:"0x444D510728FB8072351cB5d0E88432e6a8501DFA",decisionId:"decision_1",decisionOutputHash:`0x${"44".repeat(32)}`,evidenceSnapshotId:"snapshot_1",evidenceSnapshotHash:`0x${"55".repeat(32)}`,proof};

describe("Evidence Anchor wallet handoff",()=>{
  it("builds deterministic zero-value calldata bound to the human wallet and frozen Decision snapshot",()=>{
    const first=buildEvidenceAnchorManifest(input);const second=buildEvidenceAnchorManifest(input);
    expect(first).toEqual(second);expect(first.transaction).toEqual(expect.objectContaining({chainId:102031,from:input.requester.toLowerCase(),to:input.ascAddress,value:"0x0"}));
    expect(first).toEqual(expect.objectContaining({signed:false,submitted:false,assetExecutionAuthorized:false}));
    const decoded=new Interface(EVIDENCE_ANCHOR_ABI).decodeFunctionData("verifyAndAnchor",first.transaction.data);
    expect(decoded.decisionId).toBe(first.decisionKey);expect(decoded.snapshotHash).toBe(first.evidenceSnapshotHash);expect(decoded.encodedTransaction).toBe(proof.txBytes);
  });
  it("changes the commitment for a different requester and rejects malformed hashes/proofs",()=>{
    expect(buildEvidenceAnchorManifest({...input,requester:"0x2222222222222222222222222222222222222222"}).commitmentId).not.toBe(buildEvidenceAnchorManifest(input).commitmentId);
    expect(()=>buildEvidenceAnchorManifest({...input,evidenceSnapshotHash:"0x12"})).toThrow("INVALID_ANCHOR_HASH");
    expect(()=>buildEvidenceAnchorManifest({...input,proof:{...proof,txBytes:"0x"}})).toThrow("INVALID_ANCHOR_PROOF");
  });
  it("accepts only the exact ASC event fields",()=>{
    const manifest=buildEvidenceAnchorManifest(input);const iface=new Interface(EVIDENCE_ANCHOR_ABI);
    const event=iface.encodeEventLog(iface.getEvent("EvidenceAnchored")!,[manifest.commitmentId,manifest.decisionKey,manifest.evidenceSnapshotHash,manifest.encodedTransactionHash,manifest.sourceChainKey,manifest.sourceBlockHeight,manifest.requester]);
    expect(parseAndValidateEvidenceAnchoredLog({address:manifest.ascAddress,...event},manifest)).toEqual(expect.objectContaining({commitmentId:manifest.commitmentId}));
    const bad=iface.encodeEventLog(iface.getEvent("EvidenceAnchored")!,[`0x${"99".repeat(32)}`,manifest.decisionKey,manifest.evidenceSnapshotHash,manifest.encodedTransactionHash,manifest.sourceChainKey,manifest.sourceBlockHeight,manifest.requester]);
    expect(()=>parseAndValidateEvidenceAnchoredLog({address:manifest.ascAddress,...bad},manifest)).toThrow("EVIDENCE_ANCHOR_EVENT_MISMATCH");
    expect(parseAndValidateEvidenceAnchoredLog({address:"0x3333333333333333333333333333333333333333",...event},manifest)).toBeNull();
  });
});
