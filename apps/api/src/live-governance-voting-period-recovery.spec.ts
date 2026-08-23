import { Interface } from "ethers";
import { buildVotingPeriodRecovery, VotingPeriodRecoveryInput } from "./live-governance-voting-period-recovery";

const h = (c: string) => `0x${c.repeat(64)}`;
const input = (): VotingPeriodRecoveryInput => ({
  recordedAt: "2026-08-23T00:00:00.000Z",
  chain: { chainId: 102031, blockNumber: 100, blockHash: h("a"), confirmations: 2 },
  governor: "0x1111111111111111111111111111111111111111",
  voter: "0x2222222222222222222222222222222222222222",
  failedProposal: { status: "PROPOSAL_DEFEATED", proposalCreationVerified: true, failureReason: "NO_VOTES_BEFORE_DEADLINE", transactionHash: h("b"), proposalArtifactHash: h("c"), proposalId: "123", governance: { state: "Defeated", votes: { against: "0", for: "0", abstain: "0" }, totalVotes: "0" }, truthBoundary: { fullGovernanceLifecycleComplete: false } },
  voting: { clockMode: "mode=blocknumber&from=default", currentVotingDelayBlocks: "1", currentVotingPeriodBlocks: "8", targetVotingPeriodBlocks: 240, quorumNumerator: "4", quorumDenominator: "100", quorumVotes: "40000", voterVotes: "1000000", voterDelegate: "0x2222222222222222222222222222222222222222" },
  humanDirectiveApproved: true,
});

describe("live governance voting-period recovery", () => {
  it("builds deterministic separate zero-value propose and For-vote requests", () => {
    const result = buildVotingPeriodRecovery(input());
    expect(result).toEqual(buildVotingPeriodRecovery(input()));
    expect(result).toMatchObject({ status: "RECOVERY_PROPOSAL_PREPARED", votingCapacity: { singleWalletMeetsQuorum: true, additionalVotingAddressesRequired: false }, controls: { requiresTwoSeparateWalletConfirmations: true, broadcastCapability: false, assetExecutionAuthorized: false } });
    const iface = new Interface(["function setVotingPeriod(uint32)", "function castVote(uint256,uint8)"]);
    expect(iface.decodeFunctionData("setVotingPeriod", result.proposal.calldatas[0])[0]).toBe(240n);
    expect(iface.decodeFunctionData("castVote", result.unsignedRequests.voteFor.data)[1]).toBe(1n);
  });
  it("rejects insufficient voting power and non-human-operable target periods", () => {
    expect(() => buildVotingPeriodRecovery({ ...input(), voting: { ...input().voting, voterVotes: "39999" } })).toThrow("GOVERNANCE_RECOVERY_VOTING_CAPACITY_INSUFFICIENT");
    expect(() => buildVotingPeriodRecovery({ ...input(), voting: { ...input().voting, targetVotingPeriodBlocks: 20 } })).toThrow("GOVERNANCE_RECOVERY_TARGET_PERIOD_INVALID");
  });
  it("requires exact defeated zero-vote lineage and explicit human direction", () => {
    expect(() => buildVotingPeriodRecovery({ ...input(), failedProposal: { ...input().failedProposal, failureReason: null } })).toThrow("GOVERNANCE_RECOVERY_FAILURE_LINEAGE_INVALID");
    expect(() => buildVotingPeriodRecovery({ ...input(), humanDirectiveApproved: false as true })).toThrow("GOVERNANCE_RECOVERY_HUMAN_DIRECTIVE_REQUIRED");
  });
});
