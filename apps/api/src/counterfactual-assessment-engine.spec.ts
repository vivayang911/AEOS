import { assessCounterfactual, CounterfactualEvidence } from "./counterfactual-assessment-engine";

const hash = (c: string) => `0x${c.repeat(64)}`;
const start = "2026-08-15T00:00:00.000Z", end = "2026-08-16T00:00:00.000Z";
const subject = { type: "treasury_counterfactual_window", treasuryId: "treasury_1", windowStart: start, windowEnd: end };
const ev = (id: string, predicate: string, value: unknown, observedAt = end): CounterfactualEvidence => ({ id, contentHash: hash(id.slice(-1)), predicate, subject, value, source: { provider: "verified-fixture" }, verificationStatus: "VERIFIED", qualityScore: 95, conflictGroupId: null, observedAt });
const evidence = [
  ev("ev_a", "treasury.holdings.snapshot", { stage: "START", assets: [{ assetId: "USDC", unitsAtomic: "100000000", decimals: 6 }] }, start),
  ev("ev_b", "asset.price.quote", { stage: "END", assetId: "USDC", priceAtomic: "1000000", symbol: "USDC", decimals: 6 }),
  ev("ev_c", "treasury.nav.atomic", { stage: "START", amountAtomic: "100000000", symbol: "USDC", decimals: 6 }, start),
  ev("ev_d", "treasury.nav.atomic", { stage: "END", amountAtomic: "103000000", symbol: "USDC", decimals: 6 }),
  ev("ev_e", "treasury.drawdown.bps", { portfolio: "ACTUAL", bps: 200 }),
  ev("ev_f", "treasury.drawdown.bps", { portfolio: "BASELINE", bps: 300 }),
  ev("ev_1", "market.benchmark_return.bps", { bps: 100 }),
];
const args = () => ({ treasuryId: "treasury_1", policyVersionId: "policy_1", outcomeId: "outcome_1", executionObservedAt: "2026-08-15T12:00:00.000Z", windowStart: start, windowEnd: end, methodologyId: "method_1", methodologyContentHash: hash("9"), methodologyEffectiveAt: "2026-08-14T23:00:00.000Z", methodology: { baselineModel: "HOLD_CONSTANT_UNITS_MARK_TO_MARK_V1", observationHorizonSeconds: 86400, benchmarkPredicate: "market.benchmark_return.bps", externalFactorPredicates: ["market.benchmark_return.bps"], requiredEvidencePredicates: ["treasury.holdings.snapshot", "asset.price.quote", "treasury.nav.atomic", "treasury.drawdown.bps", "market.benchmark_return.bps", "treasury.execution.network_fee_cost", "treasury.execution.protocol_fee_cost", "treasury.execution.execution_shortfall_cost"], opportunityCostMethod: "BENCHMARK_RETURN_DIFFERENCE_V1", riskAdjustmentMethod: "EXCESS_RETURN_PER_MAX_DRAWDOWN_V1", transactionCostTreatment: "OBSERVED_DISJOINT_COST_REQUIRED", missingDataPolicy: "REFUSE_ASSESSMENT" }, minimumQuality: 80, manifest: evidence.map(item => ({ evidenceId: item.id, contentHash: item.contentHash })), evidence, transactionCostAssessmentId: "cost_1", transactionCost: { totalObservedCostAtomic: "500000", numeraire: { symbol: "USDC", decimals: 6 }, evidenceRefs: [{ evidenceId: "cost_n", contentHash: hash("2"), predicate: "treasury.execution.network_fee_cost" }, { evidenceId: "cost_p", contentHash: hash("3"), predicate: "treasury.execution.protocol_fee_cost" }, { evidenceId: "cost_s", contentHash: hash("4"), predicate: "treasury.execution.execution_shortfall_cost" }] } });

describe("counterfactual assessment", () => {
  it("revalues frozen units and subtracts observed disjoint costs without claiming causality", () => {
    const result = assessCounterfactual(args());
    expect(result.values.baselineEndNavAtomic).toBe("100000000");
    expect(result.values.estimatedNetDifferenceVsBaselineAtomic).toBe("2500000");
    expect(result.classification).toBe("OUTPERFORMED_BASELINE_AFTER_OBSERVED_COSTS");
    expect(result.externalFactorsStatisticallyControlled).toBe(false);
    expect(result.causalAttribution).toBe("NOT_ESTABLISHED");
    expect(result.assetExecutionAuthorized).toBe(false);
  });
  it("preserves millisecond precision from PostgreSQL Date values", () => {
    const input = args();
    input.evidence = input.evidence.map(item => ({ ...item, observedAt: new Date(item.observedAt) }));
    expect(assessCounterfactual(input).values.estimatedNetDifferenceVsBaselineAtomic).toBe("2500000");
  });
  it("rejects retrospective enrollment and an imprecise horizon", () => {
    expect(() => assessCounterfactual({ ...args(), methodologyEffectiveAt: "2026-08-15T13:00:00.000Z" })).toThrow("COUNTERFACTUAL_METHOD_NOT_PROSPECTIVE");
    expect(() => assessCounterfactual({ ...args(), windowEnd: "2026-08-16T00:00:01.000Z" })).toThrow("COUNTERFACTUAL_HORIZON_MISMATCH");
  });
  it("refuses missing, conflicting and mixed-numeraire Evidence", () => {
    expect(() => assessCounterfactual({ ...args(), evidence: evidence.filter(item => item.predicate !== "market.benchmark_return.bps") })).toThrow("COUNTERFACTUAL_MANIFEST_MISMATCH");
    expect(() => assessCounterfactual({ ...args(), evidence: evidence.map(item => item.id === "ev_1" ? { ...item, conflictGroupId: "conflict_1" } : item) })).toThrow("COUNTERFACTUAL_EVIDENCE_CONFLICT");
    expect(() => assessCounterfactual({ ...args(), transactionCost: { ...args().transactionCost, totalObservedCostAtomic: "1", numeraire: { symbol: "ETH", decimals: 18 } } })).toThrow("COUNTERFACTUAL_COST_NUMERAIRE_MISMATCH");
  });
});
