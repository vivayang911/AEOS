import { PolicySimulationInput, TreasuryPolicyConfig, simulatePolicy, validateTreasuryPolicy } from "./policy-engine";

const config: TreasuryPolicyConfig = {
  minimumEvidenceQuality: 80,
  targetAllocationBps: 4000,
  pid: { kpBps: 5000, kiBps: 1000, kdBps: 0, deadbandBps: 25, maxAdjustmentBps: 500, integralLimitBps: 2000 },
  riskLimits: { maxSingleAdjustmentBps: 500, maxSlippageBps: 100, minLiquidityUsd: "100000", maxDailyTurnoverUsd: "50000", allowedTargetContracts: ["0x1111111111111111111111111111111111111111"], allowedFunctionSelectors: ["0x12345678"] },
};
const input: PolicySimulationInput = { observedAllocationBps: 3200, previousErrorBps: 700, integralErrorBps: 100, deltaTimeSeconds: 86400, requestedSlippageBps: 50, liquidityUsd: "200000", dailyTurnoverUsd: "10000", targetContract: "0x1111111111111111111111111111111111111111", functionSelector: "0x12345678", evidenceSnapshotId: "snap_1", estimatedGasUnits:"100000",maxFeePerGasWei:"20000000000",nativeBalanceBeforeWei:"3000000000000000",tokenBalanceBeforeBaseUnits:"125000000",transferAmountBaseUnits:"1000000" };

describe("deterministic policy simulator", () => {
  it("produces a reproducible bounded advisory suggestion", () => {
    const first = simulatePolicy(config, input, true); const second = simulatePolicy(structuredClone(config), structuredClone(input), true);
    expect(first).toEqual(second); expect(first.status).toBe("SUGGESTED"); expect(Math.abs(first.suggestedAdjustmentBps)).toBeLessThanOrEqual(500);
    expect(first.transactionImpact).toEqual(expect.objectContaining({sourceMode:"MOCK_DETERMINISTIC_INPUT",onchainEstimateVerified:false,gas:{estimatedGasUnits:"100000",maxFeePerGasWei:"20000000000",maximumCostWei:"2000000000000000"},nativeBalance:{beforeWei:"3000000000000000",afterMaximumGasWei:"1000000000000000"},tokenBalance:{beforeBaseUnits:"125000000",transferBaseUnits:"1000000",afterBaseUnits:"124000000"}}));
    expect(first.assetExecutionAuthorized).toBe(false); expect(first.advisoryOnly).toBe(true);expect(first.allRiskChecksVisible).toBe(true);
  });
  it("forces output to zero when any hard risk check fails", () => {
    const result = simulatePolicy(config, { ...input, requestedSlippageBps: 101 }, true);
    expect(result.status).toBe("BLOCKED"); expect(result.suggestedAdjustmentBps).toBe(0); expect(result.blockers).toContain("SLIPPAGE_LIMIT");
  });
  it("blocks stale or otherwise ineligible evidence independently of PID", () => {
    const result = simulatePolicy(config, input, false);
    expect(result.status).toBe("BLOCKED"); expect(result.blockers).toContain("EVIDENCE_ELIGIBLE");
  });
  it("fails closed on insufficient gas or token balance",()=>{const gas=simulatePolicy(config,{...input,nativeBalanceBeforeWei:"1"},true);expect(gas.blockers).toContain("NATIVE_GAS_BALANCE");expect(gas.transactionImpact.nativeBalance.afterMaximumGasWei).toBeNull();const token=simulatePolicy(config,{...input,tokenBalanceBeforeBaseUnits:"999999"},true);expect(token.blockers).toContain("TOKEN_TRANSFER_BALANCE");expect(token.transactionImpact.tokenBalance.afterBaseUnits).toBeNull()});
  it("rejects zero gas, zero transfer, and gas-cost precision overflow",()=>{expect(()=>simulatePolicy(config,{...input,estimatedGasUnits:"0"},true)).toThrow("INVALID_ESTIMATEDGASUNITS");expect(()=>simulatePolicy(config,{...input,transferAmountBaseUnits:"0"},true)).toThrow("INVALID_TRANSFERAMOUNTBASEUNITS");expect(()=>simulatePolicy(config,{...input,estimatedGasUnits:"1".repeat(78),maxFeePerGasWei:"10"},true)).toThrow("GASCOSTWEI_PRECISION_EXCEEDED")});
  it("honors the deadband and clamps integral windup", () => {
    const result = simulatePolicy(config, { ...input, observedAllocationBps: 3990, integralErrorBps: 999999 }, true);
    expect(result.withinDeadband).toBe(true); expect(result.suggestedAdjustmentBps).toBe(0); expect(result.integralBps).toBe(2000);
  });
  it("rejects unsafe policy composition and greater-than-78-digit amounts", () => {
    expect(() => validateTreasuryPolicy({ ...config, pid: { ...config.pid, maxAdjustmentBps: 501 } })).toThrow("PID_LIMIT_EXCEEDS_HARD_RISK_LIMIT");
    expect(() => simulatePolicy(config, { ...input, liquidityUsd: "1".repeat(79) }, true)).toThrow("INVALID_LIQUIDITYUSD");
  });
  it("rejects an unbounded adaptive PID policy at draft validation",()=>{
    const adaptive={enabled:true,kpMinBps:1000,kpMaxBps:6000,kiMinBps:0,kiMaxBps:1500,kdMinBps:0,kdMaxBps:2000,maxGainStepBps:500,derivativeFilterBps:9000,maxOutputBps:400,maxOutputRateBps:100,minimumEvidenceConfidenceBps:8500,volatileThresholdBps:300,liquidityStressThresholdBps:3000,blackSwanDeviationBps:100};
    expect(()=>validateTreasuryPolicy({...config,adaptivePid:{...adaptive,derivativeFilterBps:10001}})).toThrow("INVALID_DERIVATIVEFILTERBPS");
    expect(()=>validateTreasuryPolicy({...config,adaptivePid:{...adaptive,maxOutputBps:501}})).toThrow("ADAPTIVE_OUTPUT_EXCEEDS_HARD_LIMIT");
  });
});
