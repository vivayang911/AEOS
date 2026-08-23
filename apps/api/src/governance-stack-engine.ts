import {
  AbiCoder,
  Interface,
  concat,
  getAddress,
  getCreateAddress,
  keccak256,
  toUtf8Bytes,
} from "ethers";
import { createHash } from "node:crypto";

export const GOVERNANCE_STACK_CHAIN_ID = 102031;
export const OPEN_EXECUTOR = "0x0000000000000000000000000000000000000000";
export const DEFAULT_ADMIN_ROLE = `0x${"00".repeat(32)}`;
export const PROPOSER_ROLE = keccak256(toUtf8Bytes("PROPOSER_ROLE"));
export const CANCELLER_ROLE = keccak256(toUtf8Bytes("CANCELLER_ROLE"));

type ArtifactInput = {
  contract: string;
  source: string;
  compiler: string;
  creationBytecode: string;
  runtimeBytecode: string;
};

export type GovernanceStackPlanInput = {
  chainId: number;
  deployer: string;
  guardian: string;
  pendingNonce: number;
  initialSupply: string;
  timelockDelaySeconds: number;
  votingDelayBlocks: number;
  votingPeriodBlocks: number;
  proposalThreshold: string;
  quorumNumerator: number;
  artifacts: {
    token: ArtifactInput;
    timelock: ArtifactInput;
    governor: ArtifactInput;
    policyRegistry: ArtifactInput;
    treasuryGuard: ArtifactInput;
  };
};

const canonical = (value: unknown): string =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : value && typeof value === "object"
      ? `{${Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
          .join(",")}}`
      : JSON.stringify(value);

const sha256 = (value: unknown) =>
  `0x${createHash("sha256").update(canonical(value)).digest("hex")}`;

function normalizedArtifact(input: ArtifactInput) {
  if (!input.contract.trim() || !input.source.trim() || !input.compiler.trim()) {
    throw new Error("GOVERNANCE_ARTIFACT_METADATA_INVALID");
  }
  for (const bytecode of [input.creationBytecode, input.runtimeBytecode]) {
    if (!/^0x[0-9a-fA-F]+$/.test(bytecode) || bytecode.length < 4 || bytecode.length % 2 !== 0) {
      throw new Error("GOVERNANCE_ARTIFACT_BYTECODE_INVALID");
    }
  }
  return {
    contract: input.contract,
    source: input.source,
    compiler: input.compiler,
    creationBytecode: input.creationBytecode,
    creationBytecodeHash: keccak256(input.creationBytecode),
    runtimeBytecodeHash: keccak256(input.runtimeBytecode),
  };
}

function initCode(artifact: ReturnType<typeof normalizedArtifact>, types: string[], values: unknown[]) {
  const encoded = AbiCoder.defaultAbiCoder().encode(types, values);
  const data = concat([artifact.creationBytecode, encoded]);
  return { data, initCodeHash: keccak256(data) };
}

