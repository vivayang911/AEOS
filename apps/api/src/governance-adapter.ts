import { MockGovernanceObservationDto } from "./governance.dto";
import { Contract, JsonRpcProvider, getAddress } from "ethers";
import { GovernanceState } from "./governance-engine";

export const GOVERNANCE_ADAPTER = Symbol("GOVERNANCE_ADAPTER");
export interface GovernanceObservationAdapter { readonly mode: "mock"|"oz-readonly"; readonly provider: string; configuration(): Record<string, unknown>; normalize(input: MockGovernanceObservationDto): Record<string, unknown>; readProposal?(proposalContent: any): Promise<Record<string, unknown>>; }

const votingFields = ["currentTimepoint","voteStart","voteEnd","quorum","againstVotes","forVotes","abstainVotes","clockMode"] as const;
function votingMetadata(input: MockGovernanceObservationDto) {
  const present = votingFields.filter((field) => input[field] !== undefined);
  if (!present.length) return { schemaVersion: "governance.voting-metadata.v1", availability: "MOCK_NOT_PROVIDED", source: "MOCK_ONLY", quorumReachedByDisplayedParticipation: null };
  if (present.length !== votingFields.length) throw new Error("MOCK_VOTING_METADATA_INCOMPLETE");
  const start = BigInt(input.voteStart!); const end = BigInt(input.voteEnd!);
  if (end < start) throw new Error("VOTING_DEADLINE_BEFORE_SNAPSHOT");
  const participation = BigInt(input.forVotes!) + BigInt(input.abstainVotes!);
  return { schemaVersion: "governance.voting-metadata.v1", availability: "AVAILABLE", source: "MOCK_ONLY", clockMode: input.clockMode, currentTimepoint: input.currentTimepoint, voteStart: input.voteStart, voteEnd: input.voteEnd, quorum: input.quorum, againstVotes: input.againstVotes, forVotes: input.forVotes, abstainVotes: input.abstainVotes, displayedParticipation: participation.toString(), displayedParticipationFormula: "FOR_PLUS_ABSTAIN", quorumReachedByDisplayedParticipation: participation >= BigInt(input.quorum!), derivedLocally: true, onchainVerified: false };
}

export class MockGovernorAdapter implements GovernanceObservationAdapter {
  readonly mode = "mock" as const; readonly provider = "mock-governor-v1";
  configuration() { return { mode: this.mode, provider: this.provider, submitsProposals: false, signsTransactions: false, assetExecutionAuthorized: false, finalitySource: "MOCK_ONLY", warning: "Mock observations never prove on-chain governance authorization" }; }
  normalize(input: MockGovernanceObservationDto) { return { state: input.state, chainId: input.chainId, governor: input.governor.toLowerCase(), externalProposalId: input.externalProposalId, blockNumber: input.blockNumber, blockHash: input.blockHash.toLowerCase(), confirmations: input.confirmations, observedAt: new Date(input.observedAt).toISOString(), isReorg: input.isReorg ?? false, reorgOfObservationId: input.reorgOfObservationId ?? null, votingMetadata: votingMetadata(input), mockOnly: true, onchainFinalityVerified: false, assetExecutionAuthorized: false }; }
}

