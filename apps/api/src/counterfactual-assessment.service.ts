import { createHash, randomUUID } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PoolClient } from "pg";
import { DatabaseService } from "./database.service";
import { assessCounterfactual, CounterfactualEvidence } from "./counterfactual-assessment-engine";
import { CreateCounterfactualAssessmentDto } from "./counterfactual-assessment.dto";

const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}` : JSON.stringify(value);
const hash = (value: unknown) => `0x${createHash("sha256").update(canonical(value)).digest("hex")}`;
const id = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;

@Injectable()
export class CounterfactualAssessmentService {
  constructor(private readonly db: DatabaseService) {}

  async create(org: string, outcomeId: string, input: CreateCounterfactualAssessmentDto, actorId: string) {
    const outcomeResult = await this.db.query(`SELECT o.*,s.observed_at AS execution_observed_at,s.execution_tx_hash,s.execution_block_number,s.execution_block_hash
      FROM treasury_outcome_assessments o JOIN safe_transaction_observations s ON s.organization_id=o.organization_id AND s.id=o.safe_observation_id
      WHERE o.organization_id=$1 AND o.id=$2 AND s.state='EXECUTED' AND s.onchain_execution_confirmed=true`, [org, outcomeId]);
    if (!outcomeResult.rowCount) throw new NotFoundException("Execution-linked Treasury outcome not found");
    const outcome = outcomeResult.rows[0];
    const methodResult = await this.db.query(`SELECT m.*,e.created_at AS effective_at FROM counterfactual_methodology_versions m
      JOIN LATERAL(SELECT status,created_at FROM counterfactual_methodology_events WHERE organization_id=m.organization_id AND methodology_version_id=m.id ORDER BY ordinal DESC LIMIT 1)e ON true
      WHERE m.organization_id=$1 AND m.id=$2 AND e.status='HUMAN_APPROVED'`, [org, input.methodologyVersionId]);
    if (!methodResult.rowCount) throw new NotFoundException("Human-approved counterfactual methodology not found");
    const method = methodResult.rows[0];
    if (method.treasury_id !== outcome.treasury_id || method.policy_version_id !== outcome.policy_version_id) throw new BadRequestException("COUNTERFACTUAL_METHOD_LINEAGE_MISMATCH");
    const costResult = await this.db.query("SELECT * FROM treasury_transaction_cost_assessments WHERE organization_id=$1 AND id=$2 AND treasury_outcome_id=$3", [org, input.transactionCostAssessmentId, outcomeId]);
    if (!costResult.rowCount) throw new NotFoundException("Matching transaction cost assessment not found");
    const cost = costResult.rows[0];
    const snapshotResult = await this.db.query("SELECT * FROM evidence_snapshots WHERE organization_id=$1 AND id=$2", [org, input.evidenceSnapshotId]);
    if (!snapshotResult.rowCount) throw new NotFoundException("Counterfactual Evidence snapshot not found");
    const manifest = snapshotResult.rows[0].manifest as Array<{ evidenceId: string; contentHash: string }>;
    const rows = await this.db.query("SELECT id,content_hash,predicate,subject,value,source,verification_status,quality_score,conflict_group_id,observed_at FROM evidence WHERE organization_id=$1 AND id=ANY($2::text[])", [org, manifest.map(item => item.evidenceId)]);
    const window = outcome.assessment?.observationWindow;
    const costAssessment = cost.assessment;
    let assessment;
    try {
      assessment = assessCounterfactual({
        treasuryId: outcome.treasury_id, policyVersionId: outcome.policy_version_id, outcomeId,
        executionObservedAt: new Date(outcome.execution_observed_at).toISOString(), windowStart: window?.before, windowEnd: window?.after,
        methodologyId: method.id, methodologyContentHash: method.content_hash, methodologyEffectiveAt: new Date(method.effective_at).toISOString(),
        methodology: method.content.methodology, minimumQuality: Number(method.content.minimumEvidenceQuality ?? 80), manifest,
        evidence: rows.rows.map(row => ({ id: row.id, contentHash: row.content_hash, predicate: row.predicate, subject: row.subject, value: row.value, source: row.source, verificationStatus: row.verification_status, qualityScore: Number(row.quality_score), conflictGroupId: row.conflict_group_id, observedAt: row.observed_at })) as CounterfactualEvidence[],
        transactionCostAssessmentId: cost.id,
        transactionCost: { totalObservedCostAtomic: costAssessment.components.totalObservedCostAtomic, numeraire: costAssessment.numeraire, evidenceRefs: costAssessment.evidenceRefs },
      });
    } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : "INVALID_COUNTERFACTUAL_ASSESSMENT"); }
    const assessmentHash = hash(assessment);
    return this.db.transaction(async client => {
      const saved = await client.query(`INSERT INTO treasury_counterfactual_assessments(id,organization_id,treasury_outcome_id,treasury_id,policy_version_id,safe_observation_id,methodology_version_id,transaction_cost_assessment_id,evidence_snapshot_id,classification,assessment,assessment_hash,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(organization_id,treasury_outcome_id,methodology_version_id,transaction_cost_assessment_id,evidence_snapshot_id) DO NOTHING RETURNING *`,
        [id("cfassessment"), org, outcomeId, outcome.treasury_id, outcome.policy_version_id, outcome.safe_observation_id, method.id, cost.id, input.evidenceSnapshotId, assessment.classification, assessment, assessmentHash, actorId]);
      const row = saved.rowCount ? saved.rows[0] : (await client.query("SELECT * FROM treasury_counterfactual_assessments WHERE organization_id=$1 AND treasury_outcome_id=$2 AND methodology_version_id=$3 AND transaction_cost_assessment_id=$4 AND evidence_snapshot_id=$5", [org, outcomeId, method.id, cost.id, input.evidenceSnapshotId])).rows[0];
      if (saved.rowCount) await this.audit(client, org, row.id, actorId, { outcomeId, methodologyVersionId: method.id, transactionCostAssessmentId: cost.id, evidenceSnapshotId: input.evidenceSnapshotId, assessmentHash, classification: assessment.classification, causalAttribution: "NOT_ESTABLISHED", assetExecutionAuthorized: false });
      return this.map(row);
    });
  }

  async list(org: string, outcomeId: string) {
    const exists = await this.db.query("SELECT 1 FROM treasury_outcome_assessments WHERE organization_id=$1 AND id=$2", [org, outcomeId]);
    if (!exists.rowCount) throw new NotFoundException("Treasury outcome not found");
    const result = await this.db.query("SELECT * FROM treasury_counterfactual_assessments WHERE organization_id=$1 AND treasury_outcome_id=$2 ORDER BY created_at DESC,id DESC LIMIT 100", [org, outcomeId]);
    return { items: result.rows.map(row => this.map(row)) };
  }
  async get(org: string, outcomeId: string, assessmentId: string) {
    const result = await this.db.query("SELECT * FROM treasury_counterfactual_assessments WHERE organization_id=$1 AND treasury_outcome_id=$2 AND id=$3", [org, outcomeId, assessmentId]);
    if (!result.rowCount) throw new NotFoundException("Counterfactual assessment not found");
    return this.map(result.rows[0]);
  }
  private map(row: any) { return { id: row.id, organizationId: row.organization_id, treasuryOutcomeId: row.treasury_outcome_id, treasuryId: row.treasury_id, policyVersionId: row.policy_version_id, safeObservationId: row.safe_observation_id, methodologyVersionId: row.methodology_version_id, transactionCostAssessmentId: row.transaction_cost_assessment_id, evidenceSnapshotId: row.evidence_snapshot_id, classification: row.classification, assessment: row.assessment, assessmentHash: row.assessment_hash, createdBy: row.created_by, counterfactualEstimateAvailable: true, causalAttributionEstablished: false, causalNetBenefitEstablished: false, memoryPromotionAuthorized: false, skillPromotionAuthorized: false, advisoryOnly: true, assetExecutionAuthorized: false, createdAt: new Date(row.created_at).toISOString() }; }
  private async audit(client: PoolClient, org: string, objectId: string, actorId: string, data: unknown) {
    const payload = { eventType: "treasury.counterfactual_assessed", organizationId: org, objectType: "treasury_counterfactual_assessment", objectId, data };
    await client.query("INSERT INTO audit_events(id,organization_id,event_type,actor,action,object_type,object_id,data,payload_hash)VALUES($1,$2,'treasury.counterfactual_assessed',$3,'treasury.counterfactual_assessed','treasury_counterfactual_assessment',$4,$5,$6)", [id("audit"), org, { type: "human", id: actorId }, objectId, data, hash(payload)]);
  }
}
