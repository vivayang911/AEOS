import { buildDecisionBoundHoldVote, HoldAttemptArtifact, HoldProposalActiveFinality } from "./live-governance-hold-vote";

const h = (c: string) => `0x${c.repeat(64)}`;
const voter = "0x1111111111111111111111111111111111111111";
const governor = "0x2222222222222222222222222222222222222222";
const frozen: HoldAttemptArtifact = { schemaVersion: "aeos.live-governance-hold-proposal.v2", artifactHash: h("a"), lineage: { decisionId: "decision", decisionOutputHash: h("b"), evidenceSnapshotId: "snapshot", evidenceManifestHash: h("c"), attempt: { attemptNumber: 2, attemptIdentity: h("d"), previousProposalId: "99" } }, contracts: { token: "0x3333333333333333333333333333333333333333", governor, treasuryGuard: "0x4444444444444444444444444444444444444444" }, proposal: { proposalId: "123", proposalType: "SECURITY_HOLD" }, unsignedTransaction: { chainId: 102031, from: voter, to: governor } };
const finality: HoldProposalActiveFinality = { status: "PROPOSAL_ACTIVE", proposalCreationVerified: true, transactionHash: h("e"), proposalArtifactHash: h("a"), proposalId: "123", chainId: 102031, blockNumber: 100, blockHash: h("f"), confirmations: 5, governance: { state: "Active", stateCode: 1, snapshotBlock: "101", deadlineBlock: "341", votingWindowBlocks: 240 }, recoveryLineage: { previousProposalState: "Defeated", recoveryProposalState: "Executed", currentVotingPeriodBlocks: 240 } };
const readback = { voter, voterDelegate: voter, voterVotes: "1000000", quorumVotes: "40000", observedBlockNumber: 110, observedBlockHash: h("1") };

describe("Decision-bound HOLD vote", () => {
  it("freezes a separate zero-value For vote inside the 240-block active window", () => expect(buildDecisionBoundHoldVote(frozen, finality, readback, "2026-08-24T00:00:00Z")).toMatchObject({ status: "VOTE_FOR_REQUEST_PREPARED", activeWindow: { votingWindowBlocks: 240, blocksRemaining: 231 }, votingCapacity: { singleWalletMeetsQuorum: true }, unsignedTransaction: { value: "0x0", support: 1, validOnlyWhenProposalState: "Active" }, controls: { signed: false, assetExecutionAuthorized: false } }));
  it("supports a later append-only retry without weakening the vote boundary", () => expect(buildDecisionBoundHoldVote({ ...frozen, lineage: { ...frozen.lineage, attempt: { ...frozen.lineage.attempt, attemptNumber: 3 } } }, finality, readback, "2026-08-24T00:00:00Z")).toMatchObject({ lineage: { attemptNumber: 3 }, unsignedTransaction: { support: 1, value: "0x0" }, controls: { broadcastCapability: false, assetExecutionAuthorized: false } }));
  it("rejects wrong window, insufficient votes and stale observation", () => {
    expect(() => buildDecisionBoundHoldVote(frozen, { ...finality, governance: { ...finality.governance, votingWindowBlocks: 8 } }, readback, "2026-08-24T00:00:00Z")).toThrow("GOVERNANCE_HOLD_VOTE_FINALITY_INVALID");
    expect(() => buildDecisionBoundHoldVote(frozen, finality, { ...readback, voterVotes: "39999" }, "2026-08-24T00:00:00Z")).toThrow("GOVERNANCE_HOLD_VOTE_CAPACITY_INVALID");
    expect(() => buildDecisionBoundHoldVote(frozen, finality, { ...readback, observedBlockNumber: 342 }, "2026-08-24T00:00:00Z")).toThrow("GOVERNANCE_HOLD_VOTE_CAPACITY_INVALID");
  });
});
