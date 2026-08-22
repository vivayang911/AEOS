import { MockGovernorAdapter, OpenZeppelinGovernorReadAdapter, createGovernanceAdapterFromEnvironment } from "./governance-adapter";

describe("Governance adapter authority boundary", () => {
  it("marks every Mock observation as non-final and non-executable", () => {
    const adapter = new MockGovernorAdapter();
    const observation = adapter.normalize({ state: "REVIEW", chainId: 11155111, governor: "0x1111111111111111111111111111111111111111", externalProposalId: "1", blockNumber: 10, blockHash: `0x${"22".repeat(32)}`, confirmations: 12, observedAt: "2026-01-01T00:00:00.000Z" });
    expect(observation).toEqual(expect.objectContaining({ mockOnly: true, onchainFinalityVerified: false, assetExecutionAuthorized: false }));
    expect(adapter.configuration()).toEqual(expect.objectContaining({ submitsProposals: false, signsTransactions: false, assetExecutionAuthorized: false }));
  });
  it("freezes complete Mock voting metadata while preserving its non-chain authority label", () => {
    const adapter = new MockGovernorAdapter();
    const observation = adapter.normalize({ state: "ACTIVE", chainId: 11155111, governor: "0x1111111111111111111111111111111111111111", externalProposalId: "1", blockNumber: 12, blockHash: `0x${"22".repeat(32)}`, confirmations: 3, observedAt: "2026-01-01T00:00:00.000Z", currentTimepoint: "12", voteStart: "10", voteEnd: "20", quorum: "100", againstVotes: "5", forVotes: "80", abstainVotes: "20", clockMode: "mode=blocknumber&from=default" });
    expect(observation.votingMetadata).toEqual(expect.objectContaining({ availability: "AVAILABLE", source: "MOCK_ONLY", displayedParticipation: "100", displayedParticipationFormula: "FOR_PLUS_ABSTAIN", quorumReachedByDisplayedParticipation: true, derivedLocally: true, onchainVerified: false }));
  });
  it("rejects partial or inverted Mock voting metadata", () => {
    const adapter = new MockGovernorAdapter(); const base = { state: "ACTIVE" as const, chainId: 11155111, governor: "0x1111111111111111111111111111111111111111", externalProposalId: "1", blockNumber: 12, blockHash: `0x${"22".repeat(32)}`, confirmations: 3, observedAt: "2026-01-01T00:00:00.000Z" };
    expect(() => adapter.normalize({ ...base, voteStart: "10" })).toThrow("MOCK_VOTING_METADATA_INCOMPLETE");
    expect(() => adapter.normalize({ ...base, currentTimepoint: "12", voteStart: "20", voteEnd: "10", quorum: "1", againstVotes: "0", forVotes: "1", abstainVotes: "0", clockMode: "mode=blocknumber" })).toThrow("VOTING_DEADLINE_BEFORE_SNAPSHOT");
  });
  it("fails closed for an unsupported real adapter configuration", () => {
    const previous = process.env.GOVERNANCE_ADAPTER; process.env.GOVERNANCE_ADAPTER = "real";
    expect(() => createGovernanceAdapterFromEnvironment()).toThrow("Unsupported GOVERNANCE_ADAPTER");
    if (previous === undefined) delete process.env.GOVERNANCE_ADAPTER; else process.env.GOVERNANCE_ADAPTER = previous;
  });
  it("exposes only read capabilities for a configured OpenZeppelin Governor", () => {
    const adapter = new OpenZeppelinGovernorReadAdapter("https://rpc.invalid", 11155111, "0x1111111111111111111111111111111111111111", 3, 2);
    expect(adapter.configuration()).toEqual(expect.objectContaining({ mode: "oz-readonly", readsState: true, readsVotingPeriod: true, readsQuorumAndVotes: true, submitsProposals: false, castsVotes: false, queuesProposals: false, executesProposals: false, signsTransactions: false, assetExecutionAuthorized: false, confirmationLag: 3 }));
    expect(() => adapter.normalize({} as any)).toThrow("Mock observations are disabled");
  });
  it("reads voting period, quorum, votes, and state at the same confirmed block", async () => {
    const adapter = new OpenZeppelinGovernorReadAdapter("https://rpc.invalid", 11155111, "0x1111111111111111111111111111111111111111", 3, 2) as any;
    adapter.rpc = { getNetwork: jest.fn().mockResolvedValue({ chainId: 11155111n }), getBlockNumber: jest.fn().mockResolvedValue(103), getBlock: jest.fn().mockResolvedValue({ hash: `0x${"33".repeat(32)}`, timestamp: 1_767_225_600 }) };
    const call = (value: unknown) => ({ staticCall: jest.fn().mockResolvedValue(value) });
    adapter.governor = { state: call(1n), proposalSnapshot: call(90n), proposalDeadline: call(120n), clock: call(100n), CLOCK_MODE: call("mode=blocknumber&from=default"), proposalVotes: call([5n,80n,20n]), quorum: call(100n) };
    const result = await adapter.readProposal({ governor: { proposalId: "123" } });
    expect(result).toEqual(expect.objectContaining({ state: "ACTIVE", blockNumber: 100, onchainFinalityVerified: true, assetExecutionAuthorized: false, votingMetadata: expect.objectContaining({ source: "CONFIRMED_RPC_READ", voteStart: "90", voteEnd: "120", quorum: "100", displayedParticipation: "100", quorumReachedByDisplayedParticipation: true, derivedLocally: true, onchainVerified: true }) }));
    expect(adapter.governor.quorum.staticCall).toHaveBeenCalledWith(90n, { blockTag: 100 });
  });
  it("does not fabricate quorum before the proposal snapshot", async () => {
    const adapter = new OpenZeppelinGovernorReadAdapter("https://rpc.invalid", 11155111, "0x1111111111111111111111111111111111111111", 3, 2) as any;
    adapter.rpc = { getNetwork: jest.fn().mockResolvedValue({ chainId: 11155111n }), getBlockNumber: jest.fn().mockResolvedValue(103), getBlock: jest.fn().mockResolvedValue({ hash: `0x${"33".repeat(32)}`, timestamp: 1_767_225_600 }) };
    const call = (value: unknown) => ({ staticCall: jest.fn().mockResolvedValue(value) }); const quorum = call(100n);
    adapter.governor = { state: call(0n), proposalSnapshot: call(110n), proposalDeadline: call(140n), clock: call(100n), CLOCK_MODE: call("mode=blocknumber&from=default"), proposalVotes: call([0n,0n,0n]), quorum };
    const result = await adapter.readProposal({ governor: { proposalId: "123" } });
    expect(result.votingMetadata).toEqual(expect.objectContaining({ availability: "PENDING_SNAPSHOT", quorum: null, quorumReachedByDisplayedParticipation: null }));
    expect(quorum.staticCall).not.toHaveBeenCalled();
  });
});
