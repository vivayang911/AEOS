const { randomUUID } = require("node:crypto");
const { DatabaseService } = require("../dist/database.service");
const { CounterfactualMethodologyService } = require("../dist/counterfactual-methodology.service");
const { CounterfactualAssessmentService } = require("../dist/counterfactual-assessment.service");

const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const org = `org_cfa_${suffix}`, other = `org_cfa_other_${suffix}`, policy = `policy_cfa_${suffix}`, treasury = "treasury_core";
const db = new DatabaseService(), methods = new CounterfactualMethodologyService(db), assessments = new CounterfactualAssessmentService(db);
let verificationStage = "BOOT";
const h = c => `0x${c.repeat(64)}`;
const startDate = new Date(Date.now() + 10 * 60 * 1000), endDate = new Date(startDate.getTime() + 86_400_000), executionDate = new Date(startDate.getTime() + 3_600_000);
const start = startDate.toISOString(), end = endDate.toISOString(), executionAt = executionDate.toISOString();
const ids = Object.fromEntries(["raw","snapshot","before","after","decision","simulation","proposal","preflight","safe","outcome","cost"].map(key => [key, `${key}_cfa_${suffix}`]));
const methodologyInput = { baselineModel: "HOLD_CONSTANT_UNITS_MARK_TO_MARK_V1", observationHorizonSeconds: 86400, externalFactorPredicates: ["market.benchmark_return.bps", "market.volatility.bps"], benchmarkPredicate: "market.benchmark_return.bps", opportunityCostMethod: "BENCHMARK_RETURN_DIFFERENCE_V1", riskAdjustmentMethod: "EXCESS_RETURN_PER_MAX_DRAWDOWN_V1", transactionCostTreatment: "OBSERVED_DISJOINT_COST_REQUIRED", missingDataPolicy: "REFUSE_ASSESSMENT" };
const methodDto = name => ({ methodologyKey: "hold-baseline", name, description: "Prospective fixed-unit benchmark with observed disjoint transaction costs", treasuryId: treasury, policyVersionId: policy, methodology: methodologyInput });

