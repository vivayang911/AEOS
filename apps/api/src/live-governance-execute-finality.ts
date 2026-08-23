import { ZeroHash, getAddress, keccak256 } from "ethers";

const fail = (code: string): never => { throw new Error(code); };
const lower = (value: string) => value.toLowerCase();

export type ExecuteArtifact = {
  artifactHash: string;
  lineage: {
    queueArtifactHash: string;
    queueTransactionHash: string;
    proposalId: string;
    timelockOperationId: string;
  };
  proposal: {
    targets: string[];
    values: string[];
    calldatas: string[];
    descriptionHash: string;
    action: { previousVotingPeriodBlocks: number; newVotingPeriodBlocks: number };
  };
  unsignedTransaction: {
    chainId: number;
    from: string;
    to: string;
    value: "0x0";
    data: string;
    dataHash: string;
  };
};

export type ExecuteObservation = {
  chainId: number;
  latestBlock: number;
  transaction: {
    hash: string;
    from: string;
    to: string;
    value: string;
    data: string;
    status: number;
    blockNumber: number;
    blockHash: string;
    canonicalBlockHash: string;
    canonicalTransactionHashes: string[];
  };
  proposalExecuted: { address: string; proposalId: string };
  callExecuted: {
    address: string;
    operationId: string;
    index: string;
    target: string;
    value: string;
    data: string;
  };
  governance: { state: number; votingPeriodBlocks: string };
  timelock: {
    address: string;
    timestamp: string;
    pending: boolean;
    ready: boolean;
    done: boolean;
  };
  treasuryGuard: { address: string; paused: boolean };
};

export function verifyRecoveryExecuteFinality(frozen: ExecuteArtifact, observed: ExecuteObservation) {
  const tx = frozen.unsignedTransaction;
  const actual = observed.transaction;
  if (
    observed.chainId !== tx.chainId || actual.status !== 1 ||
    lower(getAddress(actual.from)) !== lower(getAddress(tx.from)) ||
    lower(getAddress(actual.to)) !== lower(getAddress(tx.to)) ||
    BigInt(actual.value) !== 0n || lower(actual.data) !== lower(tx.data) ||
    lower(keccak256(actual.data)) !== lower(tx.dataHash)
  ) fail("GOVERNANCE_EXECUTE_TRANSACTION_MISMATCH");
  if (
    lower(actual.blockHash) !== lower(actual.canonicalBlockHash) ||
    !actual.canonicalTransactionHashes.some((hash) => lower(hash) === lower(actual.hash)) ||
    observed.latestBlock < actual.blockNumber
  ) fail("GOVERNANCE_EXECUTE_NON_CANONICAL");

  if (
    lower(getAddress(observed.proposalExecuted.address)) !== lower(getAddress(tx.to)) ||
    observed.proposalExecuted.proposalId !== frozen.lineage.proposalId
  ) fail("GOVERNANCE_EXECUTE_PROPOSAL_EVENT_INVALID");

  const call = observed.callExecuted;
  if (
    lower(getAddress(call.address)) !== lower(getAddress(observed.timelock.address)) ||
    lower(call.operationId) !== lower(frozen.lineage.timelockOperationId) ||
    call.index !== "0" ||
    lower(getAddress(call.target)) !== lower(getAddress(frozen.proposal.targets[0])) ||
    BigInt(call.value) !== BigInt(frozen.proposal.values[0]) ||
    lower(call.data) !== lower(frozen.proposal.calldatas[0])
  ) fail("GOVERNANCE_EXECUTE_TIMELOCK_EVENT_INVALID");

  if (
    frozen.proposal.targets.length !== 1 || frozen.proposal.values.length !== 1 ||
    frozen.proposal.calldatas.length !== 1 ||
    lower(getAddress(frozen.proposal.targets[0])) !== lower(getAddress(tx.to)) ||
    BigInt(frozen.proposal.values[0]) !== 0n ||
    frozen.proposal.action.previousVotingPeriodBlocks !== 8 ||
    frozen.proposal.action.newVotingPeriodBlocks !== 240
  ) fail("GOVERNANCE_EXECUTE_ACTION_INVALID");

  if (
    observed.governance.state !== 7 || observed.governance.votingPeriodBlocks !== "240" ||
    observed.timelock.timestamp !== "1" || observed.timelock.pending ||
    observed.timelock.ready || !observed.timelock.done
  ) fail("GOVERNANCE_EXECUTE_STATE_INVALID");
  if (!observed.treasuryGuard.paused) fail("GOVERNANCE_EXECUTE_GUARD_NOT_PAUSED");

  return {
    schemaVersion: "aeos.live-governance-execute-finality.v1",
    status: "RECOVERY_EXECUTED",
    executeArtifactHash: frozen.artifactHash,
    queueArtifactHash: frozen.lineage.queueArtifactHash,
    proposalId: frozen.lineage.proposalId,
    chainId: observed.chainId,
    transaction: {
      hash: actual.hash,
      blockNumber: actual.blockNumber,
      blockHash: actual.blockHash,
      confirmations: observed.latestBlock - actual.blockNumber + 1,
      value: "0",
    },
    governance: { state: "Executed", votingPeriodBlocks: 240 },
    timelock: {
      address: lower(getAddress(observed.timelock.address)),
      operationId: lower(call.operationId),
      timestamp: observed.timelock.timestamp,
      pending: false,
      ready: false,
      done: true,
    },
    treasuryGuard: {
      address: lower(getAddress(observed.treasuryGuard.address)),
      paused: true,
    },
    executedAction: {
      target: lower(getAddress(call.target)),
      value: "0",
      selector: frozen.proposal.calldatas[0].slice(0, 10).toLowerCase(),
      previousVotingPeriodBlocks: 8,
      newVotingPeriodBlocks: 240,
    },
    checks: {
      exactExecuteTransaction: true,
      canonicalInclusion: true,
      exactProposalExecutedEvent: true,
      exactCallExecutedEvent: true,
      timelockOperationDone: true,
      votingPeriodReadback: true,
      treasuryGuardRemainsPaused: true,
      zeroNativeValue: true,
      treasuryAssetMovement: false,
    },
    controls: {
      privateKeyReceived: false,
      signerCustody: false,
      broadcastCapability: false,
      assetExecutionAuthorized: false,
    },
  };
}
