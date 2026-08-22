const { randomUUID } = require("node:crypto");
const { DatabaseService } = require("../dist/database.service");
const { CounterfactualMethodologyService } = require("../dist/counterfactual-methodology.service");
const suffix = randomUUID().replaceAll("-", "").slice(0, 12), org = `org_cf_${suffix}`, other = `org_cf_other_${suffix}`, policy = `policy_cf_${suffix}`;
const db = new DatabaseService(), service = new CounterfactualMethodologyService(db);
const methodology = { baselineModel: "HOLD_CONSTANT_UNITS_MARK_TO_MARK_V1", observationHorizonSeconds: 86400, externalFactorPredicates: ["market.benchmark_return.bps", "market.volatility.bps"], benchmarkPredicate: "market.benchmark_return.bps", opportunityCostMethod: "BENCHMARK_RETURN_DIFFERENCE_V1", riskAdjustmentMethod: "EXCESS_RETURN_PER_MAX_DRAWDOWN_V1", transactionCostTreatment: "OBSERVED_DISJOINT_COST_REQUIRED", missingDataPolicy: "REFUSE_ASSESSMENT" };
async function main() {
  await db.onModuleInit();
  try {
    await db.runAsSystem(() => db.transaction(async (client) => {
      await client.query("INSERT INTO organizations(id,name,status)VALUES($1,'CF','ACTIVE'),($2,'CF Other','ACTIVE')", [org, other]);
      await client.query("INSERT INTO policy_versions(id,organization_id,version,name,status,schema_version,config,content_hash)VALUES($1,$2,1,'CF Policy','ACTIVE','treasury.policy.v1',$3,$4)", [policy, org, { minimumEvidenceQuality: 85 }, `policyhash_${suffix}`]);
    }));
    const input = { methodologyKey: "hold-baseline", name: "Hold constant units", description: "Pre-registered benchmark and risk-adjusted counterfactual methodology", treasuryId: "treasury_core", policyVersionId: policy, methodology };
    const draft = await db.runWithTenant(org, "reviewer", "REVIEWER", () => service.create(org, "reviewer", input));
    const approved = await db.runWithTenant(org, "reviewer", "REVIEWER", () => service.approve(org, draft.id, "reviewer", "Approved prospectively for future executions only"));
    const second = await db.runWithTenant(org, "reviewer", "REVIEWER", () => service.create(org, "reviewer", { ...input, name: "Hold constant units v2" }));
    let competingApprovalRejected = false;
    try { await db.runWithTenant(org, "reviewer", "REVIEWER", () => service.approve(org, second.id, "reviewer", "Should fail while v1 is active")); } catch { competingApprovalRejected = true; }
    let crossTenantHidden = false;
    try { await db.runWithTenant(other, "reviewer", "REVIEWER", () => service.get(other, draft.id)); } catch { crossTenantHidden = true; }
    const immutable = await db.runWithTenant(org, "admin", "ADMIN", async () => { try { await db.query("UPDATE counterfactual_methodology_versions SET name='changed' WHERE organization_id=$1 AND id=$2", [org, draft.id]); return false; } catch { return true; } });
    const retired = await db.runWithTenant(org, "admin", "ADMIN", () => service.retire(org, draft.id, "admin", "Superseded prospectively"));
    const approvedSecond = await db.runWithTenant(org, "reviewer", "REVIEWER", () => service.approve(org, second.id, "reviewer", "Approved only after v1 retirement"));
    const auditCount = await db.runWithTenant(org, "auditor", "AUDITOR", async () => Number((await db.query("SELECT count(*)::int count FROM audit_events WHERE organization_id=$1 AND object_id=ANY($2::text[])", [org, [draft.id, second.id]])).rows[0].count));
    const checks = { drafted: draft.status === "DRAFT", humanApproved: approved.status === "HUMAN_APPROVED", prospectiveEffectiveTime: typeof approved.effectiveForExecutionsAfter === "string", noOnchainApprovalClaim: approved.onchainDaoApprovalObserved === false, noCounterfactualResult: approved.counterfactualResultAvailable === false, noNetBenefit: approved.netBenefitCalculated === false, noCausalAttribution: approved.causalAttributionEstablished === false, competingApprovalRejected, retired: retired.status === "RETIRED", replacementAfterRetirement: approvedSecond.status === "HUMAN_APPROVED", immutable, crossTenantHidden, auditAppended: auditCount === 5, assetExecutionAuthorized: approved.assetExecutionAuthorized === false };
    if (Object.values(checks).some((value) => !value)) throw new Error(`Counterfactual methodology checks failed: ${JSON.stringify(checks)}`);
    console.log(JSON.stringify({ schemaVersion: "aeos.counterfactual-methodology-db.v1", status: "PASS", checks, privateKeyUsed: false, assetExecutionAuthorized: false }));
  } finally { await db.onModuleDestroy(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Counterfactual methodology verification failed"); process.exitCode = 1; });
