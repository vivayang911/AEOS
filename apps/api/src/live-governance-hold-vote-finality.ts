import { Interface, getAddress, keccak256 } from "ethers";
import { hashValue } from "./decision-engine";

const governorInterface = new Interface([
  "function queue(address[] targets,uint256[] values,bytes[] calldatas,bytes32 descriptionHash) returns(uint256)",
]);
const fail = (code: string): never => { throw new Error(code); };
const lower = (value: string) => value.toLowerCase();

type Request = { chainId: number; from: string; to: string; value: "0x0"; data: string; dataHash: string };
type TransactionObservation = { hash: string; from: string; to: string; value: string; data: string; status: number; blockNumber: number; blockHash: string; canonicalBlockHash: string; canonicalTransactionHashes: string[] };

export type HoldProposalForQueue = {
  artifactHash: string;
  lineage: { attempt: { attemptNumber: number; attemptIdentity: string } };
  proposal: { proposalId: string; descriptionHash: string; targets: string[]; values: string[]; calldatas: string[]; action: { function: string; paused: boolean; target: string; value: string } };
  unsignedTransaction: Request;
};

export type HoldVoteArtifactForFinality = {
  artifactHash: string;
  lineage: { proposalArtifactHash: string; proposalId: string; attemptNumber: number; attemptIdentity: string };
  votingCapacity: { voterVotes: string; quorumVotes: string; voter: string };
  unsignedTransaction: Request & { support: number };
};

export type HoldVoteChainObservation = {
  chainId: number;
  latestBlock: number;
  voteTransaction: TransactionObservation;
  voteEvent: { address: string; voter: string; proposalId: string; support: number; weight: string; reason: string };
  governance: { state: number; snapshot: string; deadline: string; quorum: string; againstVotes: string; forVotes: string; abstainVotes: string; proposalNeedsQueuing: boolean; hasVoted: boolean; currentVotingPeriodBlocks: string };
};

export function verifyDecisionBoundHoldVoteFinality(
  proposal: HoldProposalForQueue,
  vote: HoldVoteArtifactForFinality,
  observed: HoldVoteChainObservation,
) {
  if (
    proposal.lineage.attempt.attemptNumber < 2
    || vote.lineage.attemptNumber !== proposal.lineage.attempt.attemptNumber
    || vote.lineage.attemptIdentity !== proposal.lineage.attempt.attemptIdentity
    || vote.lineage.proposalArtifactHash !== proposal.artifactHash
    || vote.lineage.proposalId !== proposal.proposal.proposalId
  ) fail("GOVERNANCE_HOLD_VOTE_LINEAGE_INVALID");
  if (observed.chainId !== vote.unsignedTransaction.chainId || observed.latestBlock < observed.voteTransaction.blockNumber) fail("GOVERNANCE_HOLD_VOTE_CHAIN_INVALID");
  const tx = observed.voteTransaction;
  const request = vote.unsignedTransaction;
  if (
    tx.status !== 1
    || getAddress(tx.from).toLowerCase() !== getAddress(request.from).toLowerCase()
    || getAddress(tx.to).toLowerCase() !== getAddress(request.to).toLowerCase()
    || BigInt(tx.value) !== 0n
    || lower(tx.data) !== lower(request.data)
    || lower(keccak256(tx.data)) !== lower(request.dataHash)
  ) fail("GOVERNANCE_HOLD_VOTE_TRANSACTION_MISMATCH");
  if (lower(tx.blockHash) !== lower(tx.canonicalBlockHash) || !tx.canonicalTransactionHashes.some((hash) => lower(hash) === lower(tx.hash))) fail("GOVERNANCE_HOLD_VOTE_NON_CANONICAL");
  const event = observed.voteEvent;
  if (
    getAddress(event.address).toLowerCase() !== getAddress(request.to).toLowerCase()
    || getAddress(event.voter).toLowerCase() !== getAddress(request.from).toLowerCase()
    || event.proposalId !== proposal.proposal.proposalId
    || event.support !== 1
    || request.support !== 1
    || event.weight !== vote.votingCapacity.voterVotes
    || event.reason !== ""
  ) fail("GOVERNANCE_HOLD_VOTE_EVENT_INVALID");
  const governance = observed.governance;
  const stateValid = governance.state === 1 || governance.state === 4;
  if (
    !stateValid
    || governance.currentVotingPeriodBlocks !== "240"
    || governance.quorum !== vote.votingCapacity.quorumVotes
    || governance.againstVotes !== "0"
    || governance.forVotes !== vote.votingCapacity.voterVotes
    || governance.abstainVotes !== "0"
    || BigInt(governance.forVotes) < BigInt(governance.quorum)
    || !governance.hasVoted
  ) fail("GOVERNANCE_HOLD_VOTE_OR_QUORUM_INVALID");
  const succeeded = governance.state === 4;
  if (succeeded && !governance.proposalNeedsQueuing) fail("GOVERNANCE_HOLD_QUEUE_READINESS_INVALID");
  return {
    schemaVersion: "aeos.live-governance-hold-vote-finality.v1",
    status: succeeded ? "HOLD_VOTE_SUCCEEDED" : "HOLD_VOTE_CAST_QUORUM_MET_WINDOW_ACTIVE",
    proposalArtifactHash: proposal.artifactHash,
    voteArtifactHash: vote.artifactHash,
    proposalId: proposal.proposal.proposalId,
    attemptNumber: vote.lineage.attemptNumber,
    chainId: observed.chainId,
    voteTransaction: { hash: tx.hash, blockNumber: tx.blockNumber, blockHash: tx.blockHash, confirmations: observed.latestBlock - tx.blockNumber + 1 },
    governance: {
      state: succeeded ? "Succeeded" : "Active",
      snapshot: governance.snapshot,
      deadline: governance.deadline,
      quorum: governance.quorum,
      votes: { against: governance.againstVotes, for: governance.forVotes, abstain: governance.abstainVotes },
      quorumMet: true,
      proposalNeedsQueuing: governance.proposalNeedsQueuing,
      blocksRemaining: Math.max(0, Number(governance.deadline) - observed.latestBlock),
    },
    checks: { exactVoteTransaction: true, canonicalInclusion: true, exactVoteCastEvent: true, quorumMet: true, hasVoted: true },
    controls: { privateKeyReceived: false, signerCustody: false, broadcastCapability: false, assetExecutionAuthorized: false },
  };
}

