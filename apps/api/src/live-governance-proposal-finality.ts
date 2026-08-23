import { getAddress, keccak256 } from "ethers";

const fail = (code: string): never => { throw new Error(code); };
const lowerAddress = (value: string) => getAddress(value).toLowerCase();
const lowerHex = (value: string) => value.toLowerCase();

export type FrozenGovernanceProposal = {
  artifactHash: string;
  contracts: { governor: string };
  proposal: {
    proposalId: string;
    description: string;
    targets: string[];
    values: string[];
    calldatas: string[];
  };
  unsignedTransaction: { chainId: number; from: string; to: string; value: "0x0"; data: string; dataHash: string };
};

export type GovernanceProposalChainObservation = {
  transactionHash: string;
  chainId: number;
  from: string;
  to: string;
  value: string;
  data: string;
  receiptStatus: number;
  blockNumber: number;
  blockHash: string;
  canonicalBlockHash: string;
  canonicalTransactionHashes: string[];
  latestBlock: number;
  event: {
    address: string;
    name: string;
    proposalId: string;
    proposer: string;
    targets: string[];
    values: string[];
    signatures: string[];
    calldatas: string[];
    voteStart: string;
    voteEnd: string;
    description: string;
  };
  state: number;
  proposalSnapshot: string;
  proposalDeadline: string;
  votes: { against: string; for: string; abstain: string };
};

export function normalizeProposalCreatedEventArgs(args: readonly unknown[]) {
  if (args.length < 9) fail("GOVERNANCE_PROPOSAL_EVENT_ARGUMENTS_INVALID");
  const list = (value: unknown, code: string): readonly unknown[] => {
    if (value === null || value === undefined || typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== "function") fail(code);
    return Array.from(value as Iterable<unknown>);
  };
  const text = (value: unknown, code: string) => {
    if (typeof value !== "string") fail(code);
    return value;
  };
  return {
    proposalId: String(args[0]),
    proposer: text(args[1], "GOVERNANCE_PROPOSAL_EVENT_PROPOSER_INVALID"),
    targets: list(args[2], "GOVERNANCE_PROPOSAL_EVENT_TARGETS_INVALID").map((value) => text(value, "GOVERNANCE_PROPOSAL_EVENT_TARGET_INVALID")),
    values: list(args[3], "GOVERNANCE_PROPOSAL_EVENT_VALUES_INVALID").map(String),
    signatures: list(args[4], "GOVERNANCE_PROPOSAL_EVENT_SIGNATURES_INVALID").map((value) => text(value, "GOVERNANCE_PROPOSAL_EVENT_SIGNATURE_INVALID")),
    calldatas: list(args[5], "GOVERNANCE_PROPOSAL_EVENT_CALLDATAS_INVALID").map((value) => text(value, "GOVERNANCE_PROPOSAL_EVENT_CALLDATA_INVALID")),
    voteStart: String(args[6]),
    voteEnd: String(args[7]),
    description: text(args[8], "GOVERNANCE_PROPOSAL_EVENT_DESCRIPTION_INVALID"),
  };
}

const stateNames = ["Pending", "Active", "Canceled", "Defeated", "Succeeded", "Queued", "Expired", "Executed"] as const;

