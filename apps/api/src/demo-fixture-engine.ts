import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildDecisionOutput, hashValue } from "./decision-engine";
import { buildExecutionPreflight, executionActionId } from "./execution-engine";
import { PolicySimulationInput, TreasuryPolicyConfig, simulatePolicy, validateTreasuryPolicy } from "./policy-engine";
import { Erc20TransferAction, buildErc20TransferAction, buildGovernorProposalIdentity } from "./proposal-engine";
import { GuardSnapshot } from "./treasury-guard-adapter";

type DemoEvidence = {
  id: string;
  organizationId: string;
  value: unknown;
  verification: { status: string };
  freshness: string;
  qualityScore: number;
  conflictGroupId: string | null;
};

export type DemoFixture = {
  schemaVersion: "aeos.demo.fixture.v3";
  fixtureVersion: string;
  organizationId: string;
  objective: string;
  evidence: DemoEvidence[];
  policy: TreasuryPolicyConfig & { version: number };
  simulationInput: PolicySimulationInput;
  action: Erc20TransferAction;
  governance: { chainId: number; governor: string; description: string };
  guard: { address: string; blockNumber: number; blockHash: string; confirmations: number };
  deadline: number;
  expiresAt: string;
  expected: {
    recommendation: "HOLD";
    simulationStatus: "SUGGESTED";
    readyPreflightStatus: "READY_FOR_SAFE_REVIEW";
    pausedPreflightStatus: "BLOCKED";
    pausedBlocker: "GUARD_NOT_PAUSED";
    refusalRecommendation: "INSUFFICIENT_EVIDENCE";
    refusalBlocker: "STALE_EVIDENCE";
  };
};

const fixturePath = resolve(__dirname, "../fixtures/demo/phase5-governance-demo.v3.json");
const addressPattern = /^0x[0-9a-f]{40}$/i;
const bytes32Pattern = /^0x[0-9a-f]{64}$/i;

