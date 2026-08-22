export const COUNTERFACTUAL_ASSESSMENT_SCHEMA = "treasury.counterfactual-assessment.v1" as const;

type ManifestItem = { evidenceId: string; contentHash: string };
export type CounterfactualEvidence = {
  id: string;
  contentHash: string;
  predicate: string;
  subject: unknown;
  value: unknown;
  source: unknown;
  verificationStatus: string;
  qualityScore: number;
  conflictGroupId: string | null;
  observedAt: string | Date;
};

type Methodology = {
  baselineModel: string;
  observationHorizonSeconds: number;
  benchmarkPredicate: string;
  externalFactorPredicates: string[];
  requiredEvidencePredicates: string[];
  opportunityCostMethod: string;
  riskAdjustmentMethod: string;
  transactionCostTreatment: string;
  missingDataPolicy: string;
};
const costPredicates = new Set(["treasury.execution.network_fee_cost", "treasury.execution.protocol_fee_cost", "treasury.execution.execution_shortfall_cost"]);

const object = (value: unknown, code: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
};
const integer = (value: unknown, min: number, max: number, code: string) => {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) throw new Error(code);
  return Number(value);
};
const atomic = (value: unknown, code: string) => {
  if (typeof value !== "string" || !/^\d{1,78}$/.test(value)) throw new Error(code);
  return BigInt(value);
};
const signedAtomic = (value: bigint) => value.toString();
const bps = (numerator: bigint, denominator: bigint, code: string) => {
  if (denominator <= 0n) throw new Error(code);
  const value = numerator * 10_000n / denominator;
  if (value < -1_000_000n || value > 1_000_000n) throw new Error(code);
  return Number(value);
};
const iso = (value: unknown, code: string) => {
  const time = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  if (!Number.isFinite(time)) throw new Error(code);
  return new Date(time).toISOString();
};

function exactSubject(subject: unknown, treasuryId: string, start: string, end: string) {
  const item = object(subject, "COUNTERFACTUAL_SUBJECT_INVALID");
  return item.type === "treasury_counterfactual_window" && item.treasuryId === treasuryId &&
    iso(item.windowStart, "COUNTERFACTUAL_SUBJECT_WINDOW_INVALID") === start &&
    iso(item.windowEnd, "COUNTERFACTUAL_SUBJECT_WINDOW_INVALID") === end;
}

