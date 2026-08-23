import { Interface, getAddress, keccak256 } from "ethers";
import { hashValue } from "./decision-engine";

const governorInterface = new Interface([
  "function queue(address[] targets,uint256[] values,bytes[] calldatas,bytes32 descriptionHash) returns(uint256)",
]);
const fail = (code: string): never => { throw new Error(code); };
const lower = (value: string) => value.toLowerCase();

type Request = { chainId: number; from: string; to: string; value: "0x0"; data: string; dataHash: string };
export type RecoveryArtifact = {
  artifactHash: string;
  proposal: { proposalId: string; description: string; descriptionHash: string; targets: string[]; values: string[]; calldatas: string[]; action: { previousVotingPeriodBlocks: number; newVotingPeriodBlocks: number } };
  votingCapacity: { quorumVotes: string; voterVotes: string; voterDelegate: string; singleWalletMeetsQuorum: boolean };
  unsignedRequests: { propose: Request; voteFor: Request & { support: number } };
};
type TransactionObservation = { hash: string; from: string; to: string; value: string; data: string; status: number; blockNumber: number; blockHash: string; canonicalBlockHash: string; canonicalTransactionHashes: string[] };
export type RecoveryChainObservation = {
  chainId: number; latestBlock: number;
  proposalTransaction: TransactionObservation; voteTransaction: TransactionObservation;
  proposalEvent: { address: string; proposalId: string; proposer: string; targets: string[]; values: string[]; signatures: string[]; calldatas: string[]; voteStart: string; voteEnd: string; description: string };
  voteEvent: { address: string; voter: string; proposalId: string; support: number; weight: string; reason: string };
  governance: { state: number; snapshot: string; deadline: string; quorum: string; againstVotes: string; forVotes: string; abstainVotes: string; proposalNeedsQueuing: boolean; currentVotingPeriodBlocks: string };
};

function verifyTransaction(request: Request, observed: TransactionObservation, code: string) {
  if (observed.status !== 1 || getAddress(observed.from).toLowerCase() !== getAddress(request.from).toLowerCase() || getAddress(observed.to).toLowerCase() !== getAddress(request.to).toLowerCase() || BigInt(observed.value) !== 0n || lower(observed.data) !== lower(request.data) || lower(keccak256(observed.data)) !== lower(request.dataHash)) fail(`${code}_TRANSACTION_MISMATCH`);
  if (lower(observed.blockHash) !== lower(observed.canonicalBlockHash) || !observed.canonicalTransactionHashes.some((hash) => lower(hash) === lower(observed.hash))) fail(`${code}_NON_CANONICAL`);
}

