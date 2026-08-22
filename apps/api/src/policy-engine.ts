export type TreasuryPolicyConfig = {
  minimumEvidenceQuality: number;
  targetAllocationBps: number;
  pid: { kpBps: number; kiBps: number; kdBps: number; deadbandBps: number; maxAdjustmentBps: number; integralLimitBps: number };
  riskLimits: { maxSingleAdjustmentBps: number; maxSlippageBps: number; minLiquidityUsd: string; maxDailyTurnoverUsd: string; allowedTargetContracts: string[]; allowedFunctionSelectors: string[] };
  adaptivePid?: import("./adaptive-pid-engine").AdaptivePidEnvelope;
  governedSkillVersionIds?: string[];
};
export type PolicySimulationInput = { observedAllocationBps: number; previousErrorBps: number; integralErrorBps: number; deltaTimeSeconds: number; requestedSlippageBps: number; liquidityUsd: string; dailyTurnoverUsd: string; targetContract: string; functionSelector: string; evidenceSnapshotId: string; estimatedGasUnits: string; maxFeePerGasWei: string; nativeBalanceBeforeWei: string; tokenBalanceBeforeBaseUnits: string; transferAmountBaseUnits: string };
export type RiskCheck = { code: string; passed: boolean; actual: string | number | boolean; limit: string | number | boolean };

const integer = (value: unknown, min: number, max: number, field: string) => { if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) throw new Error(`INVALID_${field.toUpperCase()}`); return value as number; };
const amount = (value: unknown, field: string) => { if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,77})$/.test(value)) throw new Error(`INVALID_${field.toUpperCase()}`); return BigInt(value); };
const boundedAmount = (value: bigint, field: string) => { const text=value.toString(); if(text.length>78)throw new Error(`${field.toUpperCase()}_PRECISION_EXCEEDED`); return text; };
const address = /^0x[0-9a-fA-F]{40}$/;
const selector = /^0x[0-9a-fA-F]{8}$/;
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

export function validateTreasuryPolicy(config: TreasuryPolicyConfig): TreasuryPolicyConfig {
  integer(config.minimumEvidenceQuality, 0, 100, "minimumEvidenceQuality");
  integer(config.targetAllocationBps, 0, 10_000, "targetAllocationBps");
  integer(config.pid.kpBps, 0, 50_000, "kpBps"); integer(config.pid.kiBps, 0, 50_000, "kiBps"); integer(config.pid.kdBps, 0, 50_000, "kdBps");
  integer(config.pid.deadbandBps, 0, 10_000, "deadbandBps"); integer(config.pid.maxAdjustmentBps, 0, 10_000, "maxAdjustmentBps"); integer(config.pid.integralLimitBps, 0, 1_000_000, "integralLimitBps");
  integer(config.riskLimits.maxSingleAdjustmentBps, 0, 10_000, "maxSingleAdjustmentBps"); integer(config.riskLimits.maxSlippageBps, 0, 10_000, "maxSlippageBps");
  amount(config.riskLimits.minLiquidityUsd, "minLiquidityUsd"); amount(config.riskLimits.maxDailyTurnoverUsd, "maxDailyTurnoverUsd");
  if (!Array.isArray(config.riskLimits.allowedTargetContracts) || !config.riskLimits.allowedTargetContracts.length || config.riskLimits.allowedTargetContracts.some((item) => !address.test(item))) throw new Error("INVALID_ALLOWED_TARGET_CONTRACTS");
  if (!Array.isArray(config.riskLimits.allowedFunctionSelectors) || !config.riskLimits.allowedFunctionSelectors.length || config.riskLimits.allowedFunctionSelectors.some((item) => !selector.test(item))) throw new Error("INVALID_ALLOWED_FUNCTION_SELECTORS");
  if (config.pid.maxAdjustmentBps > config.riskLimits.maxSingleAdjustmentBps) throw new Error("PID_LIMIT_EXCEEDS_HARD_RISK_LIMIT");
  if(config.adaptivePid){const envelope=config.adaptivePid;if(envelope.enabled!==true)throw new Error("ADAPTIVE_PID_NOT_GOVERNED");for(const field of ["kpMinBps","kpMaxBps","kiMinBps","kiMaxBps","kdMinBps","kdMaxBps","maxGainStepBps"] as const)integer(envelope[field],0,50_000,field);integer(envelope.derivativeFilterBps,0,10_000,"derivativeFilterBps");integer(envelope.maxOutputBps,0,10_000,"maxOutputBps");integer(envelope.maxOutputRateBps,0,10_000,"maxOutputRateBps");integer(envelope.minimumEvidenceConfidenceBps,0,10_000,"minimumEvidenceConfidenceBps");integer(envelope.volatileThresholdBps,1,100_000,"volatileThresholdBps");integer(envelope.liquidityStressThresholdBps,1,10_000,"liquidityStressThresholdBps");integer(envelope.blackSwanDeviationBps,1,10_000,"blackSwanDeviationBps");if(envelope.evidenceObservation){integer(envelope.evidenceObservation.samplePeriodMs,10,86_400_000,"samplePeriodMs");integer(envelope.evidenceObservation.maxMetricSkewMs,1,86_400_000,"maxMetricSkewMs");if(envelope.evidenceObservation.predicateSetVersion!=="treasury.observed-state.v1")throw new Error("INVALID_OBSERVED_STATE_PREDICATE_VERSION")}if(envelope.kpMinBps>envelope.kpMaxBps||envelope.kiMinBps>envelope.kiMaxBps||envelope.kdMinBps>envelope.kdMaxBps)throw new Error("ADAPTIVE_PID_GAIN_RANGE_INVALID");if(config.pid.kpBps<envelope.kpMinBps||config.pid.kpBps>envelope.kpMaxBps||config.pid.kiBps<envelope.kiMinBps||config.pid.kiBps>envelope.kiMaxBps||config.pid.kdBps<envelope.kdMinBps||config.pid.kdBps>envelope.kdMaxBps)throw new Error("BASE_PID_OUTSIDE_GOVERNED_ENVELOPE");if(envelope.maxOutputBps>config.pid.maxAdjustmentBps||envelope.maxOutputBps>config.riskLimits.maxSingleAdjustmentBps)throw new Error("ADAPTIVE_OUTPUT_EXCEEDS_HARD_LIMIT");}
  if(config.governedSkillVersionIds!==undefined){if(!Array.isArray(config.governedSkillVersionIds)||config.governedSkillVersionIds.length>8||new Set(config.governedSkillVersionIds).size!==config.governedSkillVersionIds.length||config.governedSkillVersionIds.some(id=>typeof id!=="string"||!/^skillv_[0-9a-z]+$/i.test(id)))throw new Error("INVALID_GOVERNED_SKILL_VERSION_IDS");config.governedSkillVersionIds=[...config.governedSkillVersionIds].sort()}
  return config;
}

