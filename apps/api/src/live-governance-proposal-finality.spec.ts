import { verifyLiveGovernanceProposalFinality, FrozenGovernanceProposal, GovernanceProposalChainObservation } from "./live-governance-proposal-finality";

const h = (c: string) => `0x${c.repeat(64)}`;
const frozen: FrozenGovernanceProposal = {
  artifactHash: h("a"),
  contracts: { governor: "0x1111111111111111111111111111111111111111" },
  proposal: { proposalId: "123", description: "HOLD", targets: ["0x2222222222222222222222222222222222222222"], values: ["0"], calldatas: ["0x1234"] },
  unsignedTransaction: { chainId: 102031, from: "0x3333333333333333333333333333333333333333", to: "0x1111111111111111111111111111111111111111", value: "0x0", data: "0x1234", dataHash: "0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432" },
};
const observation = (): GovernanceProposalChainObservation => ({
  transactionHash: h("b"), chainId: 102031, from: frozen.unsignedTransaction.from, to: frozen.unsignedTransaction.to, value: "0", data: "0x1234", receiptStatus: 1,
  blockNumber: 100, blockHash: h("c"), canonicalBlockHash: h("c"), canonicalTransactionHashes: [h("b")], latestBlock: 120,
  event: { address: frozen.contracts.governor, name: "ProposalCreated", proposalId: "123", proposer: frozen.unsignedTransaction.from, targets: frozen.proposal.targets, values: ["0"], signatures: [""], calldatas: ["0x1234"], voteStart: "101", voteEnd: "109", description: "HOLD" },
  state: 3, proposalSnapshot: "101", proposalDeadline: "109", votes: { against: "0", for: "0", abstain: "0" },
});

describe("live governance proposal finality", () => {
  it("separates successful ProposalCreated finality from a defeated lifecycle", () => {
    expect(verifyLiveGovernanceProposalFinality(frozen, observation())).toMatchObject({
      status: "PROPOSAL_DEFEATED", proposalCreationVerified: true, lifecyclePassed: false, failureReason: "NO_VOTES_BEFORE_DEADLINE",
      governance: { state: "Defeated", totalVotes: "0" }, controls: { assetExecutionAuthorized: false },
    });
  });
  it("recognizes a succeeded proposal without authorizing execution", () => {
    const value = observation(); value.state = 4; value.votes.for = "100";
    expect(verifyLiveGovernanceProposalFinality(frozen, value)).toMatchObject({ status: "PROPOSAL_LIFECYCLE_PASSED", lifecyclePassed: true, controls: { broadcastCapability: false } });
  });
  it("rejects mismatched calldata and non-canonical inclusion", () => {
    expect(() => verifyLiveGovernanceProposalFinality(frozen, { ...observation(), data: "0xabcd" })).toThrow("GOVERNANCE_PROPOSAL_CALLDATA_MISMATCH");
    expect(() => verifyLiveGovernanceProposalFinality(frozen, { ...observation(), canonicalTransactionHashes: [] })).toThrow("GOVERNANCE_PROPOSAL_NOT_IN_CANONICAL_BLOCK");
  });
});
