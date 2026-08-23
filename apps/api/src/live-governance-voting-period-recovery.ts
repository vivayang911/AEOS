import { Interface, getAddress, keccak256 } from "ethers";
import { hashValue } from "./decision-engine";
import { buildGovernorProposalIdentity } from "./proposal-engine";

const governorInterface = new Interface([
  "function propose(address[] targets,uint256[] values,bytes[] calldatas,string description) returns(uint256)",
  "function castVote(uint256 proposalId,uint8 support) returns(uint256)",
  "function setVotingPeriod(uint32 newVotingPeriod)",
]);
const fail = (code: string): never => { throw new Error(code); };

export type VotingPeriodRecoveryInput = {
  recordedAt: string;
  chain: { chainId: number; blockNumber: number; blockHash: string; confirmations: number };
  governor: string;
  voter: string;
  failedProposal: {
    status: string;
    proposalCreationVerified: boolean;
    failureReason: string | null;
    transactionHash: string;
    proposalArtifactHash: string;
    proposalId: string;
    governance: { state: string; votes: { against: string; for: string; abstain: string }; totalVotes: string };
    truthBoundary: { fullGovernanceLifecycleComplete: boolean };
  };
  voting: {
    clockMode: string;
    currentVotingDelayBlocks: string;
    currentVotingPeriodBlocks: string;
    targetVotingPeriodBlocks: number;
    quorumNumerator: string;
    quorumDenominator: string;
    quorumVotes: string;
    voterVotes: string;
    voterDelegate: string;
  };
  humanDirectiveApproved: true;
};

export function buildVotingPeriodRecovery(input: VotingPeriodRecoveryInput) {
  if (!Number.isFinite(Date.parse(input.recordedAt))) fail("GOVERNANCE_RECOVERY_RECORDED_AT_INVALID");
  if (input.chain.chainId !== 102031 || input.chain.blockNumber <= 0 || input.chain.confirmations < 2 || !/^0x[0-9a-f]{64}$/i.test(input.chain.blockHash)) fail("GOVERNANCE_RECOVERY_CHAIN_INVALID");
  const governor = getAddress(input.governor).toLowerCase();
  const voter = getAddress(input.voter).toLowerCase();
  const failed = input.failedProposal;
  if (failed.status !== "PROPOSAL_DEFEATED" || !failed.proposalCreationVerified || failed.failureReason !== "NO_VOTES_BEFORE_DEADLINE" || failed.governance.state !== "Defeated" || failed.governance.totalVotes !== "0" || failed.truthBoundary.fullGovernanceLifecycleComplete !== false) fail("GOVERNANCE_RECOVERY_FAILURE_LINEAGE_INVALID");
  if (![failed.transactionHash, failed.proposalArtifactHash].every((value) => /^0x[0-9a-f]{64}$/i.test(value)) || !/^[1-9][0-9]*$/.test(failed.proposalId)) fail("GOVERNANCE_RECOVERY_FAILURE_IDENTITY_INVALID");
  const voting = input.voting;
  if (voting.clockMode !== "mode=blocknumber&from=default" || voting.currentVotingDelayBlocks !== "1" || voting.currentVotingPeriodBlocks !== "8") fail("GOVERNANCE_RECOVERY_SETTINGS_MISMATCH");
  if (!Number.isInteger(voting.targetVotingPeriodBlocks) || voting.targetVotingPeriodBlocks < 120 || voting.targetVotingPeriodBlocks > 7200) fail("GOVERNANCE_RECOVERY_TARGET_PERIOD_INVALID");
  if (voting.quorumNumerator !== "4" || voting.quorumDenominator !== "100") fail("GOVERNANCE_RECOVERY_QUORUM_CONFIGURATION_INVALID");
  if (BigInt(voting.voterVotes) < BigInt(voting.quorumVotes) || BigInt(voting.quorumVotes) <= 0n || getAddress(voting.voterDelegate).toLowerCase() !== voter) fail("GOVERNANCE_RECOVERY_VOTING_CAPACITY_INSUFFICIENT");
  if (input.humanDirectiveApproved !== true) fail("GOVERNANCE_RECOVERY_HUMAN_DIRECTIVE_REQUIRED");

  const actionCalldata = governorInterface.encodeFunctionData("setVotingPeriod", [voting.targetVotingPeriodBlocks]);
  const title = "Extend Creditcoin testnet voting period for human-operable governance";
  const description = [
    title,
    "",
    `Failed proposal ID: ${failed.proposalId}`,
    `Failed proposal transaction: ${failed.transactionHash}`,
    `Failed proposal artifact: ${failed.proposalArtifactHash}`,
    "Observed failure: NO_VOTES_BEFORE_DEADLINE",
    `Current voting period: ${voting.currentVotingPeriodBlocks} blocks`,
    `New voting period: ${voting.targetVotingPeriodBlocks} blocks`,
    "Scope: TESTNET_DEMO_ONLY",
    "Native value: 0",
    "This proposal changes only Governor voting-period configuration and moves no treasury assets.",
  ].join("\n");
  const targets = [governor];
  const values = ["0"];
  const calldatas = [actionCalldata];
  const identity = buildGovernorProposalIdentity(targets, values, calldatas, description);
  const proposeData = governorInterface.encodeFunctionData("propose", [targets, [0n], calldatas, description]);
  const voteData = governorInterface.encodeFunctionData("castVote", [identity.proposalId, 1]);
  const core = {
    schemaVersion: "aeos.live-governance-voting-period-recovery.v1",
    status: "RECOVERY_PROPOSAL_PREPARED",
    recordedAt: new Date(input.recordedAt).toISOString(),
    chain: input.chain,
    failedProposal: {
      transactionHash: failed.transactionHash,
      proposalArtifactHash: failed.proposalArtifactHash,
      proposalId: failed.proposalId,
      state: failed.governance.state,
      failureReason: failed.failureReason,
      totalVotes: failed.governance.totalVotes,
    },
    votingCapacity: {
      clockMode: voting.clockMode,
      quorumNumerator: voting.quorumNumerator,
      quorumDenominator: voting.quorumDenominator,
      quorumVotes: voting.quorumVotes,
      voterVotes: voting.voterVotes,
      voterDelegate: voter,
      singleWalletMeetsQuorum: true,
      additionalVotingAddressesRequired: false,
    },
    proposal: {
      proposalType: "TESTNET_GOVERNANCE_SETTINGS_RECOVERY" as const,
      description,
      descriptionHash: identity.descriptionHash,
      proposalId: identity.proposalId,
      proposalIdHex: identity.proposalIdHex,
      targets,
      values,
      calldatas,
      action: { function: "setVotingPeriod(uint32)", previousVotingPeriodBlocks: 8, newVotingPeriodBlocks: voting.targetVotingPeriodBlocks },
    },
    unsignedRequests: {
      propose: { chainId: input.chain.chainId, from: voter, to: governor, value: "0x0" as const, data: proposeData, dataHash: keccak256(proposeData) },
      voteFor: { chainId: input.chain.chainId, from: voter, to: governor, value: "0x0" as const, data: voteData, dataHash: keccak256(voteData), support: 1, validOnlyWhenProposalState: "Active" as const },
    },
    controls: {
      testnetDemoOnly: true,
      requiresTwoSeparateWalletConfirmations: true,
      signed: false,
      submitted: false,
      voteSubmitted: false,
      privateKeyReceived: false,
      signerCustody: false,
      broadcastCapability: false,
      treasuryAssetMovement: false,
      assetExecutionAuthorized: false,
    },
  };
  return { ...core, artifactHash: hashValue(core) };
}