function requireFixture(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

export function validateDemoFixture(value: unknown): DemoFixture {
  requireFixture(Boolean(value) && typeof value === "object" && !Array.isArray(value), "INVALID_DEMO_FIXTURE");
  const fixture = value as DemoFixture;
  requireFixture(fixture.schemaVersion === "aeos.demo.fixture.v3", "INVALID_DEMO_SCHEMA_VERSION");
  requireFixture(typeof fixture.fixtureVersion === "string" && fixture.fixtureVersion.length > 0, "INVALID_DEMO_FIXTURE_VERSION");
  requireFixture(typeof fixture.organizationId === "string" && fixture.organizationId.length > 0, "INVALID_DEMO_ORGANIZATION");
  requireFixture(typeof fixture.objective === "string" && fixture.objective.trim().length > 0, "INVALID_DEMO_OBJECTIVE");
  requireFixture(Array.isArray(fixture.evidence) && fixture.evidence.length >= 2, "INVALID_DEMO_EVIDENCE");
  requireFixture(new Set(fixture.evidence.map((item) => item.id)).size === fixture.evidence.length, "DUPLICATE_DEMO_EVIDENCE_ID");
  for (const evidence of fixture.evidence) {
    requireFixture(evidence.organizationId === fixture.organizationId, "DEMO_CROSS_ORGANIZATION_EVIDENCE");
    requireFixture(typeof evidence.id === "string" && evidence.id.length > 0, "INVALID_DEMO_EVIDENCE_ID");
    requireFixture(evidence.verification?.status === "VERIFIED", "INVALID_DEMO_EVIDENCE_PROOF");
    requireFixture(evidence.freshness === "FRESH", "INVALID_DEMO_EVIDENCE_FRESHNESS");
    requireFixture(Number.isInteger(evidence.qualityScore) && evidence.qualityScore >= 0 && evidence.qualityScore <= 100, "INVALID_DEMO_EVIDENCE_QUALITY");
  }
  requireFixture(Number.isInteger(fixture.policy?.version) && fixture.policy.version > 0, "INVALID_DEMO_POLICY_VERSION");
  validateTreasuryPolicy(fixture.policy);
  requireFixture(fixture.simulationInput?.evidenceSnapshotId === "snap_demo_fixture_v1", "INVALID_DEMO_SNAPSHOT_ID");
  requireFixture(fixture.action?.kind === "ERC20_TRANSFER", "INVALID_DEMO_ACTION");
  requireFixture(Number.isInteger(fixture.governance?.chainId) && fixture.governance.chainId > 0 && addressPattern.test(fixture.governance.governor), "INVALID_DEMO_GOVERNANCE");
  requireFixture(addressPattern.test(fixture.guard?.address) && bytes32Pattern.test(fixture.guard.blockHash), "INVALID_DEMO_GUARD");
  requireFixture(Number.isInteger(fixture.deadline) && fixture.deadline > 0 && !Number.isNaN(Date.parse(fixture.expiresAt)), "INVALID_DEMO_EXPIRY");
  requireFixture(Boolean(fixture.expected), "INVALID_DEMO_EXPECTATIONS");
  return fixture;
}

export function loadDemoFixture(path = fixturePath): DemoFixture {
  return validateDemoFixture(JSON.parse(readFileSync(path, "utf8")));
}

export function runDemoFixture(input: DemoFixture) {
  const fixture = validateDemoFixture(structuredClone(input));
  const policy = fixture.policy;
  const evidence = fixture.evidence.map(({ organizationId: _organizationId, ...item }) => item);
  const manifest = fixture.evidence
    .map((item) => ({ evidenceId: item.id, organizationId: item.organizationId, contentHash: hashValue({ value: item.value, verification: item.verification, freshness: item.freshness, qualityScore: item.qualityScore, conflictGroupId: item.conflictGroupId }) }))
    .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
  const manifestHash = hashValue(manifest);
  const decision = buildDecisionOutput({ objective: fixture.objective, evidence, policy });
  const simulation = simulatePolicy(policy, fixture.simulationInput, decision.blockers.length === 0);
  const transaction = buildErc20TransferAction(fixture.action);
  const governor = buildGovernorProposalIdentity([transaction.target], [transaction.value], [transaction.calldata], fixture.governance.description);
  const policyContentHash = hashValue(policy);
  const proposalContent = {
    evidence: { manifestHash },
    decision: { outputHash: hashValue(decision.output), recommendation: decision.output.recommendation },
    policy: { version: policy.version, contentHash: policyContentHash },
    simulation: { resultHash: hashValue(simulation), status: simulation.status },
    transaction,
    governor,
    assetExecutionAuthorized: false,
  };
  const proposal = { content: proposalContent, targets: [transaction.target], calldatas: [transaction.calldata] };
  const governance = {
    state: "QUEUED",
    chain_id: fixture.governance.chainId,
    external_proposal_id: governor.proposalId,
    payload: { onchainFinalityVerified: true, mockOnly: false, assetExecutionAuthorized: false },
  };
  const actionId = executionActionId(hashValue(proposalContent), hashValue(governance), policyContentHash);
  const guard: GuardSnapshot = {
    mode: "evm-readonly",
    chainId: fixture.governance.chainId,
    address: fixture.guard.address,
    policyRegistry: "0x4444444444444444444444444444444444444444",
    paused: false,
    policyHash: policyContentHash,
    policyVersion: policy.version,
    policyValidFrom: 1,
    policyValidUntil: fixture.deadline,
    registryPolicyHash: policyContentHash,
    registryPolicyValidFrom: 1,
    registryPolicyValidUntil: fixture.deadline,
    policyRegistryBindingVerified: true,
    targetAllowed: true,
    selectorAllowed: true,
    actionConsumed: false,
    blockNumber: fixture.guard.blockNumber,
    blockHash: fixture.guard.blockHash,
    confirmations: fixture.guard.confirmations,
    onchainReadVerified: true,
    assetExecutionAuthorized: false,
  };
  const preflightInput = { proposal, policy: { ...policy, status: "ACTIVE", content_hash: policyContentHash }, governance, guard, evidenceEligible: true, resimulation: simulation, actionId, actionCalldata: transaction.calldata, actionTarget: transaction.target, actionSelector: transaction.functionSelector, deadline: fixture.deadline, expiresAt: fixture.expiresAt };
  const readyPreflight = buildExecutionPreflight(preflightInput);
  const pausedPreflight = buildExecutionPreflight({ ...preflightInput, guard: { ...guard, paused: true } });
  const staleEvidence = evidence.map((item, index) => index === 0 ? { ...item, freshness: "STALE" } : item);
  const refusal = buildDecisionOutput({ objective: fixture.objective, evidence: staleEvidence, policy });

  requireFixture(decision.output.recommendation === fixture.expected.recommendation, "DEMO_RECOMMENDATION_REGRESSION");
  requireFixture(simulation.status === fixture.expected.simulationStatus, "DEMO_SIMULATION_REGRESSION");
  requireFixture(readyPreflight.status === fixture.expected.readyPreflightStatus, "DEMO_READY_PREFLIGHT_REGRESSION");
  requireFixture(pausedPreflight.status === fixture.expected.pausedPreflightStatus && pausedPreflight.blockers.includes(fixture.expected.pausedBlocker), "DEMO_PAUSE_GUARDRAIL_REGRESSION");
  requireFixture(refusal.output.recommendation === fixture.expected.refusalRecommendation && refusal.blockers.includes(fixture.expected.refusalBlocker), "DEMO_REFUSAL_REGRESSION");

  const report = {
    schemaVersion: "aeos.demo.report.v2",
    fixtureVersion: fixture.fixtureVersion,
    organizationId: fixture.organizationId,
    fixtureHash: hashValue(fixture),
    fixtureBoundary: { mode: "DETERMINISTIC_OFFLINE", liveOnchainVerified: false, databasePersisted: false, externalProviderCalled: false },
    trace: {
      evidence: { count: manifest.length, ids: manifest.map((item) => item.evidenceId), manifestHash },
      decision: { recommendation: decision.output.recommendation, agentRoster: decision.positions.map(position=>position.role), a2aMessages: decision.agentMessages.length, citations: decision.citations, citationCoverage: decision.output.citationCoverage.coverage, outputHash: hashValue(decision.output), actions: decision.output.actions.length, assetExecutionAuthorized: decision.output.assetExecutionAuthorized },
      policy: { version: policy.version, contentHash: policyContentHash, simulationStatus: simulation.status, simulationHash: hashValue(simulation), advisoryOnly: simulation.advisoryOnly, assetExecutionAuthorized: simulation.assetExecutionAuthorized },
      proposal: { target: transaction.target, calldataHash: hashValue(transaction.calldata), proposalId: governor.proposalId, contentHash: hashValue(proposalContent), consistencyVerified: transaction.consistencyVerified, assetExecutionAuthorized: proposalContent.assetExecutionAuthorized },
      execution: { actionId, readyStatus: readyPreflight.status, safeHandoffHash: hashValue(readyPreflight.safeHandoff), signed: readyPreflight.signed, submitted: readyPreflight.submitted, executesAssetTransfer: readyPreflight.safeHandoff?.executesAssetTransfer ?? false, assetExecutionAuthorized: readyPreflight.assetExecutionAuthorized, pausedStatus: pausedPreflight.status, pausedBlockers: pausedPreflight.blockers, pausedSafeHandoff: pausedPreflight.safeHandoff },
      refusal: { recommendation: refusal.output.recommendation, blockers: refusal.blockers, actions: refusal.output.actions.length, assetExecutionAuthorized: refusal.output.assetExecutionAuthorized },
    },
  };
  return { ...report, reportHash: hashValue(report) };
}
