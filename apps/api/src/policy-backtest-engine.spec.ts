import { comparePolicyScenarios } from "./policy-backtest-engine";
import { TreasuryPolicyConfig } from "./policy-engine";

const config: TreasuryPolicyConfig = { minimumEvidenceQuality: 80, targetAllocationBps: 4000, pid: { kpBps: 5000, kiBps: 1000, kdBps: 0, deadbandBps: 25, maxAdjustmentBps: 500, integralLimitBps: 2000 }, riskLimits: { maxSingleAdjustmentBps: 500, maxSlippageBps: 100, minLiquidityUsd: "100000", maxDailyTurnoverUsd: "50000", allowedTargetContracts: ["0x1111111111111111111111111111111111111111"], allowedFunctionSelectors: ["0x12345678"] } };
const policies = [
  { id: "policy_1", version: 1, contentHash: "0x1", config },
  { id: "policy_2", version: 2, contentHash: "0x2", config: { ...config, pid: { ...config.pid, kpBps: 3500, kiBps: 500 } } },
];

describe("deterministic policy scenario comparison", () => {
  it("replays all governed scenarios and metrics identically", () => {
    const first = comparePolicyScenarios(policies); const second = comparePolicyScenarios(structuredClone(policies));
    expect(first).toEqual(second);
    expect(first.policies[0].scenarios.map((item) => item.name)).toEqual(["STEP_TARGET","GRADUAL_DRIFT","PRICE_SPIKE","DATA_NOISE","EXECUTION_DELAY","TRANSACTION_FAILURE","LIQUIDITY_DECLINE","PROLONGED_PAUSE"]);
    expect(first.policies[0].scenarios[0].metrics).toEqual(expect.objectContaining({ overshootBps: expect.any(Number), cumulativeTradingCostBps: expect.any(Number), turnoverBps: expect.any(Number), maxRiskExposureBps: expect.any(Number) }));
  });
  it("keeps ranking advisory and cannot authorize policy activation or assets", () => {
    const result = comparePolicyScenarios(policies);
    expect(result.ranking).toHaveLength(2); expect(result.calibrationAidOnly).toBe(true); expect(result.governanceApprovalRequired).toBe(true); expect(result.assetExecutionAuthorized).toBe(false);
    expect(result.historicalEvidenceUsed).toBe(false); expect(result.sourceMode).toBe("SYNTHETIC_DETERMINISTIC");
  });
  it("models hard-limit, execution-failure and pause guardrails", () => {
    const scenarios = comparePolicyScenarios(policies).policies[0].scenarios;
    expect(scenarios.find((item) => item.name === "LIQUIDITY_DECLINE")!.metrics.blockedSteps).toBeGreaterThan(0);
    expect(scenarios.find((item) => item.name === "TRANSACTION_FAILURE")!.metrics.failedExecutionSteps).toBe(2);
    expect(scenarios.find((item) => item.name === "PROLONGED_PAUSE")!.steps.at(-1)!.blockers).toContain("SYSTEM_PAUSED");
  });
  it("rejects duplicate or undersized comparisons", () => {
    expect(() => comparePolicyScenarios([policies[0]])).toThrow("POLICY_COMPARISON_REQUIRES_2_TO_5_VERSIONS");
    expect(() => comparePolicyScenarios([policies[0], policies[0]])).toThrow("DUPLICATE_POLICY_VERSION");
  });
});
