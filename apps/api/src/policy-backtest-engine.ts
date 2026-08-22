import { simulatePolicy, TreasuryPolicyConfig, validateTreasuryPolicy } from "./policy-engine";

export const POLICY_SCENARIO_SUITE_VERSION = "treasury.policy.scenario-suite.v1";
export type BacktestPolicySnapshot = { id: string; version: number; contentHash: string; config: TreasuryPolicyConfig };
type ScenarioName = "STEP_TARGET" | "GRADUAL_DRIFT" | "PRICE_SPIKE" | "DATA_NOISE" | "EXECUTION_DELAY" | "TRANSACTION_FAILURE" | "LIQUIDITY_DECLINE" | "PROLONGED_PAUSE";
type StepResult = { step: number; observedAllocationBps: number; errorBps: number; suggestedAdjustmentBps: number; appliedAdjustmentBps: number; status: "SUGGESTED" | "BLOCKED"; blockers: string[]; executionOutcome: "APPLIED" | "DELAYED" | "FAILED" | "NOT_APPLICABLE" };
const scenarioNames: ScenarioName[] = ["STEP_TARGET", "GRADUAL_DRIFT", "PRICE_SPIKE", "DATA_NOISE", "EXECUTION_DELAY", "TRANSACTION_FAILURE", "LIQUIDITY_DECLINE", "PROLONGED_PAUSE"];
const clampAllocation = (value: number) => Math.max(0, Math.min(10_000, value));

function disturbance(name: ScenarioName, step: number): number {
  if (name === "GRADUAL_DRIFT") return -Math.min(720, step * 60);
  if (name === "PRICE_SPIKE") return step === 3 ? -1_500 : step === 4 ? -750 : 0;
  if (name === "DATA_NOISE") return [0, 90, -110, 75, -80, 120, -95, 60, -45, 30, -20, 0][step] ?? 0;
  return 0;
}

function scenarioStart(config: TreasuryPolicyConfig, name: ScenarioName) {
  return ["STEP_TARGET", "EXECUTION_DELAY", "TRANSACTION_FAILURE"].includes(name) ? clampAllocation(config.targetAllocationBps - 800) : config.targetAllocationBps;
}

function runScenario(config: TreasuryPolicyConfig, name: ScenarioName) {
  let baseAllocationBps = scenarioStart(config, name);
  let previousErrorBps = config.targetAllocationBps - baseAllocationBps;
  let integralErrorBps = 0;
  const delayed: number[] = [];
  const steps: StepResult[] = [];
  const slippageBps = Math.min(config.riskLimits.maxSlippageBps, 50);
  const normalLiquidity = (BigInt(config.riskLimits.minLiquidityUsd) + 1n).toString();
  for (let step = 0; step < 12; step += 1) {
    const observedAllocationBps = clampAllocation(baseAllocationBps + disturbance(name, step));
    const paused = name === "PROLONGED_PAUSE" && step >= 2;
    const decliningLiquidity = name === "LIQUIDITY_DECLINE" && step >= 5 && BigInt(config.riskLimits.minLiquidityUsd) > 0n;
    const simulation = simulatePolicy(config, { observedAllocationBps, previousErrorBps, integralErrorBps, deltaTimeSeconds: 86_400, requestedSlippageBps: slippageBps, liquidityUsd: decliningLiquidity ? (BigInt(config.riskLimits.minLiquidityUsd) - 1n).toString() : normalLiquidity, dailyTurnoverUsd: "0", targetContract: config.riskLimits.allowedTargetContracts[0], functionSelector: config.riskLimits.allowedFunctionSelectors[0], evidenceSnapshotId: "synthetic-calibration-only",estimatedGasUnits:"100000",maxFeePerGasWei:"1",nativeBalanceBeforeWei:"100000",tokenBalanceBeforeBaseUnits:"1000000",transferAmountBaseUnits:"1" }, true);
    integralErrorBps = simulation.integralBps;
    previousErrorBps = simulation.errorBps;
    const blockers = paused ? ["SYSTEM_PAUSED"] : [...simulation.blockers];
    const status = paused ? "BLOCKED" : simulation.status;
    const suggestion = status === "SUGGESTED" ? simulation.suggestedAdjustmentBps : 0;
    let appliedAdjustmentBps = suggestion;
    let executionOutcome: StepResult["executionOutcome"] = suggestion === 0 ? "NOT_APPLICABLE" : "APPLIED";
    if (name === "EXECUTION_DELAY") { delayed.push(suggestion); appliedAdjustmentBps = delayed.length > 2 ? delayed.shift()! : 0; executionOutcome = suggestion === 0 ? "NOT_APPLICABLE" : "DELAYED"; }
    else if (name === "TRANSACTION_FAILURE" && (step === 2 || step === 3)) { appliedAdjustmentBps = 0; executionOutcome = suggestion === 0 ? "NOT_APPLICABLE" : "FAILED"; }
    baseAllocationBps = clampAllocation(baseAllocationBps + appliedAdjustmentBps);
    steps.push({ step, observedAllocationBps, errorBps: simulation.errorBps, suggestedAdjustmentBps: suggestion, appliedAdjustmentBps, status, blockers, executionOutcome });
  }
  const errors = steps.map((item) => item.errorBps);
  const initialDirection = Math.sign(errors[0]);
  const overshootBps = initialDirection >= 0 ? Math.max(0, ...errors.map((error) => -error)) : Math.max(0, ...errors);
  const tolerance = Math.max(25, config.pid.deadbandBps);
  const settledAt = steps.findIndex((_, index) => errors.slice(index).every((error) => Math.abs(error) <= tolerance));
  const turnoverBps = steps.reduce((sum, item) => sum + Math.abs(item.appliedAdjustmentBps), 0);
  const cumulativeTradingCostBps = steps.reduce((sum, item) => sum + Math.ceil(Math.abs(item.appliedAdjustmentBps) * slippageBps / 10_000), 0);
  return { name, sourceMode: "SYNTHETIC_DETERMINISTIC", steps, metrics: { overshootBps, settlingTimeSteps: settledAt < 0 ? null : settledAt, cumulativeTradingCostBps, turnoverBps, maxRiskExposureBps: Math.max(...errors.map(Math.abs)), blockedSteps: steps.filter((item) => item.status === "BLOCKED").length, failedExecutionSteps: steps.filter((item) => item.executionOutcome === "FAILED").length } };
}