export function verifyVotingPeriodRecoveryFinality(frozen: RecoveryArtifact, observed: RecoveryChainObservation) {
  if (observed.chainId !== frozen.unsignedRequests.propose.chainId || observed.latestBlock < observed.voteTransaction.blockNumber) fail("GOVERNANCE_RECOVERY_FINALITY_CHAIN_INVALID");
  verifyTransaction(frozen.unsignedRequests.propose, observed.proposalTransaction, "GOVERNANCE_RECOVERY_PROPOSAL");
  verifyTransaction(frozen.unsignedRequests.voteFor, observed.voteTransaction, "GOVERNANCE_RECOVERY_VOTE");
  const proposalEvent = observed.proposalEvent;
  if (getAddress(proposalEvent.address).toLowerCase() !== getAddress(frozen.unsignedRequests.propose.to).toLowerCase() || proposalEvent.proposalId !== frozen.proposal.proposalId || getAddress(proposalEvent.proposer).toLowerCase() !== getAddress(frozen.unsignedRequests.propose.from).toLowerCase() || proposalEvent.description !== frozen.proposal.description) fail("GOVERNANCE_RECOVERY_PROPOSAL_EVENT_IDENTITY_INVALID");
  const actionsMatch = proposalEvent.targets.length === frozen.proposal.targets.length && proposalEvent.targets.every((value,index)=>getAddress(value).toLowerCase()===getAddress(frozen.proposal.targets[index]).toLowerCase()) && proposalEvent.values.every((value,index)=>value===frozen.proposal.values[index]) && proposalEvent.calldatas.every((value,index)=>lower(value)===lower(frozen.proposal.calldatas[index])) && proposalEvent.signatures.length===frozen.proposal.targets.length && proposalEvent.signatures.every((value)=>value==="");
  if (!actionsMatch) fail("GOVERNANCE_RECOVERY_PROPOSAL_EVENT_ACTION_INVALID");
  const voteEvent = observed.voteEvent;
  if (getAddress(voteEvent.address).toLowerCase() !== getAddress(frozen.unsignedRequests.propose.to).toLowerCase() || voteEvent.proposalId !== frozen.proposal.proposalId || getAddress(voteEvent.voter).toLowerCase() !== getAddress(frozen.unsignedRequests.voteFor.from).toLowerCase() || voteEvent.support !== 1 || voteEvent.reason !== "" || voteEvent.weight !== frozen.votingCapacity.voterVotes) fail("GOVERNANCE_RECOVERY_VOTE_EVENT_INVALID");
  const governance = observed.governance;
  if (governance.state !== 4 || proposalEvent.voteStart !== governance.snapshot || proposalEvent.voteEnd !== governance.deadline || governance.quorum !== frozen.votingCapacity.quorumVotes || governance.againstVotes !== "0" || governance.forVotes !== frozen.votingCapacity.voterVotes || governance.abstainVotes !== "0" || BigInt(governance.forVotes) < BigInt(governance.quorum) || governance.proposalNeedsQueuing !== true || governance.currentVotingPeriodBlocks !== "8") fail("GOVERNANCE_RECOVERY_NOT_SUCCEEDED");
  return {
    schemaVersion: "aeos.live-governance-recovery-finality.v1",
    status: "RECOVERY_VOTE_SUCCEEDED",
    recoveryArtifactHash: frozen.artifactHash,
    proposalId: frozen.proposal.proposalId,
    chainId: observed.chainId,
    proposalTransaction: { hash: observed.proposalTransaction.hash, blockNumber: observed.proposalTransaction.blockNumber, blockHash: observed.proposalTransaction.blockHash, confirmations: observed.latestBlock-observed.proposalTransaction.blockNumber+1 },
    voteTransaction: { hash: observed.voteTransaction.hash, blockNumber: observed.voteTransaction.blockNumber, blockHash: observed.voteTransaction.blockHash, confirmations: observed.latestBlock-observed.voteTransaction.blockNumber+1 },
    governance: { state: "Succeeded", snapshot: governance.snapshot, deadline: governance.deadline, quorum: governance.quorum, votes: { against: governance.againstVotes, for: governance.forVotes, abstain: governance.abstainVotes }, quorumMet: true, proposalNeedsQueuing: true },
    checks: { exactProposalTransaction: true, exactVoteTransaction: true, canonicalInclusion: true, exactProposalCreatedEvent: true, exactVoteCastEvent: true, quorumMet: true },
    controls: { privateKeyReceived: false, signerCustody: false, broadcastCapability: false, assetExecutionAuthorized: false },
  };
}

export function buildVotingPeriodRecoveryQueue(frozen: RecoveryArtifact, finality: ReturnType<typeof verifyVotingPeriodRecoveryFinality>, recordedAt: string) {
  if (!Number.isFinite(Date.parse(recordedAt)) || finality.status !== "RECOVERY_VOTE_SUCCEEDED" || finality.recoveryArtifactHash !== frozen.artifactHash || finality.proposalId !== frozen.proposal.proposalId || !finality.governance.quorumMet || !finality.governance.proposalNeedsQueuing) fail("GOVERNANCE_RECOVERY_QUEUE_LINEAGE_INVALID");
  const request = frozen.unsignedRequests.propose;
  const data = governorInterface.encodeFunctionData("queue", [frozen.proposal.targets, frozen.proposal.values.map(BigInt), frozen.proposal.calldatas, frozen.proposal.descriptionHash]);
  const core = {
    schemaVersion: "aeos.live-governance-recovery-queue.v1", status: "RECOVERY_QUEUE_REQUEST_PREPARED", recordedAt: new Date(recordedAt).toISOString(),
    lineage: { recoveryArtifactHash: frozen.artifactHash, recoveryFinalityStatus: finality.status, proposalId: frozen.proposal.proposalId, proposalTransactionHash: finality.proposalTransaction.hash, voteTransactionHash: finality.voteTransaction.hash },
    proposal: { targets: frozen.proposal.targets, values: frozen.proposal.values, calldatas: frozen.proposal.calldatas, descriptionHash: frozen.proposal.descriptionHash, action: frozen.proposal.action },
    unsignedTransaction: { chainId: request.chainId, from: request.from, to: request.to, value: "0x0" as const, data, dataHash: keccak256(data) },
    controls: { requiresUserWalletConfirmation: true, signed: false, submitted: false, privateKeyReceived: false, signerCustody: false, broadcastCapability: false, treasuryAssetMovement: false, assetExecutionAuthorized: false },
  };
  return { ...core, artifactHash: hashValue(core) };
}
