import { AbiCoder, Interface, keccak256 } from "ethers";
import { GuardSnapshot } from "./treasury-guard-adapter";

const guardInterface = new Interface(["function authorizeAction(bytes32 actionId,address target,uint256 value,bytes data,bytes32 expectedPolicyHash,uint64 expectedPolicyVersion,uint64 deadline) returns(bytes4)"]);
export type PreflightCheck = { code: string; passed: boolean; actual: unknown; expected: unknown };

export function executionActionId(proposalContentHash: string, governancePayloadHash: string, policyContentHash: string) { return keccak256(AbiCoder.defaultAbiCoder().encode(["bytes32","bytes32","bytes32"], [proposalContentHash, governancePayloadHash, policyContentHash])); }

export function buildExecutionPreflight(input: {
  proposal: any; policy: any; governance: any; guard: GuardSnapshot; evidenceEligible: boolean;
  resimulation: any; actionId: string; actionCalldata: string; actionTarget: string; actionSelector: string;
  deadline: number; expiresAt: string;
}) {
  const checks: PreflightCheck[] = [
    { code: "GOVERNANCE_QUEUED", passed: input.governance?.state === "QUEUED", actual: input.governance?.state ?? null, expected: "QUEUED" },
    { code: "GOVERNANCE_FINALITY", passed: input.governance?.payload?.onchainFinalityVerified === true && input.governance?.payload?.mockOnly === false, actual: input.governance?.payload?.onchainFinalityVerified ?? false, expected: true },
    { code: "GOVERNANCE_PROPOSAL_ID", passed: input.governance?.external_proposal_id === input.proposal.content.governor.proposalId, actual: input.governance?.external_proposal_id ?? null, expected: input.proposal.content.governor.proposalId },
    { code: "POLICY_ACTIVE", passed: input.policy.status === "ACTIVE", actual: input.policy.status, expected: "ACTIVE" },
    { code: "POLICY_CONTENT_HASH", passed: input.policy.content_hash === input.proposal.content.policy.contentHash, actual: input.policy.content_hash, expected: input.proposal.content.policy.contentHash },
    { code: "EVIDENCE_ELIGIBLE", passed: input.evidenceEligible, actual: input.evidenceEligible, expected: true },
    { code: "RESIMULATION_PASSED", passed: input.resimulation.status === "SUGGESTED" && input.resimulation.blockers.length === 0, actual: input.resimulation.status, expected: "SUGGESTED" },
    { code: "CALLDATA_CONSISTENCY", passed: input.actionCalldata.toLowerCase() === input.proposal.calldatas[0].toLowerCase() && input.actionTarget === input.proposal.targets[0].toLowerCase(), actual: input.actionSelector, expected: input.proposal.calldatas[0].slice(0,10).toLowerCase() },
    { code: "GUARD_ONCHAIN_READ", passed: input.guard.mode === "evm-readonly" && input.guard.onchainReadVerified, actual: input.guard.mode, expected: "evm-readonly" },
    { code: "GUARD_NOT_PAUSED", passed: input.guard.paused === false, actual: input.guard.paused, expected: false },
    { code: "GUARD_CHAIN_MATCH", passed: input.guard.chainId === input.governance?.chain_id, actual: input.guard.chainId, expected: input.governance?.chain_id ?? null },
    { code: "GUARD_POLICY_REGISTRY_BOUND", passed: /^0x[0-9a-f]{40}$/.test(input.guard.policyRegistry??"") && input.guard.policyRegistry !== input.guard.address, actual: input.guard.policyRegistry, expected: "distinct onchain PolicyRegistry" },
    { code: "GUARD_POLICY_REGISTRY_SNAPSHOT", passed: input.guard.policyRegistryBindingVerified === true, actual: { verified: input.guard.policyRegistryBindingVerified, policyHash: input.guard.registryPolicyHash, validFrom: input.guard.registryPolicyValidFrom, validUntil: input.guard.registryPolicyValidUntil }, expected: "same confirmed-block PolicyRegistry record equals Guard snapshot" },
    { code: "GUARD_POLICY_HASH", passed: input.guard.policyHash === input.policy.content_hash.toLowerCase(), actual: input.guard.policyHash, expected: input.policy.content_hash.toLowerCase() },
    { code: "GUARD_POLICY_VERSION", passed: input.guard.policyVersion === input.policy.version, actual: input.guard.policyVersion, expected: input.policy.version },
    { code: "GUARD_POLICY_VALID_AT_DEADLINE", passed: input.guard.policyValidFrom!==null&&input.guard.policyValidUntil!==null&&input.guard.policyValidFrom<input.guard.policyValidUntil&&input.deadline>=input.guard.policyValidFrom&&input.deadline<=input.guard.policyValidUntil, actual:{validFrom:input.guard.policyValidFrom,validUntil:input.guard.policyValidUntil,deadline:input.deadline},expected:"validFrom <= deadline <= validUntil" },
    { code: "GUARD_TARGET_ALLOWED", passed: input.guard.targetAllowed, actual: input.guard.targetAllowed, expected: true },
    { code: "GUARD_SELECTOR_ALLOWED", passed: input.guard.selectorAllowed, actual: input.guard.selectorAllowed, expected: true },
    { code: "ACTION_NOT_CONSUMED", passed: !input.guard.actionConsumed, actual: input.guard.actionConsumed, expected: false },
  ];
  const ready = checks.every((check) => check.passed);
  const safeHandoff = ready && input.guard.address ? { schemaVersion: "safe.transaction.v1", to: input.guard.address, value: "0", data: guardInterface.encodeFunctionData("authorizeAction", [input.actionId, input.actionTarget, 0n, input.actionCalldata, input.policy.content_hash, input.policy.version, input.deadline]), operation: 0, safeTxGas: "0", signed: false, submitted: false, executesAssetTransfer: false } : null;
  return { schemaVersion: "execution.preflight.v1", status: ready ? "READY_FOR_SAFE_REVIEW" : "BLOCKED", actionId: input.actionId, checks, blockers: checks.filter((check) => !check.passed).map((check) => check.code), resimulation: input.resimulation, guardSnapshot: input.guard, expiresAt: input.expiresAt, safeHandoff, humanSafeReviewRequired: true, signed: false, submitted: false, assetExecutionAuthorized: false } as const;
}