export function buildDecisionBoundHoldQueue(
  proposal: HoldProposalForQueue,
  finality: ReturnType<typeof verifyDecisionBoundHoldVoteFinality>,
  recordedAt: string,
) {
  if (
    !Number.isFinite(Date.parse(recordedAt))
    || finality.status !== "HOLD_VOTE_SUCCEEDED"
    || finality.proposalArtifactHash !== proposal.artifactHash
    || finality.proposalId !== proposal.proposal.proposalId
    || !finality.governance.quorumMet
    || !finality.governance.proposalNeedsQueuing
  ) fail("GOVERNANCE_HOLD_QUEUE_LINEAGE_INVALID");
  const data = governorInterface.encodeFunctionData("queue", [proposal.proposal.targets, proposal.proposal.values.map(BigInt), proposal.proposal.calldatas, proposal.proposal.descriptionHash]);
  const request = proposal.unsignedTransaction;
  const core = {
    schemaVersion: "aeos.live-governance-hold-queue.v1",
    status: "HOLD_QUEUE_REQUEST_PREPARED",
    recordedAt: new Date(recordedAt).toISOString(),
    lineage: { proposalArtifactHash: proposal.artifactHash, voteFinalityStatus: finality.status, proposalId: proposal.proposal.proposalId, attemptNumber: finality.attemptNumber, voteTransactionHash: finality.voteTransaction.hash },
    proposal: { targets: proposal.proposal.targets, values: proposal.proposal.values, calldatas: proposal.proposal.calldatas, descriptionHash: proposal.proposal.descriptionHash, action: proposal.proposal.action },
    unsignedTransaction: { chainId: request.chainId, from: request.from, to: request.to, value: "0x0" as const, data, dataHash: keccak256(data) },
    controls: { requiresUserWalletConfirmation: true, signed: false, submitted: false, privateKeyReceived: false, signerCustody: false, broadcastCapability: false, treasuryAssetMovement: false, assetExecutionAuthorized: false },
  };
  return { ...core, artifactHash: hashValue(core) };
}
