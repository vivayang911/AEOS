import { Interface, getAddress, keccak256 } from "ethers";
import { hashValue } from "./decision-engine";

const governorInterface = new Interface(["function castVote(uint256 proposalId,uint8 support) returns(uint256)"]);
const fail = (code: string): never => { throw new Error(code); };

export type HoldAttemptArtifact = {
  schemaVersion: string;
  artifactHash: string;
  lineage: {
    decisionId: string;
    decisionOutputHash: string;
    evidenceSnapshotId: string;
    evidenceManifestHash: string;
    attempt: { attemptNumber: number; attemptIdentity: string; previousProposalId: string };
  };
  contracts: { token: string; governor: string; treasuryGuard: string };
  proposal: { proposalId: string; proposalType: string };
  unsignedTransaction: { chainId: number; from: string; to: string };
};

export type HoldProposalActiveFinality = {
  status: "PROPOSAL_ACTIVE";
  proposalCreationVerified: true;
  transactionHash: string;
  proposalArtifactHash: string;
  proposalId: string;
  chainId: number;
  blockNumber: number;
  blockHash: string;
  confirmations: number;
  governance: { state: "Active"; stateCode: 1; snapshotBlock: string; deadlineBlock: string; votingWindowBlocks: number };
  recoveryLineage: { previousProposalState: "Defeated"; recoveryProposalState: "Executed"; currentVotingPeriodBlocks: number };
};

export function buildDecisionBoundHoldVote(
  frozen: HoldAttemptArtifact,
  finality: HoldProposalActiveFinality,
  readback: { voter: string; voterDelegate: string; voterVotes: string; quorumVotes: string; observedBlockNumber: number; observedBlockHash: string },
  recordedAt: string,
) {
  if (!Number.isFinite(Date.parse(recordedAt))) fail("GOVERNANCE_HOLD_VOTE_RECORDED_AT_INVALID");
  if (
    frozen.schemaVersion !== "aeos.live-governance-hold-proposal.v2" ||
    !Number.isInteger(frozen.lineage.attempt.attemptNumber) || frozen.lineage.attempt.attemptNumber < 2 ||
    finality.status !== "PROPOSAL_ACTIVE" || !finality.proposalCreationVerified ||
    finality.proposalArtifactHash !== frozen.artifactHash ||
    finality.proposalId !== frozen.proposal.proposalId ||
    finality.chainId !== frozen.unsignedTransaction.chainId ||
    finality.governance.state !== "Active" || finality.governance.stateCode !== 1 ||
    finality.governance.votingWindowBlocks !== 240 ||
    finality.recoveryLineage.previousProposalState !== "Defeated" ||
    finality.recoveryLineage.recoveryProposalState !== "Executed" ||
    finality.recoveryLineage.currentVotingPeriodBlocks !== 240
  ) fail("GOVERNANCE_HOLD_VOTE_FINALITY_INVALID");
  if (
    readback.observedBlockNumber < Number(finality.governance.snapshotBlock) ||
    readback.observedBlockNumber > Number(finality.governance.deadlineBlock) ||
    !/^0x[0-9a-f]{64}$/i.test(readback.observedBlockHash) ||
    getAddress(readback.voter).toLowerCase() !== getAddress(frozen.unsignedTransaction.from).toLowerCase() ||
    getAddress(readback.voterDelegate).toLowerCase() !== getAddress(readback.voter).toLowerCase() ||
    BigInt(readback.voterVotes) < BigInt(readback.quorumVotes) || BigInt(readback.quorumVotes) <= 0n
  ) fail("GOVERNANCE_HOLD_VOTE_CAPACITY_INVALID");

  const data = governorInterface.encodeFunctionData("castVote", [BigInt(frozen.proposal.proposalId), 1]);
  const core = {
    schemaVersion: "aeos.live-governance-hold-vote.v1",
    status: "VOTE_FOR_REQUEST_PREPARED",
    recordedAt: new Date(recordedAt).toISOString(),
    lineage: {
      proposalArtifactHash: frozen.artifactHash,
      proposalTransactionHash: finality.transactionHash,
      proposalId: frozen.proposal.proposalId,
      attemptNumber: frozen.lineage.attempt.attemptNumber,
      attemptIdentity: frozen.lineage.attempt.attemptIdentity,
      decisionId: frozen.lineage.decisionId,
      decisionOutputHash: frozen.lineage.decisionOutputHash,
      evidenceSnapshotId: frozen.lineage.evidenceSnapshotId,
      evidenceManifestHash: frozen.lineage.evidenceManifestHash,
    },
    activeWindow: {
      snapshotBlock: finality.governance.snapshotBlock,
      deadlineBlock: finality.governance.deadlineBlock,
      votingWindowBlocks: 240,
      observedBlockNumber: readback.observedBlockNumber,
      observedBlockHash: readback.observedBlockHash,
      blocksRemaining: Number(finality.governance.deadlineBlock) - readback.observedBlockNumber,
    },
    votingCapacity: {
      voter: getAddress(readback.voter).toLowerCase(),
      delegate: getAddress(readback.voterDelegate).toLowerCase(),
      voterVotes: readback.voterVotes,
      quorumVotes: readback.quorumVotes,
      singleWalletMeetsQuorum: true,
    },
    unsignedTransaction: {
      chainId: frozen.unsignedTransaction.chainId,
      from: getAddress(readback.voter).toLowerCase(),
      to: getAddress(frozen.contracts.governor).toLowerCase(),
      value: "0x0" as const,
      data,
      dataHash: keccak256(data),
      support: 1,
      validOnlyWhenProposalState: "Active" as const,
    },
    controls: {
      requiresUserWalletConfirmation: true,
      signed: false,
      submitted: false,
      privateKeyReceived: false,
      signerCustody: false,
      broadcastCapability: false,
      assetExecutionAuthorized: false,
    },
  };
  return { ...core, artifactHash: hashValue(core) };
}