const governorState: Record<number, GovernanceState> = { 0: "PENDING", 1: "ACTIVE", 2: "CANCELED", 3: "DEFEATED", 4: "SUCCEEDED", 5: "QUEUED", 6: "EXPIRED", 7: "EXECUTED" };
export class OpenZeppelinGovernorReadAdapter implements GovernanceObservationAdapter {
  readonly mode = "oz-readonly" as const; readonly provider = "openzeppelin-governor-readonly-v1";
  private readonly rpc: JsonRpcProvider; private readonly governor: Contract;
  constructor(rpcUrl: string, readonly chainId: number, readonly governorAddress: string, readonly confirmationLag = 2, readonly minimumConfirmations = 2) {
    if (!rpcUrl || !Number.isInteger(chainId) || chainId <= 0) throw new Error("GOVERNANCE_RPC_URL and GOVERNANCE_CHAIN_ID are required");
    if (!Number.isInteger(confirmationLag) || confirmationLag < minimumConfirmations || minimumConfirmations < 1) throw new Error("GOVERNANCE_CONFIRMATION_LAG must satisfy the minimum confirmation policy");
    this.governorAddress = getAddress(governorAddress).toLowerCase();
    this.rpc = new JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true });
    this.governor = new Contract(this.governorAddress, ["function state(uint256 proposalId) view returns (uint8)","function proposalSnapshot(uint256 proposalId) view returns (uint256)","function proposalDeadline(uint256 proposalId) view returns (uint256)","function quorum(uint256 timepoint) view returns (uint256)","function proposalVotes(uint256 proposalId) view returns (uint256 againstVotes,uint256 forVotes,uint256 abstainVotes)","function clock() view returns (uint48)","function CLOCK_MODE() view returns (string)"], this.rpc);
  }
  configuration() { return { mode: this.mode, provider: this.provider, chainId: this.chainId, governor: this.governorAddress, confirmationLag: this.confirmationLag, minimumConfirmations: this.minimumConfirmations, readsState: true, readsVotingPeriod: true, readsQuorumAndVotes: true, submitsProposals: false, castsVotes: false, queuesProposals: false, executesProposals: false, signsTransactions: false, assetExecutionAuthorized: false, finalitySource: "CONFIRMED_RPC_READ" }; }
  normalize(_input: MockGovernanceObservationDto): Record<string, unknown> { throw new Error("Mock observations are disabled when GOVERNANCE_ADAPTER=oz-readonly"); }
  async readProposal(proposalContent: any) {
    const externalProposalId = proposalContent?.governor?.proposalId;
    if (typeof externalProposalId !== "string" || !/^[0-9]+$/.test(externalProposalId)) throw new Error("PROPOSAL_HAS_NO_GOVERNOR_IDENTITY");
    const [network, latestNumber] = await Promise.all([this.rpc.getNetwork(), this.rpc.getBlockNumber()]);
    if (Number(network.chainId) !== this.chainId) throw new Error("GOVERNANCE_CHAIN_MISMATCH");
    const safeNumber = latestNumber - this.confirmationLag; if (safeNumber < 0) throw new Error("GOVERNANCE_CHAIN_NOT_CONFIRMED");
    const block = await this.rpc.getBlock(safeNumber); if (!block?.hash) throw new Error("GOVERNANCE_SAFE_BLOCK_NOT_FOUND");
    const proposalKey = BigInt(externalProposalId); const callOptions = { blockTag: safeNumber };
    const rawState = Number(await this.governor.state.staticCall(proposalKey, callOptions));
    const state = governorState[rawState]; if (!state) throw new Error("UNSUPPORTED_GOVERNOR_STATE");
    let voting;
    try {
      const [snapshotValue, deadlineValue, currentValue, clockModeValue, votesValue] = await Promise.all([this.governor.proposalSnapshot.staticCall(proposalKey, callOptions), this.governor.proposalDeadline.staticCall(proposalKey, callOptions), this.governor.clock.staticCall(callOptions), this.governor.CLOCK_MODE.staticCall(callOptions), this.governor.proposalVotes.staticCall(proposalKey, callOptions)]);
      const snapshot = BigInt(snapshotValue); const deadline = BigInt(deadlineValue); const current = BigInt(currentValue);
      if (deadline < snapshot) throw new Error("VOTING_DEADLINE_BEFORE_SNAPSHOT");
      const againstVotes = BigInt(votesValue[0]); const forVotes = BigInt(votesValue[1]); const abstainVotes = BigInt(votesValue[2]); const participation = forVotes + abstainVotes;
      if (snapshot > current) voting = { schemaVersion: "governance.voting-metadata.v1", availability: "PENDING_SNAPSHOT", source: "CONFIRMED_RPC_READ", clockMode: String(clockModeValue), currentTimepoint: current.toString(), voteStart: snapshot.toString(), voteEnd: deadline.toString(), quorum: null, againstVotes: againstVotes.toString(), forVotes: forVotes.toString(), abstainVotes: abstainVotes.toString(), displayedParticipation: participation.toString(), displayedParticipationFormula: "FOR_PLUS_ABSTAIN", quorumReachedByDisplayedParticipation: null, derivedLocally: true, onchainVerified: true };
      else { const quorum = BigInt(await this.governor.quorum.staticCall(snapshot, callOptions)); voting = { schemaVersion: "governance.voting-metadata.v1", availability: "AVAILABLE", source: "CONFIRMED_RPC_READ", clockMode: String(clockModeValue), currentTimepoint: current.toString(), voteStart: snapshot.toString(), voteEnd: deadline.toString(), quorum: quorum.toString(), againstVotes: againstVotes.toString(), forVotes: forVotes.toString(), abstainVotes: abstainVotes.toString(), displayedParticipation: participation.toString(), displayedParticipationFormula: "FOR_PLUS_ABSTAIN", quorumReachedByDisplayedParticipation: participation >= quorum, derivedLocally: true, onchainVerified: true }; }
    } catch (error) { if (error instanceof Error && error.message === "VOTING_DEADLINE_BEFORE_SNAPSHOT") throw error; throw new Error("GOVERNOR_VOTING_METADATA_UNAVAILABLE"); }
    return { state, chainId: this.chainId, governor: this.governorAddress, externalProposalId, blockNumber: safeNumber, blockHash: block.hash.toLowerCase(), confirmations: this.confirmationLag, observedAt: new Date(block.timestamp * 1000).toISOString(), isReorg: false, reorgOfObservationId: null, votingMetadata: voting, mockOnly: false, onchainFinalityVerified: true, assetExecutionAuthorized: false };
  }
}

export function createGovernanceAdapterFromEnvironment(): GovernanceObservationAdapter {
  const mode = (process.env.GOVERNANCE_ADAPTER ?? "mock").toLowerCase(); if (mode === "mock") return new MockGovernorAdapter();
  if (mode === "oz-readonly") return new OpenZeppelinGovernorReadAdapter(process.env.GOVERNANCE_RPC_URL ?? "", Number(process.env.GOVERNANCE_CHAIN_ID), process.env.GOVERNOR_ADDRESS ?? "", Number(process.env.GOVERNANCE_CONFIRMATION_LAG ?? 2), Number(process.env.GOVERNANCE_MIN_CONFIRMATIONS ?? 2));
  throw new Error(`Unsupported GOVERNANCE_ADAPTER: ${mode}`);
}
