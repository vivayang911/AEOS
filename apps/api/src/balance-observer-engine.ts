import { AbiCoder, Interface, concat, getAddress, keccak256, zeroPadValue } from "ethers";
import { createHash } from "node:crypto";

export const BALANCE_OBSERVER_CHAIN_ID = 11155111;

const observerInterface = new Interface([
  "function observeBalance(bytes32 observationId,bytes32 organizationCommitment,bytes32 treasuryCommitment,address token,address account,bytes32 expectedTokenCodeHash) returns(bytes32)",
]);
const observerEventInterface = new Interface([
  "event BalanceObserved(bytes32 indexed observationId,bytes32 indexed organizationCommitment,bytes32 indexed treasuryCommitment,address token,address account,bytes32 tokenCodeHash,uint256 balance,uint256 sourceBlockNumber,uint64 observedAt,address reporter,uint256 sourceChainId,bytes32 commitment)",
]);
const digestPattern = /^0x[0-9a-fA-F]{64}$/;
const bytecodePattern = /^0x[0-9a-fA-F]+$/;
const canonical = (value: unknown): string => Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`
    : JSON.stringify(value);
const sha256 = (value: unknown) => `0x${createHash("sha256").update(canonical(value)).digest("hex")}`;
const bounded = (value: string, code: string) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) throw new Error(code);
  return normalized;
};
const address = (value: string, code: string) => {
  const normalized = getAddress(value).toLowerCase();
  if (normalized === "0x0000000000000000000000000000000000000000") throw new Error(code);
  return normalized;
};
const bytecode = (value: string, code: string) => {
  if (!bytecodePattern.test(value) || value.length < 4 || value.length % 2 !== 0) throw new Error(code);
  return value;
};

function deriveCommitments(input: { organizationId: string; treasuryId: string; observationKey: string }) {
  const organizationId = bounded(input.organizationId, "ORGANIZATION_ID_INVALID");
  const treasuryId = bounded(input.treasuryId, "TREASURY_ID_INVALID");
  const observationKey = bounded(input.observationKey, "OBSERVATION_KEY_INVALID");
  const coder = AbiCoder.defaultAbiCoder();
  const organizationCommitment = keccak256(coder.encode(["string", "string"], ["aeos.organization.v1", organizationId]));
  const treasuryCommitment = keccak256(coder.encode(["string", "bytes32", "string"], ["aeos.treasury.v1", organizationCommitment, treasuryId]));
  const observationId = keccak256(coder.encode(["string", "bytes32", "string"], ["aeos.balance-observation.v1", treasuryCommitment, observationKey]));
  return { organizationCommitment, treasuryCommitment, observationId };
}

function validateFrozenCommitments(input: { organizationCommitment: string; treasuryCommitment: string; observationKey: string }) {
  if (!digestPattern.test(input.organizationCommitment) || !digestPattern.test(input.treasuryCommitment)) throw new Error("BALANCE_OBSERVER_TENANT_COMMITMENT_INVALID");
  const observationKey = bounded(input.observationKey, "OBSERVATION_KEY_INVALID");
  const organizationCommitment = input.organizationCommitment.toLowerCase();
  const treasuryCommitment = input.treasuryCommitment.toLowerCase();
  const observationId = keccak256(AbiCoder.defaultAbiCoder().encode(["string", "bytes32", "string"], ["aeos.balance-observation.v1", treasuryCommitment, observationKey]));
  return { organizationCommitment, treasuryCommitment, observationId };
}

type ImmutableReference = { start: number; length: number };

export function materializeBalanceObserverRuntimeBytecode(input: { runtimeBytecode: string; reporter: string; reporterImmutableReferences?: ImmutableReference[] }) {
  const template = bytecode(input.runtimeBytecode, "BALANCE_OBSERVER_BYTECODE_INVALID");
  const reporter = address(input.reporter, "BALANCE_OBSERVER_REPORTER_INVALID");
  const references = input.reporterImmutableReferences ?? [];
  if (references.length === 0) return template;
  const replacement = zeroPadValue(reporter, 32).slice(2);
  let body = template.slice(2);
  const occupied = new Set<number>();
  for (const reference of references) {
    if (!Number.isSafeInteger(reference.start) || reference.start < 0 || reference.length !== 32 || (reference.start + reference.length) * 2 > body.length) throw new Error("BALANCE_OBSERVER_IMMUTABLE_REFERENCE_INVALID");
    for (let offset = reference.start; offset < reference.start + reference.length; offset += 1) {
      if (occupied.has(offset)) throw new Error("BALANCE_OBSERVER_IMMUTABLE_REFERENCE_INVALID");
      occupied.add(offset);
    }
    body = `${body.slice(0, reference.start * 2)}${replacement}${body.slice((reference.start + reference.length) * 2)}`;
  }
  return `0x${body}`;
}

export function buildBalanceObserverDeploymentPlan(input: {
  chainId: number;
  reporter: string;
  creationBytecode: string;
  runtimeBytecode: string;
  reporterImmutableReferences?: ImmutableReference[];
  artifactCompiler: string;
  artifactSource: string;
}) {
  if (input.chainId !== BALANCE_OBSERVER_CHAIN_ID) throw new Error("BALANCE_OBSERVER_DEPLOYMENT_CHAIN_INVALID");
  const reporter = address(input.reporter, "BALANCE_OBSERVER_REPORTER_INVALID");
  const creationBytecode = bytecode(input.creationBytecode, "BALANCE_OBSERVER_BYTECODE_INVALID");
  const runtimeBytecode = bytecode(input.runtimeBytecode, "BALANCE_OBSERVER_BYTECODE_INVALID");
  const expectedRuntimeBytecode = materializeBalanceObserverRuntimeBytecode({ runtimeBytecode, reporter, reporterImmutableReferences: input.reporterImmutableReferences });
  const data = concat([creationBytecode, AbiCoder.defaultAbiCoder().encode(["address"], [reporter])]);
  const frozen = {
    schemaVersion: "aeos-balance-observer.deployment-plan.v1",
    chainId: input.chainId,
    contract: "AEOSBalanceObserver",
    artifact: {
      source: input.artifactSource,
      compiler: input.artifactCompiler,
      creationBytecodeHash: keccak256(creationBytecode),
      runtimeBytecodeTemplateHash: keccak256(runtimeBytecode),
      runtimeBytecodeHash: keccak256(expectedRuntimeBytecode),
      reporterImmutableReferences: input.reporterImmutableReferences ?? [],
    },
    constructor: { reporter },
    unsignedTransaction: { to: null, value: "0", data, initCodeHash: keccak256(data) },
    expectedReadback: { reporter },
    requiresUserWalletConfirmation: true,
    signed: false,
    submitted: false,
    containsPrivateKey: false,
    aeosSigningCapability: false,
    aeosBroadcastCapability: false,
    assetExecutionAuthorized: false,
  } as const;
  return { ...frozen, planHash: sha256(frozen) };
}

export function verifyBalanceObserverDeploymentReadback(input: {
  expectedChainId: number;
  actualChainId: number;
  expectedReporter: string;
  actualReporter: string;
  expectedInitCodeHash: string;
  expectedRuntimeBytecodeHash: string;
  deploymentTransactionData: string;
  deploymentTransactionTo: string | null;
  deploymentTransactionValue: string;
  deploymentTransactionHash: string;
  receiptStatus: number | null;
  receiptTo: string | null;
  receiptContractAddress: string | null;
  receiptBlockNumber: number;
  latestBlockNumber: number;
  minimumConfirmations: number;
  address: string;
  runtimeBytecode: string;
}) {
  const deployedAddress = address(input.address, "BALANCE_OBSERVER_ADDRESS_INVALID");
  const confirmations = input.latestBlockNumber - input.receiptBlockNumber + 1;
  let runtimeHash = "INVALID";
  let initCodeHash = "INVALID";
  try { runtimeHash = keccak256(bytecode(input.runtimeBytecode, "BALANCE_OBSERVER_BYTECODE_INVALID")); } catch {}
  try { initCodeHash = keccak256(bytecode(input.deploymentTransactionData, "BALANCE_OBSERVER_BYTECODE_INVALID")); } catch {}
  const checks = [
    { code: "CHAIN_ID_MATCH", passed: input.expectedChainId === BALANCE_OBSERVER_CHAIN_ID && input.actualChainId === input.expectedChainId },
    { code: "RUNTIME_CODE_MATCH", passed: runtimeHash === input.expectedRuntimeBytecodeHash.toLowerCase() },
    { code: "REPORTER_MATCH", passed: getAddress(input.actualReporter) === getAddress(input.expectedReporter) },
    { code: "DEPLOYMENT_TRANSACTION_HASH_VALID", passed: digestPattern.test(input.deploymentTransactionHash) },
    { code: "DEPLOYMENT_INIT_CODE_MATCH", passed: initCodeHash === input.expectedInitCodeHash.toLowerCase() },
    { code: "CONTRACT_CREATION_ZERO_VALUE", passed: input.deploymentTransactionTo === null && input.deploymentTransactionValue === "0" },
    { code: "RECEIPT_SUCCESS", passed: input.receiptStatus === 1 },
    { code: "CONTRACT_CREATION_RECEIPT", passed: input.receiptTo === null && input.receiptContractAddress !== null && getAddress(input.receiptContractAddress ?? deployedAddress).toLowerCase() === deployedAddress },
    { code: "FINALITY", passed: Number.isSafeInteger(input.minimumConfirmations) && input.minimumConfirmations >= 1 && confirmations >= input.minimumConfirmations },
  ];
  return {
    schemaVersion: "aeos-balance-observer.deployment-verification.v1",
    status: checks.every((check) => check.passed) ? "VERIFIED" : "REJECTED",
    address: deployedAddress,
    deploymentTransactionHash: input.deploymentTransactionHash.toLowerCase(),
    confirmations,
    minimumConfirmations: input.minimumConfirmations,
    checks,
    signed: false,
    submitted: false,
    containsPrivateKey: false,
    aeosSigningCapability: false,
    aeosBroadcastCapability: false,
    assetExecutionAuthorized: false,
  };
}

type BalanceObservationBase = {
  chainId: number;
  observerContract: string;
  reporter: string;
  observationKey: string;
  token: string;
  account: string;
  tokenRuntimeBytecode: string;
};

function buildBalanceObservationRequestWithCommitments(input: BalanceObservationBase, commitments: { organizationCommitment: string; treasuryCommitment: string; observationId: string }) {
  if (input.chainId !== BALANCE_OBSERVER_CHAIN_ID) throw new Error("BALANCE_OBSERVER_CHAIN_INVALID");
  const observerContract = address(input.observerContract, "BALANCE_OBSERVER_ADDRESS_INVALID");
  const reporter = address(input.reporter, "BALANCE_OBSERVER_REPORTER_INVALID");
  const token = address(input.token, "BALANCE_OBSERVER_TOKEN_INVALID");
  const account = address(input.account, "BALANCE_OBSERVER_ACCOUNT_INVALID");
  const tokenCodeHash = keccak256(bytecode(input.tokenRuntimeBytecode, "BALANCE_OBSERVER_TOKEN_CODE_INVALID"));
  const data = observerInterface.encodeFunctionData("observeBalance", [
    commitments.observationId,
    commitments.organizationCommitment,
    commitments.treasuryCommitment,
    token,
    account,
    tokenCodeHash,
  ]);
  const frozen = {
    schemaVersion: "aeos-balance-observer.observation-request.v1",
    chainId: input.chainId,
    observerContract,
    reporter,
    observation: { ...commitments, token, account, tokenCodeHash },
    truthBoundary: {
      intendedClaim: "ERC20_BALANCE_RETURNED_DURING_INCLUDED_SOURCE_TRANSACTION",
      tokenSemanticIdentityRequiresIndependentAddressAndRuntimeReview: true,
      priceVerified: false,
      liquidityVerified: false,
    },
    unsignedTransaction: { from: reporter, to: observerContract, value: "0", data, dataHash: keccak256(data) },
    requiresUserWalletConfirmation: true,
    signed: false,
    submitted: false,
    containsPrivateKey: false,
    aeosSigningCapability: false,
    aeosBroadcastCapability: false,
    assetExecutionAuthorized: false,
  } as const;
  return { ...frozen, requestHash: sha256(frozen) };
}

export function buildBalanceObservationRequest(input: BalanceObservationBase & { organizationId: string; treasuryId: string }) {
  return buildBalanceObservationRequestWithCommitments(input, deriveCommitments(input));
}

export function buildBalanceObservationRequestFromCommitments(input: BalanceObservationBase & { organizationCommitment: string; treasuryCommitment: string }) {
  return buildBalanceObservationRequestWithCommitments(input, validateFrozenCommitments(input));
}

type ObservationRequest = ReturnType<typeof buildBalanceObservationRequest>;

export function verifyBalanceObservationReceipt(input: {
  request: ObservationRequest;
  expectedTransactionHash: string;
  expectedNonce: number;
  minimumConfirmations: number;
  transaction: { hash: string; from: string; to: string | null; data: string; value: string; nonce: number };
  receipt: { hash: string; status: number | null; from: string; to: string | null; blockNumber: number; blockHash: string; logs: { address: string; topics: readonly string[]; data: string }[] };
  latestBlockNumber: number;
  canonicalBlockHash: string;
  canonicalBlockTimestamp: number;
  tokenRuntimeBytecode: string;
  storedCommitment: string;
  storedBalance: string;
}) {
  const request = input.request;
  const expectedHash = input.expectedTransactionHash.toLowerCase();
  const confirmations = input.latestBlockNumber - input.receipt.blockNumber + 1;
  const parsed = input.receipt.logs
    .filter((log) => log.address.toLowerCase() === request.observerContract)
    .map((log) => { try { return observerEventInterface.parseLog({ topics: [...log.topics], data: log.data }); } catch { return null; } })
    .filter((event): event is NonNullable<typeof event> => event?.name === "BalanceObserved");
  const event = parsed.length === 1 ? parsed[0] : null;
  const args = event?.args;
  const eventBalance = args ? String(args.balance) : "";
  const eventBlock = args ? Number(args.sourceBlockNumber) : -1;
  const eventObservedAt = args ? Number(args.observedAt) : -1;
  const expectedCommitment = args ? keccak256(AbiCoder.defaultAbiCoder().encode(
    ["uint256", "address", "bytes32", "bytes32", "bytes32", "address", "address", "bytes32", "uint256", "uint256", "uint64", "address"],
    [request.chainId, request.observerContract, request.observation.observationId, request.observation.organizationCommitment, request.observation.treasuryCommitment, request.observation.token, request.observation.account, request.observation.tokenCodeHash, eventBalance, eventBlock, eventObservedAt, request.reporter],
  )) : "";
  let observedTokenCodeHash = "";
  try { observedTokenCodeHash = keccak256(bytecode(input.tokenRuntimeBytecode, "BALANCE_OBSERVER_TOKEN_CODE_INVALID")); } catch { observedTokenCodeHash = "INVALID"; }
  const checks = [
    { code: "CHAIN_ID", passed: request.chainId === BALANCE_OBSERVER_CHAIN_ID },
    { code: "TRANSACTION_HASH", passed: digestPattern.test(expectedHash) && input.transaction.hash.toLowerCase() === expectedHash && input.receipt.hash.toLowerCase() === expectedHash },
    { code: "TRANSACTION_ROUTE", passed: input.transaction.from.toLowerCase() === request.reporter && (input.transaction.to ?? "").toLowerCase() === request.observerContract },
    { code: "TRANSACTION_CALLDATA", passed: input.transaction.data.toLowerCase() === request.unsignedTransaction.data.toLowerCase() && keccak256(input.transaction.data) === request.unsignedTransaction.dataHash },
    { code: "ZERO_VALUE", passed: input.transaction.value === "0" },
    { code: "NONCE", passed: input.transaction.nonce === input.expectedNonce },
    { code: "RECEIPT_SUCCESS", passed: input.receipt.status === 1 && input.receipt.from.toLowerCase() === request.reporter && (input.receipt.to ?? "").toLowerCase() === request.observerContract },
    { code: "CANONICAL_BLOCK", passed: input.receipt.blockHash.toLowerCase() === input.canonicalBlockHash.toLowerCase() },
    { code: "FINALITY", passed: Number.isSafeInteger(input.minimumConfirmations) && input.minimumConfirmations >= 1 && confirmations >= input.minimumConfirmations },
    { code: "TOKEN_RUNTIME_IDENTITY", passed: observedTokenCodeHash === request.observation.tokenCodeHash },
    { code: "EVENT_COUNT", passed: parsed.length === 1 },
    { code: "EVENT_FIELDS", passed: Boolean(args
      && String(args.observationId).toLowerCase() === request.observation.observationId
      && String(args.organizationCommitment).toLowerCase() === request.observation.organizationCommitment
      && String(args.treasuryCommitment).toLowerCase() === request.observation.treasuryCommitment
      && String(args.token).toLowerCase() === request.observation.token
      && String(args.account).toLowerCase() === request.observation.account
      && String(args.tokenCodeHash).toLowerCase() === request.observation.tokenCodeHash
      && eventBlock === input.receipt.blockNumber
      && eventObservedAt === input.canonicalBlockTimestamp
      && String(args.reporter).toLowerCase() === request.reporter
      && Number(args.sourceChainId) === request.chainId
      && String(args.commitment).toLowerCase() === expectedCommitment) },
    { code: "STORAGE_READBACK", passed: Boolean(expectedCommitment) && input.storedCommitment.toLowerCase() === expectedCommitment && input.storedBalance === eventBalance },
  ];
  const status = checks.every((check) => check.passed) ? "VERIFIED" : "REJECTED";
  return {
    schemaVersion: "aeos-balance-observer.receipt-verification.v1",
    status,
    verifiedClaim: status === "VERIFIED" ? "ERC20_BALANCE_RETURNED_DURING_INCLUDED_SOURCE_TRANSACTION" : null,
    chainId: request.chainId,
    transactionHash: expectedHash,
    blockNumber: input.receipt.blockNumber,
    blockHash: input.receipt.blockHash.toLowerCase(),
    blockTimestamp: input.canonicalBlockTimestamp,
    confirmations,
    minimumConfirmations: input.minimumConfirmations,
    observationId: request.observation.observationId,
    token: request.observation.token,
    account: request.observation.account,
    tokenCodeHash: request.observation.tokenCodeHash,
    balanceBaseUnits: status === "VERIFIED" ? eventBalance : null,
    commitment: status === "VERIFIED" ? expectedCommitment : null,
    checks,
    truthBoundary: {
      tokenSemanticIdentityRequiresIndependentAddressAndRuntimeReview: true,
      priceVerified: false,
      liquidityVerified: false,
      economicValueOrPerformanceVerified: false,
    },
    privateKeyReceived: false,
    aeosSigningCapability: false,
    aeosBroadcastCapability: false,
    assetExecutionAuthorized: false,
  };
}
