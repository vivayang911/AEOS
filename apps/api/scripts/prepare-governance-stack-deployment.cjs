const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");
const { buildGovernanceStackDeploymentPlan, GOVERNANCE_STACK_CHAIN_ID } = require("../dist/governance-stack-engine");

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function loadArtifact(contract, source, overrideName) {
  const artifactPath = resolve(
    process.env[overrideName] || resolve(__dirname, `../../../contracts/out/${contract}.sol/${contract}.json`),
  );
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  return {
    contract,
    source,
    compiler: artifact.metadata?.compiler?.version || "0.8.28",
    creationBytecode: artifact.bytecode?.object,
    runtimeBytecode: artifact.deployedBytecode?.object,
  };
}

const plan = buildGovernanceStackDeploymentPlan({
  chainId: Number(process.env.GOVERNANCE_STACK_CHAIN_ID || GOVERNANCE_STACK_CHAIN_ID),
  deployer: required("GOVERNANCE_STACK_DEPLOYER"),
  guardian: required("GOVERNANCE_STACK_GUARDIAN"),
  pendingNonce: Number(required("GOVERNANCE_STACK_PENDING_NONCE")),
  initialSupply: process.env.GOVERNANCE_STACK_INITIAL_SUPPLY || "1000000000000000000000000",
  timelockDelaySeconds: Number(process.env.GOVERNANCE_STACK_TIMELOCK_DELAY_SECONDS || 60),
  votingDelayBlocks: Number(process.env.GOVERNANCE_STACK_VOTING_DELAY_BLOCKS || 1),
  votingPeriodBlocks: Number(process.env.GOVERNANCE_STACK_VOTING_PERIOD_BLOCKS || 8),
  proposalThreshold: process.env.GOVERNANCE_STACK_PROPOSAL_THRESHOLD || "0",
  quorumNumerator: Number(process.env.GOVERNANCE_STACK_QUORUM_NUMERATOR || 4),
  artifacts: {
    token: loadArtifact("AEOSGovernanceToken", "contracts/src/AEOSGovernanceToken.sol", "GOVERNANCE_TOKEN_ARTIFACT_PATH"),
    timelock: loadArtifact(
      "TimelockController",
      "@openzeppelin/contracts/governance/TimelockController.sol",
      "TIMELOCK_ARTIFACT_PATH",
    ),
    governor: loadArtifact("AEOSGovernor", "contracts/src/AEOSGovernor.sol", "GOVERNOR_ARTIFACT_PATH"),
    policyRegistry: loadArtifact("PolicyRegistry", "contracts/src/PolicyRegistry.sol", "POLICY_REGISTRY_ARTIFACT_PATH"),
    treasuryGuard: loadArtifact("TreasuryGuard", "contracts/src/TreasuryGuard.sol", "TREASURY_GUARD_ARTIFACT_PATH"),
  },
});

const outputPath = process.env.GOVERNANCE_STACK_PLAN_OUTPUT_PATH
  ? resolve(process.env.GOVERNANCE_STACK_PLAN_OUTPUT_PATH)
  : null;
if (outputPath) {
  mkdirSync(dirname(outputPath), { recursive: true });
  if (existsSync(outputPath)) {
    const existing = JSON.parse(readFileSync(outputPath, "utf8"));
    if (existing.planHash !== plan.planHash) throw new Error("GOVERNANCE_STACK_PLAN_OUTPUT_ALREADY_EXISTS_WITH_DIFFERENT_HASH");
  } else {
    writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  }
}

if (process.env.GOVERNANCE_STACK_PLAN_SUMMARY_ONLY === "1") {
  console.log(JSON.stringify({
    schemaVersion: plan.schemaVersion,
    chainId: plan.chainId,
    deployer: plan.deployer,
    guardian: plan.guardian,
    observedPendingNonce: plan.observedPendingNonce,
    planHash: plan.planHash,
    addresses: plan.addresses,
    transactionCount: plan.deploymentTransactions.length + plan.roleTransactions.length,
    outputPath,
    exactNonceSequenceRequired: plan.exactNonceSequenceRequired,
    safe: plan.safe,
    signed: plan.signed,
    submitted: plan.submitted,
    containsPrivateKey: plan.containsPrivateKey,
    aeosSigningCapability: plan.aeosSigningCapability,
    aeosBroadcastCapability: plan.aeosBroadcastCapability,
    assetExecutionAuthorized: plan.assetExecutionAuthorized,
  }, null, 2));
} else {
  console.log(JSON.stringify(plan, null, 2));
}
