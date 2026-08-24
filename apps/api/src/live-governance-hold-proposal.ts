import { Interface, getAddress, keccak256 } from "ethers";
import { hashValue } from "./decision-engine";
import { buildGovernorProposalIdentity } from "./proposal-engine";

const guardInterface = new Interface(["function setPaused(bool value)"]);
const governorInterface = new Interface([
  "function propose(address[] targets,uint256[] values,bytes[] calldatas,string description) returns(uint256)",
]);

const fail = (code: string): never => { throw new Error(code); };

export type LiveGovernanceHoldProposalInput = {
  recordedAt: string;
  decision: {
    id: string;
    status: string;
    outputHash: string;
    evidenceSnapshotId: string;
    recommendation: {
      recommendation: string;
      actions: unknown[];
      unresolvedDisagreements: number;
      citationCoverage: { coverage: number; materialClaims: number; citedMaterialClaims: number };
      assetExecutionAuthorized: boolean;
    };
  };
  review: { id: string; outcome: string; outputHash: string; actorType: "human" };
  snapshot: { id: string; manifestHash: string; evidenceIds: string[] };
  tenantCommitment: string;
  chain: { chainId: number; blockNumber: number; blockHash: string; confirmations: number };
  contracts: { deployer: string; token: string; timelock: string; governor: string; treasuryGuard: string };
  readback: {
    allContractsHaveCode: boolean;
    guardPaused: boolean;
    guardGovernance: string;
    governorTimelock: string;
    proposalThreshold: string;
    deployerVotes: string;
    currentVotingPeriodBlocks?: string;
  };
  attempt?: {
    attemptNumber: number;
    previousProposalArtifactHash: string;
    previousProposalId: string;
    previousTransactionHash: string;
    previousStatus: "PROPOSAL_DEFEATED";
    previousFailureReason: "NO_VOTES_BEFORE_DEADLINE";
    recoveryExecuteArtifactHash: string;
    recoveryTransactionHash: string;
    recoveryStatus: "RECOVERY_EXECUTED";
    recoveredVotingPeriodBlocks: number;
  };
  simulation: {
    from: string;
    to: string;
    value: "0x0";
    data: string;
    callSucceeded: boolean;
    gasEstimate: string;
  };
};

