import { Interface } from "ethers";
import { buildLiveGovernanceHoldProposal, LiveGovernanceHoldProposalInput } from "./live-governance-hold-proposal";

const h = (c: string) => `0x${c.repeat(64)}`;
const addresses = {
  deployer: "0x1111111111111111111111111111111111111111",
  token: "0x2222222222222222222222222222222222222222",
  timelock: "0x3333333333333333333333333333333333333333",
  governor: "0x4444444444444444444444444444444444444444",
  treasuryGuard: "0x5555555555555555555555555555555555555555",
};
const guardData = new Interface(["function setPaused(bool)"]).encodeFunctionData("setPaused", [true]);
const fixture = (): LiveGovernanceHoldProposalInput => ({
  recordedAt: "2026-08-23T00:00:00.000Z",
  decision: { id: "decision_live", status: "APPROVED", outputHash: h("a"), evidenceSnapshotId: "snap_live", recommendation: { recommendation: "HOLD", actions: [], unresolvedDisagreements: 0, citationCoverage: { coverage: 1, materialClaims: 1, citedMaterialClaims: 1 }, assetExecutionAuthorized: false } },
  review: { id: "review_live", outcome: "APPROVED", outputHash: h("a"), actorType: "human" },
  snapshot: { id: "snap_live", manifestHash: h("b"), evidenceIds: ["ev_live"] },
  tenantCommitment: h("c"),
  chain: { chainId: 102031, blockNumber: 100, blockHash: h("d"), confirmations: 2 },
  contracts: addresses,
  readback: { allContractsHaveCode: true, guardPaused: true, guardGovernance: addresses.timelock, governorTimelock: addresses.timelock, proposalThreshold: "0", deployerVotes: "1000000" },
  simulation: { from: addresses.timelock, to: addresses.treasuryGuard, value: "0x0", data: guardData, callSucceeded: true, gasEstimate: "45000" },
});

describe("live governance HOLD proposal", () => {
  it("builds a deterministic zero-value Governor proposal that only maintains pause", () => {
    const first = buildLiveGovernanceHoldProposal(fixture());
    const second = buildLiveGovernanceHoldProposal(fixture());
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      status: "PROPOSAL_REQUEST_PREPARED",
      proposal: { proposalType: "SECURITY_HOLD", action: { paused: true, value: "0" }, semanticConsistencyVerified: true },
      simulation: { assetDelta: "NONE", assetExecutionAuthorized: false },
      unsignedTransaction: { chainId: 102031, value: "0x0" },
      controls: { signed: false, submitted: false, broadcastCapability: false, assetExecutionAuthorized: false },
      truthBoundary: { proposedEffect: "MAINTAIN_PAUSE", treasuryAssetMovement: false, onchainProposalCreated: false },
    });
  });
  it("requires an append-only human approval bound to the exact Decision output", () => {
    expect(() => buildLiveGovernanceHoldProposal({ ...fixture(), decision: { ...fixture().decision, status: "REVIEW_REQUIRED" } })).toThrow("GOVERNANCE_HOLD_HUMAN_APPROVAL_REQUIRED");
    expect(() => buildLiveGovernanceHoldProposal({ ...fixture(), review: { ...fixture().review, outputHash: h("e") } })).toThrow("GOVERNANCE_HOLD_HUMAN_APPROVAL_REQUIRED");
  });
  it("rejects action-bearing, uncited, unpaused or unsimulated inputs", () => {
    expect(() => buildLiveGovernanceHoldProposal({ ...fixture(), decision: { ...fixture().decision, recommendation: { ...fixture().decision.recommendation, actions: [{}] } } })).toThrow("GOVERNANCE_HOLD_DECISION_NOT_ELIGIBLE");
    expect(() => buildLiveGovernanceHoldProposal({ ...fixture(), snapshot: { ...fixture().snapshot, evidenceIds: [] } })).toThrow("GOVERNANCE_HOLD_EVIDENCE_LINEAGE_INVALID");
    expect(() => buildLiveGovernanceHoldProposal({ ...fixture(), readback: { ...fixture().readback, guardPaused: false } })).toThrow("GOVERNANCE_HOLD_CONTROL_READBACK_INVALID");
    expect(() => buildLiveGovernanceHoldProposal({ ...fixture(), simulation: { ...fixture().simulation, callSucceeded: false } })).toThrow("GOVERNANCE_HOLD_SIMULATION_INVALID");
  });
  it("creates a new proposal identity only from verified recovery lineage", () => {
    const first = buildLiveGovernanceHoldProposal(fixture());
    const retryInput = fixture();
    retryInput.readback.currentVotingPeriodBlocks = "240";
    retryInput.attempt = {
      attemptNumber: 2,
      previousProposalArtifactHash: h("e"),
      previousProposalId: first.proposal.proposalId,
      previousTransactionHash: h("f"),
      previousStatus: "PROPOSAL_DEFEATED",
      previousFailureReason: "NO_VOTES_BEFORE_DEADLINE",
      recoveryExecuteArtifactHash: h("1"),
      recoveryTransactionHash: h("2"),
      recoveryStatus: "RECOVERY_EXECUTED",
      recoveredVotingPeriodBlocks: 240,
    };
    const retry = buildLiveGovernanceHoldProposal(retryInput);
    expect(retry).toMatchObject({
      schemaVersion: "aeos.live-governance-hold-proposal.v2",
      lineage: { attempt: { attemptNumber: 2, recoveredVotingPeriodBlocks: 240 } },
      safetyReadback: { currentVotingPeriodBlocks: "240" },
    });
    expect(retry.proposal.proposalId).not.toBe(first.proposal.proposalId);
    expect(retry.proposal.description).toContain("Attempt identity:");
    expect(() => buildLiveGovernanceHoldProposal({ ...retryInput, readback: { ...retryInput.readback, currentVotingPeriodBlocks: "8" } })).toThrow("GOVERNANCE_HOLD_RETRY_LINEAGE_INVALID");
  });
});
