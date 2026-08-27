import { createHash, randomUUID } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PoolClient } from "pg";
import { DatabaseService } from "./database.service";
import { CreateProposalDto } from "./proposal.dto";
import { buildErc20TransferAction, buildGovernorProposalIdentity, ERC20_TRANSFER_SELECTOR } from "./proposal-engine";

const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}` : JSON.stringify(value);
const hash = (value: unknown) => `0x${createHash("sha256").update(canonical(value)).digest("hex")}`;
const makeId = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;

@Injectable()
export class ProposalService {
  constructor(private readonly db: DatabaseService) {}

  async create(org: string, input: CreateProposalDto) {
    const decision = await this.db.query("SELECT d.*,s.manifest_hash,EXISTS(SELECT 1 FROM decision_reviews r WHERE r.organization_id=d.organization_id AND r.decision_id=d.id AND r.outcome='APPROVED') AS human_approval_recorded FROM decisions d JOIN evidence_snapshots s ON s.id=d.evidence_snapshot_id AND s.organization_id=d.organization_id WHERE d.organization_id=$1 AND d.id=$2", [org, input.decisionId]);
    if (!decision.rowCount) throw new NotFoundException("Decision not found");
    const simulation = await this.db.query("SELECT * FROM policy_simulations WHERE organization_id=$1 AND id=$2", [org, input.simulationId]);
    if (!simulation.rowCount) throw new NotFoundException("Simulation not found");
    const d = decision.rows[0]; const s = simulation.rows[0];
    if (d.status !== "APPROVED" || d.human_approval_recorded !== true) throw new BadRequestException("Decision requires an append-only human approval record");
    if (d.recommendation?.recommendation === "INSUFFICIENT_EVIDENCE" || Number(d.recommendation?.unresolvedDisagreements ?? 0) !== 0) throw new BadRequestException("Decision guardrails do not permit a proposal draft");
    if (s.status !== "SUGGESTED" || s.result?.schemaVersion !== "treasury.simulation.v2" || s.result?.status !== "SUGGESTED" || s.result?.blockers?.length || s.result?.assetExecutionAuthorized !== false) throw new BadRequestException("A passing advisory-only simulation with transaction impact is required");
    if (s.input?.transferAmountBaseUnits !== input.amountBaseUnits || s.result?.transactionImpact?.tokenBalance?.transferBaseUnits !== input.amountBaseUnits) throw new BadRequestException("Proposal transfer amount must exactly match the frozen Simulation impact");
    if (d.policy_version_id !== s.policy_version_id || d.evidence_snapshot_id !== s.evidence_snapshot_id) throw new BadRequestException("Decision and simulation snapshots do not match");
    const policy = await this.db.query("SELECT * FROM policy_versions WHERE organization_id=$1 AND id=$2", [org, d.policy_version_id]);
    if (!policy.rowCount) throw new NotFoundException("Policy version not found");
    let encoded;
    try { encoded = buildErc20TransferAction({ kind: input.kind, tokenContract: input.tokenContract, recipient: input.recipient, amountBaseUnits: input.amountBaseUnits, amountUsd: input.amountUsd }); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : "INVALID_PROPOSAL_ACTION"); }
    if (encoded.target !== String(s.input.targetContract).toLowerCase() || encoded.functionSelector !== String(s.input.functionSelector).toLowerCase()) throw new BadRequestException("Proposal action does not match the simulated target and function");
    if (input.amountUsd !== s.input.dailyTurnoverUsd) throw new BadRequestException("Proposal amount does not match the simulated turnover amount");
    const limits = policy.rows[0].config?.riskLimits;
    if (!limits?.allowedTargetContracts?.map((item: string) => item.toLowerCase()).includes(encoded.target) || !limits?.allowedFunctionSelectors?.map((item: string) => item.toLowerCase()).includes(ERC20_TRANSFER_SELECTOR)) throw new BadRequestException("Proposal action is outside the frozen policy allowlist");
    const targets = [encoded.target]; const values = [encoded.value]; const calldatas = [encoded.calldata]; const calldataHash = hash({ targets, values, calldatas });
    const governorDescription = `${input.title}\n\n${input.summary}\n\nDecision: ${d.id}\nDecision output hash: ${d.output_hash}\nEvidence manifest hash: ${d.manifest_hash}\nPolicy hash: ${policy.rows[0].content_hash}\nSimulation result hash: ${s.result_hash}`;
    const governor = buildGovernorProposalIdentity(targets, values, calldatas, governorDescription);
    const content = { schemaVersion: "governance.proposal.v1", proposalType: "TREASURY_ACTION", title: input.title, summary: input.summary, rationale: input.rationale, decision: { id: d.id, outputHash: d.output_hash }, evidenceSnapshot: { id: d.evidence_snapshot_id, manifestHash: d.manifest_hash }, policy: { id: d.policy_version_id, contentHash: policy.rows[0].content_hash }, simulation: { id: s.id, resultHash: s.result_hash }, action: encoded.action, transaction: { targets, values, calldatas, calldataHash, decoded: [encoded.decoded], consistencyVerified: true }, governor, governanceAuthorization: "NOT_SUBMITTED", advisoryOnly: true, assetExecutionAuthorized: false };
    const contentHash = hash(content);
    return this.db.transaction(async (client) => {
      const saved = await client.query("INSERT INTO proposals(id,organization_id,decision_id,policy_version_id,evidence_snapshot_id,simulation_id,proposal_type,state,title,summary,rationale,action,targets,values_json,calldatas,calldata_hash,content,content_hash,created_by) VALUES($1,$2,$3,$4,$5,$6,'TREASURY_ACTION','DRAFT',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT(organization_id,content_hash) DO NOTHING RETURNING *", [makeId("proposal"), org, d.id, d.policy_version_id, d.evidence_snapshot_id, s.id, input.title, input.summary, input.rationale, encoded.action, JSON.stringify(targets), JSON.stringify(values), JSON.stringify(calldatas), calldataHash, content, contentHash, input.createdBy]);
      const row = saved.rowCount ? saved.rows[0] : (await client.query("SELECT * FROM proposals WHERE organization_id=$1 AND content_hash=$2", [org, contentHash])).rows[0];
      if (saved.rowCount) await this.audit(client, org, row.id, { decisionId: d.id, simulationId: s.id, calldataHash, contentHash, governanceAuthorization: "NOT_SUBMITTED", assetExecutionAuthorized: false }, input.createdBy);
      return this.map(row);
    });
  }

  async list(org: string) {
    const result = await this.db.query("SELECT p.*,coalesce((SELECT o.state FROM proposal_state_observations o WHERE o.organization_id=p.organization_id AND o.proposal_id=p.id ORDER BY o.ordinal DESC LIMIT 1),p.state) AS effective_state,'DRAFT'::text AS record_source,false AS onchain_finality_verified FROM proposals p WHERE p.organization_id=$1 UNION ALL SELECT c.id,c.organization_id,c.decision_id,NULL::text AS policy_version_id,c.evidence_snapshot_id,NULL::text AS simulation_id,c.proposal_type,c.state,c.title,'Canonical chain-synchronized governance lifecycle'::text AS summary,'Imported only after immutable Outcome finality verification'::text AS rationale,jsonb_build_object('kind','SECURITY_HOLD','targets',c.targets,'values',c.values_json,'calldatas',c.calldatas) AS action,c.targets,c.values_json,c.calldatas,c.calldata_hash,c.payload AS content,c.content_hash,'canonical-finality-importer'::text AS created_by,c.created_at,c.state AS effective_state,'CHAIN_FINALITY'::text AS record_source,true AS onchain_finality_verified FROM chain_governance_proposals c WHERE c.organization_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100", [org]);
    return { items: result.rows.map((row) => this.map(row)) };
  }
  async get(org: string, proposalId: string) {
    const result = await this.db.query("SELECT p.*,coalesce((SELECT o.state FROM proposal_state_observations o WHERE o.organization_id=p.organization_id AND o.proposal_id=p.id ORDER BY o.ordinal DESC LIMIT 1),p.state) AS effective_state,'DRAFT'::text AS record_source,false AS onchain_finality_verified FROM proposals p WHERE p.organization_id=$1 AND p.id=$2 UNION ALL SELECT c.id,c.organization_id,c.decision_id,NULL::text,c.evidence_snapshot_id,NULL::text,c.proposal_type,c.state,c.title,'Canonical chain-synchronized governance lifecycle'::text,'Imported only after immutable Outcome finality verification'::text,jsonb_build_object('kind','SECURITY_HOLD','targets',c.targets,'values',c.values_json,'calldatas',c.calldatas),c.targets,c.values_json,c.calldatas,c.calldata_hash,c.payload,c.content_hash,'canonical-finality-importer'::text,c.created_at,c.state,'CHAIN_FINALITY'::text,true FROM chain_governance_proposals c WHERE c.organization_id=$1 AND c.id=$2", [org, proposalId]);
    if (!result.rowCount) throw new NotFoundException("Proposal not found"); return this.map(result.rows[0]);
  }
  private async audit(client: PoolClient, org: string, objectId: string, data: unknown, actorId: string) { const payload = { eventType: "proposal.drafted", organizationId: org, objectType: "proposal", objectId, data }; await client.query("INSERT INTO audit_events(id,organization_id,event_type,actor,action,object_type,object_id,data,payload_hash) VALUES($1,$2,'proposal.drafted',$3,'proposal.drafted','proposal',$4,$5,$6)", [makeId("audit"), org, { type: "human", id: actorId }, objectId, data, hash(payload)]); }
  private map(row: any) { return { id: row.id, organizationId: row.organization_id, decisionId: row.decision_id, policyVersionId: row.policy_version_id, evidenceSnapshotId: row.evidence_snapshot_id, simulationId: row.simulation_id, proposalType: row.proposal_type, state: row.state, effectiveState: row.effective_state ?? row.state, title: row.title, summary: row.summary, rationale: row.rationale, action: row.action, targets: row.targets, values: row.values_json, calldatas: row.calldatas, calldataHash: row.calldata_hash, content: row.content, contentHash: row.content_hash, createdBy: row.created_by, recordSource: row.record_source ?? "DRAFT", onchainFinalityVerified: row.onchain_finality_verified === true, assetExecutionAuthorized: false, createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined }; }
}