async function seed(method) {
  await db.runAsSystem(() => db.transaction(async c => {
    await c.query("INSERT INTO organizations(id,name,status)VALUES($1,'Counterfactual Assessment','ACTIVE'),($2,'Other','ACTIVE')", [org, other]);
    await c.query("INSERT INTO raw_attestations(id,organization_id,provider,chain_id,payload,content_hash)VALUES($1,$2,'verified-counterfactual-fixture',1,'{}',$3)", [ids.raw, org, `raw_${suffix}`]);
    await c.query("INSERT INTO policy_versions(id,organization_id,version,name,status,schema_version,config,content_hash)VALUES($1,$2,1,'Assessment Policy','ACTIVE','treasury.policy.v1',$3,$4)", [policy, org, { minimumEvidenceQuality: 80 }, `policy_${suffix}`]);
  }));
  const draft = await db.runWithTenant(org, "reviewer", "REVIEWER", () => methods.create(org, "reviewer", methodDto("Fixed-unit prospective method")));
  const approved = await db.runWithTenant(org, "reviewer", "REVIEWER", () => methods.approve(org, draft.id, "reviewer", "Approved before the eligible execution"));
  await db.runAsSystem(() => db.transaction(async c => {
    const subject = { type: "treasury_counterfactual_window", treasuryId: treasury, windowStart: start, windowEnd: end };
    const defs = [
      ["treasury.holdings.snapshot", { stage: "START", assets: [{ assetId: "USDC", unitsAtomic: "100000000", decimals: 6 }] }, start],
      ["asset.price.quote", { stage: "END", assetId: "USDC", priceAtomic: "1000000", symbol: "USDC", decimals: 6 }, end],
      ["treasury.nav.atomic", { stage: "START", amountAtomic: "100000000", symbol: "USDC", decimals: 6 }, start],
      ["treasury.nav.atomic", { stage: "END", amountAtomic: "103000000", symbol: "USDC", decimals: 6 }, end],
      ["treasury.drawdown.bps", { portfolio: "ACTUAL", bps: 200 }, end],
      ["treasury.drawdown.bps", { portfolio: "BASELINE", bps: 300 }, end],
      ["market.benchmark_return.bps", { bps: 100 }, end],
      ["market.volatility.bps", { bps: 250 }, end],
    ];
    const manifest = [];
    for (let i = 0; i < defs.length; i++) {
      const evidenceId = `ev_cfa_${i}_${suffix}`, contentHash = h(String((i + 1) % 10));
      manifest.push({ evidenceId, contentHash });
      await c.query("INSERT INTO evidence(id,organization_id,raw_attestation_id,subject,predicate,value,chain,source,verification_status,freshness_status,freshness_expires_at,quality_score,quality_components,observed_at,content_hash)VALUES($1,$2,$3,$4,$5,$6,'{}',$7,'VERIFIED','STALE','2020-01-01T00:00:00Z',95,'{}',$8,$9)", [evidenceId, org, ids.raw, subject, defs[i][0], defs[i][1], { provider: "verified-counterfactual-fixture" }, defs[i][2], contentHash]);
    }
    await c.query("INSERT INTO evidence_snapshots(id,organization_id,evidence_ids,manifest,manifest_hash,query)VALUES($1,$2,$3,$4,$5,'{}')", [ids.snapshot, org, JSON.stringify(manifest.map(item => item.evidenceId)), JSON.stringify(manifest), `manifest_${suffix}`]);
    const pidInput = at => ({ sourceMode: "EVIDENCE_DERIVED_OBSERVED_STATE", evidenceSnapshotId: ids.snapshot, observedState: { observationAt: at } });
    await c.query("INSERT INTO adaptive_pid_snapshots(id,organization_id,treasury_id,policy_version_id,evidence_snapshot_id,status,input,input_hash,result,result_hash,created_by)VALUES($1,$2,$3,$4,$5,'ADVISORY',$6,$7,'{}',$8,'reviewer'),($9,$2,$3,$4,$5,'ADVISORY',$10,$11,'{}',$12,'reviewer')", [ids.before, org, treasury, policy, ids.snapshot, pidInput(start), h("a"), h("b"), ids.after, pidInput(end), h("c"), h("d")]);
    await c.query("INSERT INTO decisions(id,organization_id,objective,policy_version_id,evidence_snapshot_id,provider,schema_version,status,recommendation,input_hash,output_hash)VALUES($1,$2,'Assessment',$3,$4,'mock','decision.recommendation.v2','APPROVED','{}',$5,$6)", [ids.decision, org, policy, ids.snapshot, `din_${suffix}`, `dout_${suffix}`]);
    await c.query("INSERT INTO policy_simulations(id,organization_id,policy_version_id,evidence_snapshot_id,status,input,input_hash,result,result_hash)VALUES($1,$2,$3,$4,'SUGGESTED','{}',$5,'{}',$6)", [ids.simulation, org, policy, ids.snapshot, `sin_${suffix}`, `sout_${suffix}`]);
    await c.query("INSERT INTO proposals(id,organization_id,decision_id,policy_version_id,evidence_snapshot_id,simulation_id,proposal_type,state,title,summary,rationale,action,targets,values_json,calldatas,calldata_hash,content,content_hash,created_by)VALUES($1,$2,$3,$4,$5,$6,'TREASURY_ACTION','DRAFT','Assessment','Assessment','Assessment','{}','[]','[]','[]',$7,'{}',$8,'reviewer')", [ids.proposal, org, ids.decision, policy, ids.snapshot, ids.simulation, `calldata_${suffix}`, `proposal_${suffix}`]);
    await c.query("INSERT INTO execution_preflights(id,organization_id,proposal_id,policy_version_id,evidence_snapshot_id,status,action_id,input,input_hash,result,result_hash,expires_at)VALUES($1,$2,$3,$4,$5,'READY_FOR_SAFE_REVIEW',$6,'{}',$7,'{}',$8,now()+interval '2 day')", [ids.preflight, org, ids.proposal, policy, ids.snapshot, `action_${suffix}`, `prein_${suffix}`, `preout_${suffix}`]);
    await c.query("INSERT INTO safe_transaction_observations(id,organization_id,preflight_id,proposal_id,ordinal,adapter,safe_address,safe_tx_hash,state,confirmations,confirmations_required,execution_tx_hash,execution_block_number,execution_block_hash,onchain_execution_confirmed,payload,payload_hash,observed_at)VALUES($1,$2,$3,$4,1,'fixture','0x1111111111111111111111111111111111111111',$5,'EXECUTED',2,2,$6,100,$7,true,'{}',$8,$9)", [ids.safe, org, ids.preflight, ids.proposal, `safe_${suffix}`, h("e"), h("f"), `payload_${suffix}`, executionAt]);
    await c.query("INSERT INTO treasury_outcome_assessments(id,organization_id,treasury_id,policy_version_id,before_adaptive_pid_snapshot_id,after_adaptive_pid_snapshot_id,safe_observation_id,proposal_id,classification,assessment,assessment_hash,created_by)VALUES($1,$2,$3,$4,$5,$6,$7,$8,'IMPROVED_DESCRIPTIVE',$9,$10,'reviewer')", [ids.outcome, org, treasury, policy, ids.before, ids.after, ids.safe, ids.proposal, { observationWindow: { before: start, after: end } }, h("1")]);
    const costRefs = ["network_fee_cost", "protocol_fee_cost", "execution_shortfall_cost"].map((name, i) => ({ evidenceId: `cost_${i}_${suffix}`, contentHash: h(String(i + 2)), predicate: `treasury.execution.${name}` }));
    const costAssessment = { components: { totalObservedCostAtomic: "500000" }, numeraire: { symbol: "USDC", decimals: 6 }, evidenceRefs: costRefs };
    await c.query("INSERT INTO treasury_transaction_cost_assessments(id,organization_id,treasury_outcome_id,treasury_id,policy_version_id,safe_observation_id,evidence_snapshot_id,assessment,assessment_hash,created_by)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'reviewer')", [ids.cost, org, ids.outcome, treasury, policy, ids.safe, ids.snapshot, costAssessment, h("2")]);
  }));
  return approved;
}