export function simulatePolicy(config: TreasuryPolicyConfig, input: PolicySimulationInput, evidenceEligible: boolean) {
  validateTreasuryPolicy(config);
  integer(input.observedAllocationBps, 0, 10_000, "observedAllocationBps"); integer(input.previousErrorBps, -10_000, 10_000, "previousErrorBps"); integer(input.integralErrorBps, -1_000_000, 1_000_000, "integralErrorBps");
  integer(input.deltaTimeSeconds, 1, 604_800, "deltaTimeSeconds"); integer(input.requestedSlippageBps, 0, 10_000, "requestedSlippageBps");
  const liquidity = amount(input.liquidityUsd, "liquidityUsd"); const turnover = amount(input.dailyTurnoverUsd, "dailyTurnoverUsd");
  const estimatedGasUnits=amount(input.estimatedGasUnits,"estimatedGasUnits");const maxFeePerGasWei=amount(input.maxFeePerGasWei,"maxFeePerGasWei");
  const nativeBefore=amount(input.nativeBalanceBeforeWei,"nativeBalanceBeforeWei");const tokenBefore=amount(input.tokenBalanceBeforeBaseUnits,"tokenBalanceBeforeBaseUnits");const transferAmount=amount(input.transferAmountBaseUnits,"transferAmountBaseUnits");
  if(estimatedGasUnits===0n)throw new Error("INVALID_ESTIMATEDGASUNITS");if(transferAmount===0n)throw new Error("INVALID_TRANSFERAMOUNTBASEUNITS");
  const gasCostWei=estimatedGasUnits*maxFeePerGasWei;const gasCost=boundedAmount(gasCostWei,"gasCostWei");const nativeSufficient=nativeBefore>=gasCostWei;const tokenSufficient=tokenBefore>=transferAmount;
  if (!address.test(input.targetContract) || !selector.test(input.functionSelector)) throw new Error("INVALID_ACTION_TARGET");
  const errorBps = config.targetAllocationBps - input.observedAllocationBps;
  const integralDelta = Math.trunc(errorBps * input.deltaTimeSeconds / 86_400);
  const integralBps = clamp(input.integralErrorBps + integralDelta, config.pid.integralLimitBps);
  const derivativeBpsPerDay = Math.trunc((errorBps - input.previousErrorBps) * 86_400 / input.deltaTimeSeconds);
  const withinDeadband = Math.abs(errorBps) <= config.pid.deadbandBps;
  const rawAdjustmentBps = withinDeadband ? 0 : Math.trunc((config.pid.kpBps * errorBps + config.pid.kiBps * integralBps + config.pid.kdBps * derivativeBpsPerDay) / 10_000);
  const limitedAdjustmentBps = clamp(rawAdjustmentBps, config.pid.maxAdjustmentBps);
  const checks: RiskCheck[] = [
    { code: "EVIDENCE_ELIGIBLE", passed: evidenceEligible, actual: evidenceEligible, limit: true },
    { code: "SINGLE_ADJUSTMENT_LIMIT", passed: Math.abs(limitedAdjustmentBps) <= config.riskLimits.maxSingleAdjustmentBps, actual: Math.abs(limitedAdjustmentBps), limit: config.riskLimits.maxSingleAdjustmentBps },
    { code: "SLIPPAGE_LIMIT", passed: input.requestedSlippageBps <= config.riskLimits.maxSlippageBps, actual: input.requestedSlippageBps, limit: config.riskLimits.maxSlippageBps },
    { code: "MINIMUM_LIQUIDITY", passed: liquidity >= BigInt(config.riskLimits.minLiquidityUsd), actual: input.liquidityUsd, limit: config.riskLimits.minLiquidityUsd },
    { code: "DAILY_TURNOVER_LIMIT", passed: turnover <= BigInt(config.riskLimits.maxDailyTurnoverUsd), actual: input.dailyTurnoverUsd, limit: config.riskLimits.maxDailyTurnoverUsd },
    { code: "TARGET_ALLOWLIST", passed: config.riskLimits.allowedTargetContracts.map((item) => item.toLowerCase()).includes(input.targetContract.toLowerCase()), actual: input.targetContract.toLowerCase(), limit: true },
    { code: "FUNCTION_ALLOWLIST", passed: config.riskLimits.allowedFunctionSelectors.map((item) => item.toLowerCase()).includes(input.functionSelector.toLowerCase()), actual: input.functionSelector.toLowerCase(), limit: true },
    { code: "NATIVE_GAS_BALANCE", passed: nativeSufficient, actual: input.nativeBalanceBeforeWei, limit: gasCost },
    { code: "TOKEN_TRANSFER_BALANCE", passed: tokenSufficient, actual: input.tokenBalanceBeforeBaseUnits, limit: input.transferAmountBaseUnits },
  ];
  const passed = checks.every((check) => check.passed);
  const transactionImpact={schemaVersion:"treasury.transaction-impact.v1",sourceMode:"MOCK_DETERMINISTIC_INPUT",onchainEstimateVerified:false,gas:{estimatedGasUnits:input.estimatedGasUnits,maxFeePerGasWei:input.maxFeePerGasWei,maximumCostWei:gasCost},nativeBalance:{beforeWei:input.nativeBalanceBeforeWei,afterMaximumGasWei:nativeSufficient?boundedAmount(nativeBefore-gasCostWei,"nativeBalanceAfterWei"):null},tokenBalance:{beforeBaseUnits:input.tokenBalanceBeforeBaseUnits,transferBaseUnits:input.transferAmountBaseUnits,afterBaseUnits:tokenSufficient?boundedAmount(tokenBefore-transferAmount,"tokenBalanceAfterBaseUnits"):null},valueTransferredWei:"0",deterministicOnly:true,assetExecutionAuthorized:false};
  return { schemaVersion: "treasury.simulation.v2", status: passed ? "SUGGESTED" : "BLOCKED", targetAllocationBps: config.targetAllocationBps, observedAllocationBps: input.observedAllocationBps, errorBps, integralBps, derivativeBpsPerDay, rawAdjustmentBps, limitedAdjustmentBps, suggestedAdjustmentBps: passed ? limitedAdjustmentBps : 0, withinDeadband, transactionImpact, riskChecks: checks, allRiskChecksVisible:true, blockers: checks.filter((check) => !check.passed).map((check) => check.code), advisoryOnly: true, assetExecutionAuthorized: false } as const;
}