export function assessCounterfactual(args: {
  treasuryId: string;
  policyVersionId: string;
  outcomeId: string;
  executionObservedAt: string;
  windowStart: string;
  windowEnd: string;
  methodologyId: string;
  methodologyContentHash: string;
  methodologyEffectiveAt: string;
  methodology: Methodology;
  minimumQuality: number;
  manifest: ManifestItem[];
  evidence: CounterfactualEvidence[];
  transactionCostAssessmentId: string;
  transactionCost: { totalObservedCostAtomic: string; numeraire: { symbol: string; decimals: number }; evidenceRefs: Array<{ evidenceId: string; contentHash: string; predicate: string; observedAt?: string }> };
}) {
  const start = iso(args.windowStart, "COUNTERFACTUAL_WINDOW_INVALID");
  const end = iso(args.windowEnd, "COUNTERFACTUAL_WINDOW_INVALID");
  const executionAt = iso(args.executionObservedAt, "COUNTERFACTUAL_EXECUTION_TIME_INVALID");
  const effectiveAt = iso(args.methodologyEffectiveAt, "COUNTERFACTUAL_METHOD_EFFECTIVE_TIME_INVALID");
  const startMs = new Date(start).getTime(), endMs = new Date(end).getTime();
  if (endMs <= startMs || (endMs - startMs) / 1000 !== args.methodology.observationHorizonSeconds) throw new Error("COUNTERFACTUAL_HORIZON_MISMATCH");
  if (new Date(executionAt).getTime() <= new Date(effectiveAt).getTime()) throw new Error("COUNTERFACTUAL_METHOD_NOT_PROSPECTIVE");
  if (args.methodology.baselineModel !== "HOLD_CONSTANT_UNITS_MARK_TO_MARK_V1" || args.methodology.opportunityCostMethod !== "BENCHMARK_RETURN_DIFFERENCE_V1" || args.methodology.riskAdjustmentMethod !== "EXCESS_RETURN_PER_MAX_DRAWDOWN_V1" || args.methodology.transactionCostTreatment !== "OBSERVED_DISJOINT_COST_REQUIRED" || args.methodology.missingDataPolicy !== "REFUSE_ASSESSMENT") throw new Error("COUNTERFACTUAL_METHOD_UNSUPPORTED");
  integer(args.minimumQuality, 0, 100, "COUNTERFACTUAL_MINIMUM_QUALITY_INVALID");
  if (!Array.isArray(args.manifest) || args.manifest.length === 0) throw new Error("COUNTERFACTUAL_EVIDENCE_EMPTY");

  const byId = new Map(args.evidence.map(item => [item.id, item]));
  const selected: CounterfactualEvidence[] = [];
  for (const ref of args.manifest) {
    const row = byId.get(ref.evidenceId);
    if (!row || row.contentHash !== ref.contentHash) throw new Error("COUNTERFACTUAL_MANIFEST_MISMATCH");
    if (!exactSubject(row.subject, args.treasuryId, start, end)) continue;
    if (!args.methodology.requiredEvidencePredicates.includes(row.predicate)) continue;
    if (row.verificationStatus !== "VERIFIED") throw new Error("COUNTERFACTUAL_EVIDENCE_NOT_VERIFIED");
    if (row.qualityScore < args.minimumQuality) throw new Error("COUNTERFACTUAL_EVIDENCE_QUALITY_LOW");
    if (row.conflictGroupId) throw new Error("COUNTERFACTUAL_EVIDENCE_CONFLICT");
    selected.push(row);
  }
  for (const predicate of args.methodology.requiredEvidencePredicates) {
    if (costPredicates.has(predicate) && args.transactionCost.evidenceRefs.some(item => item.predicate === predicate)) continue;
    if (!selected.some(item => item.predicate === predicate)) throw new Error(`COUNTERFACTUAL_EVIDENCE_MISSING:${predicate}`);
  }
  for (const predicate of costPredicates) if (!args.transactionCost.evidenceRefs.some(item => item.predicate === predicate)) throw new Error(`COUNTERFACTUAL_COST_EVIDENCE_MISSING:${predicate}`);

  const one = (predicate: string, filter?: (value: Record<string, unknown>) => boolean) => {
    const rows = selected.filter(item => item.predicate === predicate && (!filter || filter(object(item.value, "COUNTERFACTUAL_VALUE_INVALID"))));
    if (rows.length !== 1) throw new Error(`COUNTERFACTUAL_EVIDENCE_CARDINALITY:${predicate}`);
    return rows[0];
  };
  const ref = (row: CounterfactualEvidence, usedInArithmetic: boolean) => ({
    evidenceId: row.id, contentHash: row.contentHash, predicate: row.predicate,
    provider: String(object(row.source, "COUNTERFACTUAL_SOURCE_INVALID").provider ?? ""),
    observedAt: iso(row.observedAt, "COUNTERFACTUAL_OBSERVED_AT_INVALID"), usedInArithmetic,
  });

  const holdingsRow = one("treasury.holdings.snapshot");
  const holdingsValue = object(holdingsRow.value, "COUNTERFACTUAL_HOLDINGS_INVALID");
  if (holdingsValue.stage !== "START") throw new Error("COUNTERFACTUAL_HOLDINGS_STAGE_INVALID");
  if (iso(holdingsRow.observedAt, "COUNTERFACTUAL_HOLDINGS_TIME_INVALID") !== start) throw new Error("COUNTERFACTUAL_HOLDINGS_TIME_MISMATCH");
  if (!Array.isArray(holdingsValue.assets) || holdingsValue.assets.length < 1 || holdingsValue.assets.length > 50) throw new Error("COUNTERFACTUAL_HOLDINGS_ASSETS_INVALID");
  const assetIds = new Set<string>();
  const assets = holdingsValue.assets.map(raw => {
    const item = object(raw, "COUNTERFACTUAL_HOLDING_INVALID");
    if (typeof item.assetId !== "string" || item.assetId.length < 1 || item.assetId.length > 120 || assetIds.has(item.assetId)) throw new Error("COUNTERFACTUAL_HOLDING_ASSET_INVALID");
    assetIds.add(item.assetId);
    return { assetId: item.assetId, unitsAtomic: atomic(item.unitsAtomic, "COUNTERFACTUAL_HOLDING_UNITS_INVALID"), decimals: integer(item.decimals, 0, 36, "COUNTERFACTUAL_HOLDING_DECIMALS_INVALID") };
  });

  const nav = (stage: "START" | "END") => {
    const row = one("treasury.nav.atomic", value => value.stage === stage), value = object(row.value, "COUNTERFACTUAL_NAV_INVALID");
    const expected = stage === "START" ? start : end;
    if (iso(row.observedAt, "COUNTERFACTUAL_NAV_TIME_INVALID") !== expected) throw new Error("COUNTERFACTUAL_NAV_TIME_MISMATCH");
    if (typeof value.symbol !== "string" || !/^[A-Z0-9]{2,16}$/.test(value.symbol)) throw new Error("COUNTERFACTUAL_NUMERAIRE_INVALID");
    return { row, amount: atomic(value.amountAtomic, "COUNTERFACTUAL_NAV_INVALID"), symbol: value.symbol, decimals: integer(value.decimals, 0, 36, "COUNTERFACTUAL_NUMERAIRE_INVALID") };
  };
  const startNav = nav("START"), endNav = nav("END");
  if (startNav.symbol !== endNav.symbol || startNav.decimals !== endNav.decimals || startNav.amount === 0n) throw new Error("COUNTERFACTUAL_NUMERAIRE_MISMATCH");
  if (args.transactionCost.numeraire.symbol !== startNav.symbol || args.transactionCost.numeraire.decimals !== startNav.decimals) throw new Error("COUNTERFACTUAL_COST_NUMERAIRE_MISMATCH");
  const observedCost = atomic(args.transactionCost.totalObservedCostAtomic, "COUNTERFACTUAL_COST_INVALID");

  let baselineEnd = 0n;
  const priceRefs: ReturnType<typeof ref>[] = [];
  for (const asset of assets) {
    const row = one("asset.price.quote", value => value.stage === "END" && value.assetId === asset.assetId);
    const value = object(row.value, "COUNTERFACTUAL_PRICE_INVALID");
    if (iso(row.observedAt, "COUNTERFACTUAL_PRICE_TIME_INVALID") !== end || value.symbol !== startNav.symbol || integer(value.decimals, 0, 36, "COUNTERFACTUAL_PRICE_INVALID") !== startNav.decimals) throw new Error("COUNTERFACTUAL_PRICE_NUMERAIRE_MISMATCH");
    baselineEnd += asset.unitsAtomic * atomic(value.priceAtomic, "COUNTERFACTUAL_PRICE_INVALID") / (10n ** BigInt(asset.decimals));
    priceRefs.push(ref(row, true));
  }
  if (baselineEnd.toString().length > 78) throw new Error("COUNTERFACTUAL_BASELINE_OVERFLOW");

  const drawdown = (portfolio: "ACTUAL" | "BASELINE") => {
    const row = one("treasury.drawdown.bps", value => value.portfolio === portfolio), value = object(row.value, "COUNTERFACTUAL_DRAWDOWN_INVALID");
    return { row, value: integer(value.bps, 1, 10_000, "COUNTERFACTUAL_DRAWDOWN_INVALID") };
  };
  const actualDrawdown = drawdown("ACTUAL"), baselineDrawdown = drawdown("BASELINE");
  const factorRefs: Array<ReturnType<typeof ref> & { value: unknown }> = [];
  let benchmarkReturnBps: number | null = null;
  for (const predicate of args.methodology.externalFactorPredicates) {
    const row = one(predicate), value = object(row.value, "COUNTERFACTUAL_FACTOR_INVALID");
    const factorValue = predicate === "security.critical_incident" ? (() => { if (typeof value.occurred !== "boolean") throw new Error("COUNTERFACTUAL_FACTOR_INVALID"); return value.occurred; })() : integer(value.bps, -100_000, 100_000, "COUNTERFACTUAL_FACTOR_INVALID");
    if (predicate === args.methodology.benchmarkPredicate) benchmarkReturnBps = factorValue as number;
    factorRefs.push({ ...ref(row, predicate === args.methodology.benchmarkPredicate), value: factorValue });
  }
  if (benchmarkReturnBps === null) throw new Error("COUNTERFACTUAL_BENCHMARK_MISSING");

  const actualReturnBps = bps(endNav.amount - startNav.amount, startNav.amount, "COUNTERFACTUAL_RETURN_INVALID");
  const baselineReturnBps = bps(baselineEnd - startNav.amount, startNav.amount, "COUNTERFACTUAL_RETURN_INVALID");
  const grossDifference = endNav.amount - baselineEnd;
  const netDifference = grossDifference - observedCost;
  const actualExcessBps = actualReturnBps - benchmarkReturnBps;
  const baselineExcessBps = baselineReturnBps - benchmarkReturnBps;
  return {
    schemaVersion: COUNTERFACTUAL_ASSESSMENT_SCHEMA,
    treasuryId: args.treasuryId, policyVersionId: args.policyVersionId, outcomeId: args.outcomeId,
    methodology: { id: args.methodologyId, contentHash: args.methodologyContentHash, effectiveAt, baselineModel: args.methodology.baselineModel, roundingRule: "FLOOR_PER_ASSET_ATOMIC_V1", horizonSeconds: args.methodology.observationHorizonSeconds },
    observationWindow: { start, end, executionObservedAt: executionAt },
    numeraire: { symbol: startNav.symbol, decimals: startNav.decimals },
    values: { startNavAtomic: startNav.amount.toString(), actualEndNavAtomic: endNav.amount.toString(), baselineEndNavAtomic: baselineEnd.toString(), grossDifferenceVsBaselineAtomic: signedAtomic(grossDifference), observedTransactionCostAtomic: observedCost.toString(), estimatedNetDifferenceVsBaselineAtomic: signedAtomic(netDifference) },
    returns: { actualReturnBps, baselineReturnBps, benchmarkReturnBps, opportunityCostBps: benchmarkReturnBps - actualReturnBps, actualExcessReturnBps: actualExcessBps, baselineExcessReturnBps: baselineExcessBps },
    riskAdjustment: { method: "EXCESS_RETURN_PER_MAX_DRAWDOWN_V1", actualMaxDrawdownBps: actualDrawdown.value, baselineMaxDrawdownBps: baselineDrawdown.value, actualScorePpm: Math.trunc(actualExcessBps * 1_000_000 / actualDrawdown.value), baselineScorePpm: Math.trunc(baselineExcessBps * 1_000_000 / baselineDrawdown.value) },
    classification: netDifference > 0n ? "OUTPERFORMED_BASELINE_AFTER_OBSERVED_COSTS" : netDifference < 0n ? "UNDERPERFORMED_BASELINE_AFTER_OBSERVED_COSTS" : "MATCHED_BASELINE_AFTER_OBSERVED_COSTS",
    evidenceRefs: [ref(holdingsRow, true), ref(startNav.row, true), ref(endNav.row, true), ...priceRefs, ref(actualDrawdown.row, true), ref(baselineDrawdown.row, true), ...factorRefs],
    transactionCostEvidenceRefs: args.transactionCost.evidenceRefs.map(item => ({ ...item, usedInArithmetic: costPredicates.has(item.predicate) })),
    transactionCostAssessmentId: args.transactionCostAssessmentId,
    externalFactorsObserved: true, externalFactorsStatisticallyControlled: false,
    counterfactualEstimateAvailable: true, counterfactualIsObservedFact: false,
    causalAttribution: "NOT_ESTABLISHED", causalNetBenefitEstablished: false, historicalPerformanceClaimed: false,
    memoryPromotionAuthorized: false, skillPromotionAuthorized: false, advisoryOnly: true, assetExecutionAuthorized: false,
  } as const;
}