async function main() {
  verificationStage = "DATABASE_INIT";
  await db.onModuleInit();
  try {
    verificationStage = "SEED";
    const approved = await seed();
    const input = { methodologyVersionId: approved.id, transactionCostAssessmentId: ids.cost, evidenceSnapshotId: ids.snapshot };
    verificationStage = "CREATE_ASSESSMENT";
    const result = await db.runWithTenant(org, "reviewer", "REVIEWER", () => assessments.create(org, ids.outcome, input, "reviewer"));
    verificationStage = "IDEMPOTENT_REPLAY";
    const duplicate = await db.runWithTenant(org, "reviewer", "REVIEWER", () => assessments.create(org, ids.outcome, input, "reviewer"));
    let crossTenantHidden = false;
    try { await db.runWithTenant(other, "reviewer", "REVIEWER", () => assessments.get(other, ids.outcome, result.id)); } catch { crossTenantHidden = true; }
    const immutable = await db.runWithTenant(org, "admin", "ADMIN", async () => { try { await db.query("DELETE FROM treasury_counterfactual_assessments WHERE organization_id=$1 AND id=$2", [org, result.id]); return false; } catch { return true; } });
    const auditCount = await db.runWithTenant(org, "auditor", "AUDITOR", async () => Number((await db.query("SELECT count(*)::int count FROM audit_events WHERE organization_id=$1 AND object_id=$2", [org, result.id])).rows[0].count));
    verificationStage = "ASSERTIONS";
    const checks = { estimatedVsFixedBaseline: result.assessment.values.estimatedNetDifferenceVsBaselineAtomic === "2500000", observedCostsDeducted: result.assessment.values.observedTransactionCostAtomic === "500000", benchmarkUsed: result.assessment.returns.benchmarkReturnBps === 100, externalFactorsNotMislabelledControlled: result.assessment.externalFactorsStatisticallyControlled === false, estimateNotObservedFact: result.assessment.counterfactualIsObservedFact === false, causalityWithheld: result.assessment.causalAttribution === "NOT_ESTABLISHED" && result.causalAttributionEstablished === false, noAutomaticLearning: result.memoryPromotionAuthorized === false && result.skillPromotionAuthorized === false, idempotent: duplicate.id === result.id, immutable, crossTenantHidden, auditAppended: auditCount === 1, assetExecutionAuthorized: result.assetExecutionAuthorized === false };
    if (Object.values(checks).some(value => !value)) throw new Error(`Counterfactual assessment checks failed: ${JSON.stringify(checks)}`);
    console.log(JSON.stringify({ schemaVersion: "aeos.counterfactual-assessment-db.v1", status: "PASS", checks, privateKeyUsed: false, assetExecutionAuthorized: false }));
  } finally { await db.onModuleDestroy(); }
}
main().catch(error => { console.log(JSON.stringify({ schemaVersion: "aeos.counterfactual-assessment-db.failure.v1", status: "FAIL", stage: verificationStage, errorType: error?.constructor?.name ?? typeof error, errorCode: error?.code ?? null, message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack?.split("\n").slice(0, 6) : [] })); process.exitCode = 1; });