export function buildGovernanceStackDeploymentPlan(input: GovernanceStackPlanInput) {
  if (input.chainId !== GOVERNANCE_STACK_CHAIN_ID) throw new Error("GOVERNANCE_STACK_CHAIN_INVALID");
  if (!Number.isSafeInteger(input.pendingNonce) || input.pendingNonce < 0) {
    throw new Error("GOVERNANCE_PENDING_NONCE_INVALID");
  }
  const deployer = getAddress(input.deployer).toLowerCase();
  const guardian = getAddress(input.guardian).toLowerCase();
  if (deployer === OPEN_EXECUTOR || guardian === OPEN_EXECUTOR) {
    throw new Error("GOVERNANCE_DEPLOYMENT_ROLES_INVALID");
  }
  const initialSupply = BigInt(input.initialSupply);
  const proposalThreshold = BigInt(input.proposalThreshold);
  if (initialSupply <= 0n || initialSupply > (1n << 208n) - 1n || proposalThreshold < 0n) {
    throw new Error("GOVERNANCE_TOKEN_PARAMETERS_INVALID");
  }
  if (
    !Number.isSafeInteger(input.timelockDelaySeconds) ||
    input.timelockDelaySeconds < 60 ||
    !Number.isSafeInteger(input.votingDelayBlocks) ||
    input.votingDelayBlocks < 1 ||
    !Number.isSafeInteger(input.votingPeriodBlocks) ||
    input.votingPeriodBlocks < 2 ||
    !Number.isSafeInteger(input.quorumNumerator) ||
    input.quorumNumerator < 1 ||
    input.quorumNumerator > 100
  ) {
    throw new Error("GOVERNANCE_TIMING_OR_QUORUM_INVALID");
  }

  const artifacts = {
    token: normalizedArtifact(input.artifacts.token),
    timelock: normalizedArtifact(input.artifacts.timelock),
    governor: normalizedArtifact(input.artifacts.governor),
    policyRegistry: normalizedArtifact(input.artifacts.policyRegistry),
    treasuryGuard: normalizedArtifact(input.artifacts.treasuryGuard),
  };
  const addressAt = (offset: number) =>
    getCreateAddress({ from: deployer, nonce: input.pendingNonce + offset }).toLowerCase();
  const addresses = {
    token: addressAt(0),
    timelock: addressAt(1),
    governor: addressAt(2),
    policyRegistry: addressAt(3),
    treasuryGuard: addressAt(4),
  };

  const tokenInit = initCode(artifacts.token, ["address", "uint256"], [deployer, initialSupply]);
  const timelockInit = initCode(
    artifacts.timelock,
    ["uint256", "address[]", "address[]", "address"],
    [input.timelockDelaySeconds, [], [OPEN_EXECUTOR], deployer],
  );
  const governorInit = initCode(
    artifacts.governor,
    ["address", "address", "uint48", "uint32", "uint256", "uint256"],
    [
      addresses.token,
      addresses.timelock,
      input.votingDelayBlocks,
      input.votingPeriodBlocks,
      proposalThreshold,
      input.quorumNumerator,
    ],
  );
  const registryInit = initCode(artifacts.policyRegistry, ["address"], [addresses.timelock]);
  const guardInit = initCode(
    artifacts.treasuryGuard,
    ["address", "address", "address"],
    [addresses.timelock, guardian, addresses.policyRegistry],
  );

  const deploymentInputs = [tokenInit, timelockInit, governorInit, registryInit, guardInit];
  const deploymentNames = ["AEOSGovernanceToken", "TimelockController", "AEOSGovernor", "PolicyRegistry", "TreasuryGuard"];
  const deploymentAddresses = Object.values(addresses);
  const freezeTransaction = <T extends { sequence: number; nonce: number; to: string | null; value: string; data: string }>(transaction: T) => ({
    ...transaction,
    dataHash: keccak256(transaction.data),
    requestHash: sha256({
      sequence: transaction.sequence,
      nonce: transaction.nonce,
      to: transaction.to,
      value: transaction.value,
      data: transaction.data,
    }),
  });
  const deploymentTransactions = deploymentInputs.map((transaction, index) => freezeTransaction({
    sequence: index + 1,
    nonce: input.pendingNonce + index,
    contract: deploymentNames[index],
    predictedAddress: deploymentAddresses[index],
    to: null,
    value: "0x0",
    data: transaction.data,
    initCodeHash: transaction.initCodeHash,
    requiresUserWalletConfirmation: true,
    signed: false,
    submitted: false,
  }));

  const access = new Interface([
    "function grantRole(bytes32 role,address account)",
    "function renounceRole(bytes32 role,address callerConfirmation)",
  ]);
  const roleTransactions = [
    { operation: "GRANT_GOVERNOR_PROPOSER", data: access.encodeFunctionData("grantRole", [PROPOSER_ROLE, addresses.governor]) },
    { operation: "GRANT_GOVERNOR_CANCELLER", data: access.encodeFunctionData("grantRole", [CANCELLER_ROLE, addresses.governor]) },
    { operation: "RENOUNCE_TEMPORARY_ADMIN", data: access.encodeFunctionData("renounceRole", [DEFAULT_ADMIN_ROLE, deployer]) },
  ].map((transaction, index) => freezeTransaction({
    sequence: deploymentTransactions.length + index + 1,
    nonce: input.pendingNonce + deploymentTransactions.length + index,
    ...transaction,
    to: addresses.timelock,
    value: "0x0",
    requiresUserWalletConfirmation: true,
    signed: false,
    submitted: false,
  }));

  const frozen = {
    schemaVersion: "aeos.governance-stack.deployment-plan.v1",
    chainId: input.chainId,
    deployer,
    guardian,
    observedPendingNonce: input.pendingNonce,
    exactNonceSequenceRequired: true,
    addresses,
    settings: {
      initialSupply: initialSupply.toString(),
      timelockDelaySeconds: input.timelockDelaySeconds,
      votingDelayBlocks: input.votingDelayBlocks,
      votingPeriodBlocks: input.votingPeriodBlocks,
      proposalThreshold: proposalThreshold.toString(),
      quorumNumerator: input.quorumNumerator,
      executorPolicy: "OPEN_EXECUTION_AFTER_TIMELOCK_ONLY",
    },
    artifacts: Object.fromEntries(
      Object.entries(artifacts).map(([key, artifact]) => [key, {
        contract: artifact.contract,
        source: artifact.source,
        compiler: artifact.compiler,
        creationBytecodeHash: artifact.creationBytecodeHash,
        runtimeBytecodeHash: artifact.runtimeBytecodeHash,
      }]),
    ),
    deploymentTransactions,
    roleTransactions,
    expectedFinalRoles: {
      timelockSelfAdmin: true,
      deployerAdmin: false,
      governorProposer: true,
      governorCanceller: true,
      openExecutor: true,
    },
    safe: {
      status: "EXTERNAL_PENDING",
      reason: "NO_VERIFIED_OFFICIAL_SAFE_SINGLETON_OR_FACTORY_CODE_ON_CHAIN_102031",
    },
    warning: "Any nonce drift invalidates every later predicted address. Stop and regenerate before submission.",
    readsOnly: false,
    signed: false,
    submitted: false,
    containsPrivateKey: false,
    aeosSigningCapability: false,
    aeosBroadcastCapability: false,
    assetExecutionAuthorized: false,
  };
  return { ...frozen, planHash: sha256(frozen) };
}