export function verifyLiveGovernanceProposalFinality(
  frozen: FrozenGovernanceProposal,
  observation: GovernanceProposalChainObservation,
) {
  if (observation.chainId !== frozen.unsignedTransaction.chainId) fail("GOVERNANCE_PROPOSAL_CHAIN_ID_MISMATCH");
  if (observation.receiptStatus !== 1) fail("GOVERNANCE_PROPOSAL_RECEIPT_FAILED");
  if (observation.blockNumber <= 0 || observation.latestBlock < observation.blockNumber) fail("GOVERNANCE_PROPOSAL_BLOCK_INVALID");
  if (lowerHex(observation.blockHash) !== lowerHex(observation.canonicalBlockHash)) fail("GOVERNANCE_PROPOSAL_NON_CANONICAL_BLOCK");
  if (!observation.canonicalTransactionHashes.some((hash) => lowerHex(hash) === lowerHex(observation.transactionHash))) {
    fail("GOVERNANCE_PROPOSAL_NOT_IN_CANONICAL_BLOCK");
  }
  if (lowerAddress(observation.from) !== lowerAddress(frozen.unsignedTransaction.from)) fail("GOVERNANCE_PROPOSAL_SENDER_MISMATCH");
  if (lowerAddress(observation.to) !== lowerAddress(frozen.unsignedTransaction.to)) fail("GOVERNANCE_PROPOSAL_TARGET_MISMATCH");
  if (BigInt(observation.value) !== 0n || frozen.unsignedTransaction.value !== "0x0") fail("GOVERNANCE_PROPOSAL_NON_ZERO_VALUE");
  if (lowerHex(observation.data) !== lowerHex(frozen.unsignedTransaction.data) || lowerHex(keccak256(observation.data)) !== lowerHex(frozen.unsignedTransaction.dataHash)) {
    fail("GOVERNANCE_PROPOSAL_CALLDATA_MISMATCH");
  }
  const event = observation.event;
  if (event.name !== "ProposalCreated" || lowerAddress(event.address) !== lowerAddress(frozen.contracts.governor)) fail("GOVERNANCE_PROPOSAL_EVENT_MISSING");
  if (event.proposalId !== frozen.proposal.proposalId || lowerAddress(event.proposer) !== lowerAddress(frozen.unsignedTransaction.from)) fail("GOVERNANCE_PROPOSAL_EVENT_IDENTITY_MISMATCH");
  if (event.description !== frozen.proposal.description) fail("GOVERNANCE_PROPOSAL_DESCRIPTION_MISMATCH");
  if (event.signatures.length !== event.targets.length || event.signatures.some((signature) => signature !== "")) fail("GOVERNANCE_PROPOSAL_SIGNATURES_INVALID");
  const sameAddresses = event.targets.length === frozen.proposal.targets.length && event.targets.every((value, index) => lowerAddress(value) === lowerAddress(frozen.proposal.targets[index]));
  const sameValues = event.values.length === frozen.proposal.values.length && event.values.every((value, index) => value === frozen.proposal.values[index]);
  const sameCalldatas = event.calldatas.length === frozen.proposal.calldatas.length && event.calldatas.every((value, index) => lowerHex(value) === lowerHex(frozen.proposal.calldatas[index]));
  if (!sameAddresses || !sameValues || !sameCalldatas) fail("GOVERNANCE_PROPOSAL_EVENT_ACTION_MISMATCH");
  if (event.voteStart !== observation.proposalSnapshot || event.voteEnd !== observation.proposalDeadline) fail("GOVERNANCE_PROPOSAL_WINDOW_MISMATCH");
  if (!Number.isInteger(observation.state) || observation.state < 0 || observation.state >= stateNames.length) fail("GOVERNANCE_PROPOSAL_STATE_INVALID");

  const confirmations = observation.latestBlock - observation.blockNumber + 1;
  const votes = observation.votes;
  const totalVotes = BigInt(votes.against) + BigInt(votes.for) + BigInt(votes.abstain);
  const lifecycleState = stateNames[observation.state];
  const lifecyclePassed = lifecycleState === "Succeeded" || lifecycleState === "Queued" || lifecycleState === "Executed";
  const failureReason = lifecycleState === "Defeated" && totalVotes === 0n ? "NO_VOTES_BEFORE_DEADLINE" : null;

  return {
    schemaVersion: "aeos.live-governance-proposal-finality.v1",
    status: lifecyclePassed ? "PROPOSAL_LIFECYCLE_PASSED" : lifecycleState === "Defeated" ? "PROPOSAL_DEFEATED" : "PROPOSAL_CREATED",
    proposalCreationVerified: true,
    lifecyclePassed,
    failureReason,
    transactionHash: observation.transactionHash,
    proposalArtifactHash: frozen.artifactHash,
    proposalId: frozen.proposal.proposalId,
    chainId: observation.chainId,
    blockNumber: observation.blockNumber,
    blockHash: observation.blockHash,
    confirmations,
    governance: {
      state: lifecycleState,
      stateCode: observation.state,
      snapshotBlock: observation.proposalSnapshot,
      deadlineBlock: observation.proposalDeadline,
      votes,
      totalVotes: totalVotes.toString(),
    },
    checks: {
      canonicalInclusion: true,
      exactSender: true,
      exactGovernor: true,
      zeroValue: true,
      exactCalldata: true,
      exactProposalCreatedEvent: true,
    },
    controls: {
      privateKeyReceived: false,
      signerCustody: false,
      broadcastCapability: false,
      assetExecutionAuthorized: false,
    },
  };
}