export function comparePolicyScenarios(policies: BacktestPolicySnapshot[]) {
  if (policies.length < 2 || policies.length > 5) throw new Error("POLICY_COMPARISON_REQUIRES_2_TO_5_VERSIONS");
  if (new Set(policies.map((policy) => policy.id)).size !== policies.length) throw new Error("DUPLICATE_POLICY_VERSION");
  const results = policies.map((policy) => {
    validateTreasuryPolicy(policy.config);
    const scenarios = scenarioNames.map((name) => runScenario(policy.config, name));
    const aggregate = scenarios.reduce((value, scenario) => ({ overshootBps: value.overshootBps + scenario.metrics.overshootBps, cumulativeTradingCostBps: value.cumulativeTradingCostBps + scenario.metrics.cumulativeTradingCostBps, turnoverBps: value.turnoverBps + scenario.metrics.turnoverBps, maxRiskExposureBps: Math.max(value.maxRiskExposureBps, scenario.metrics.maxRiskExposureBps), unsettledScenarios: value.unsettledScenarios + (scenario.metrics.settlingTimeSteps === null ? 1 : 0), blockedSteps: value.blockedSteps + scenario.metrics.blockedSteps, failedExecutionSteps: value.failedExecutionSteps + scenario.metrics.failedExecutionSteps }), { overshootBps: 0, cumulativeTradingCostBps: 0, turnoverBps: 0, maxRiskExposureBps: 0, unsettledScenarios: 0, blockedSteps: 0, failedExecutionSteps: 0 });
    const deterministicScore = aggregate.maxRiskExposureBps + aggregate.overshootBps * 2 + aggregate.cumulativeTradingCostBps * 10 + aggregate.turnoverBps + aggregate.unsettledScenarios * 10_000 + aggregate.blockedSteps * 500;
    return { policyVersionId: policy.id, policyVersion: policy.version, policyContentHash: policy.contentHash, scenarios, aggregate, deterministicScore };
  });
  const ranked = [...results].sort((a, b) => a.deterministicScore - b.deterministicScore || a.policyVersionId.localeCompare(b.policyVersionId));
  return { schemaVersion: "treasury.policy.scenario-comparison.v1", suiteVersion: POLICY_SCENARIO_SUITE_VERSION, sourceMode: "SYNTHETIC_DETERMINISTIC", historicalEvidenceUsed: false, policies: results, ranking: ranked.map((item, index) => ({ rank: index + 1, policyVersionId: item.policyVersionId, deterministicScore: item.deterministicScore })), calibrationAidOnly: true, governanceApprovalRequired: true, advisoryOnly: true, assetExecutionAuthorized: false } as const;
}