export function buildLiveGovernanceHoldProposal(input: LiveGovernanceHoldProposalInput) {
  const { decision, review, snapshot } = input;
  if (!Number.isFinite(Date.parse(input.recordedAt))) fail("GOVERNANCE_HOLD_RECORDED_AT_INVALID");
  if (input.chain.chainId !== 102031 || input.chain.blockNumber <= 0 || !/^0x[0-9a-f]{64}$/i.test(input.chain.blockHash) || input.chain.confirmations < 2) {
    fail("GOVERNANCE_HOLD_CHAIN_FINALITY_INVALID");
  }
  if (decision.status !== "APPROVED" || review.outcome !== "APPROVED" || review.actorType !== "human" || review.outputHash !== decision.outputHash) {
    fail("GOVERNANCE_HOLD_HUMAN_APPROVAL_REQUIRED");
  }
  const recommendation = decision.recommendation;
  if (
    recommendation.recommendation !== "HOLD"
    || recommendation.actions.length !== 0
    || recommendation.unresolvedDisagreements !== 0
    || recommendation.assetExecutionAuthorized !== false
  ) fail("GOVERNANCE_HOLD_DECISION_NOT_ELIGIBLE");
  if (
    recommendation.citationCoverage.coverage !== 1
    || recommendation.citationCoverage.materialClaims < 1
    || recommendation.citationCoverage.citedMaterialClaims !== recommendation.citationCoverage.materialClaims
    || snapshot.id !== decision.evidenceSnapshotId
    || snapshot.evidenceIds.length < 1
    || !/^0x[0-9a-f]{64}$/i.test(snapshot.manifestHash)
  ) fail("GOVERNANCE_HOLD_EVIDENCE_LINEAGE_INVALID");
  if (!/^0x[0-9a-f]{64}$/i.test(input.tenantCommitment)) fail("GOVERNANCE_HOLD_TENANT_COMMITMENT_INVALID");

  const contracts = Object.fromEntries(
    Object.entries(input.contracts).map(([key, value]) => [key, getAddress(value).toLowerCase()]),
  ) as LiveGovernanceHoldProposalInput["contracts"];
  if (new Set(Object.values(contracts)).size !== Object.values(contracts).length) fail("GOVERNANCE_HOLD_CONTRACT_SEPARATION_INVALID");
  if (
    !input.readback.allContractsHaveCode
    || input.readback.guardPaused !== true
    || getAddress(input.readback.guardGovernance).toLowerCase() !== contracts.timelock
    || getAddress(input.readback.governorTimelock).toLowerCase() !== contracts.timelock
    || input.readback.proposalThreshold !== "0"
    || !/^[1-9][0-9]*$/.test(input.readback.deployerVotes)
  ) fail("GOVERNANCE_HOLD_CONTROL_READBACK_INVALID");

  const attempt = input.attempt;
  if (attempt && (
    !Number.isInteger(attempt.attemptNumber)
    || attempt.attemptNumber < 2
    || !/^0x[0-9a-f]{64}$/i.test(attempt.previousProposalArtifactHash)
    || !/^[1-9][0-9]*$/.test(attempt.previousProposalId)
    || !/^0x[0-9a-f]{64}$/i.test(attempt.previousTransactionHash)
    || attempt.previousStatus !== "PROPOSAL_DEFEATED"
    || attempt.previousFailureReason !== "NO_VOTES_BEFORE_DEADLINE"
    || !/^0x[0-9a-f]{64}$/i.test(attempt.recoveryExecuteArtifactHash)
    || !/^0x[0-9a-f]{64}$/i.test(attempt.recoveryTransactionHash)
    || attempt.recoveryStatus !== "RECOVERY_EXECUTED"
    || attempt.recoveredVotingPeriodBlocks !== 240
    || input.readback.currentVotingPeriodBlocks !== "240"
  )) fail("GOVERNANCE_HOLD_RETRY_LINEAGE_INVALID");

  const actionCalldata = guardInterface.encodeFunctionData("setPaused", [true]);
  if (
    getAddress(input.simulation.from).toLowerCase() !== contracts.timelock
    || getAddress(input.simulation.to).toLowerCase() !== contracts.treasuryGuard
    || input.simulation.value !== "0x0"
    || input.simulation.data.toLowerCase() !== actionCalldata.toLowerCase()
    || input.simulation.callSucceeded !== true
    || !/^[1-9][0-9]*$/.test(input.simulation.gasEstimate)
  ) fail("GOVERNANCE_HOLD_SIMULATION_INVALID");

  const attemptIdentity = attempt ? hashValue(attempt) : null;
  const title = "Ratify evidence-bound HOLD and maintain TreasuryGuard pause";
  const description = [
    title,
    "",
    `Decision: ${decision.id}`,
    `Decision output hash: ${decision.outputHash}`,
    `Evidence snapshot: ${snapshot.id}`,
    `Evidence manifest hash: ${snapshot.manifestHash}`,
    ...(attempt ? [
      `Attempt: ${attempt.attemptNumber}`,
      `Attempt identity: ${attemptIdentity}`,
      `Previous defeated proposal: ${attempt.previousProposalId}`,
      `Voting-period recovery transaction: ${attempt.recoveryTransactionHash}`,
      `Recovered voting period: ${attempt.recoveredVotingPeriodBlocks} blocks`,
    ] : []),
    "Action: keep TreasuryGuard paused (setPaused(true))",
    "Native value: 0",
    "This proposal records a deterministic withholding outcome; it does not move treasury assets.",
  ].join("\n");
  const targets = [contracts.treasuryGuard];
  const values = ["0"];
  const calldatas = [actionCalldata];
  const governor = buildGovernorProposalIdentity(targets, values, calldatas, description);
  const proposeCalldata = governorInterface.encodeFunctionData("propose", [targets, values.map(BigInt), calldatas, description]);

  const core = {
    schemaVersion: attempt ? "aeos.live-governance-hold-proposal.v2" : "aeos.live-governance-hold-proposal.v1",
    status: "PROPOSAL_REQUEST_PREPARED",
    recordedAt: new Date(input.recordedAt).toISOString(),
    tenantBinding: { mode: "SERVER_RESOLVED", commitment: input.tenantCommitment, rawOrganizationIdDisclosed: false },
    lineage: {
      decisionId: decision.id,
      decisionOutputHash: decision.outputHash,
      decisionReviewId: review.id,
      decisionReviewOutcome: review.outcome,
      evidenceSnapshotId: snapshot.id,
      evidenceManifestHash: snapshot.manifestHash,
      evidenceIds: [...snapshot.evidenceIds].sort(),
      ...(attempt ? { attempt: { ...attempt, attemptIdentity } } : {}),
    },
    chain: input.chain,
    contracts,
    safetyReadback: { ...input.readback, guardGovernance: contracts.timelock, governorTimelock: contracts.timelock },
    simulation: {
      schemaVersion: "governance.safety-simulation.v1",
      blockNumber: input.chain.blockNumber,
      blockHash: input.chain.blockHash,
      from: contracts.timelock,
      to: contracts.treasuryGuard,
      value: "0x0" as const,
      dataHash: keccak256(actionCalldata),
      callSucceeded: true,
      gasEstimate: input.simulation.gasEstimate,
      assetDelta: "NONE" as const,
      assetExecutionAuthorized: false as const,
    },
    proposal: {
      proposalType: "SECURITY_HOLD" as const,
      title,
      description,
      targets,
      values,
      calldatas,
      descriptionHash: governor.descriptionHash,
      proposalId: governor.proposalId,
      proposalIdHex: governor.proposalIdHex,
      action: { function: "setPaused(bool)", paused: true, target: contracts.treasuryGuard, value: "0" },
      semanticConsistencyVerified: true,
    },
    unsignedTransaction: {
      chainId: input.chain.chainId,
      from: contracts.deployer,
      to: contracts.governor,
      value: "0x0" as const,
      data: proposeCalldata,
      dataHash: keccak256(proposeCalldata),
    },
    controls: {
      requiresUserWalletConfirmation: true,
      signed: false,
      submitted: false,
      containsPrivateKey: false,
      signerCustody: false,
      broadcastCapability: false,
      assetExecutionAuthorized: false,
    },
    truthBoundary: {
      decisionRecommendation: "HOLD",
      guardAlreadyPaused: true,
      proposedEffect: "MAINTAIN_PAUSE",
      treasuryAssetMovement: false,
      economicBenefitClaimed: false,
      aiCausalityClaimed: false,
      onchainProposalCreated: false,
    },
  };
  return { ...core, artifactHash: hashValue(core) };
}
