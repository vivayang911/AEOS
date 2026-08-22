import { createHash, randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { PoolClient } from "pg";
import { DatabaseService } from "./database.service";
import { CreateExecutionPreflightDto } from "./execution.dto";
import { buildExecutionPreflight, executionActionId } from "./execution-engine";
import { simulatePolicy, validateTreasuryPolicy } from "./policy-engine";
import { buildErc20TransferAction } from "./proposal-engine";
import { TREASURY_GUARD_ADAPTER, TreasuryGuardReadAdapter } from "./treasury-guard-adapter";

const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}` : JSON.stringify(value);
const hash = (value: unknown) => `0x${createHash("sha256").update(canonical(value)).digest("hex")}`;
const makeId = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;

@Injectable()
export class ExecutionService {
  constructor(private readonly db: DatabaseService, @Inject(TREASURY_GUARD_ADAPTER) private readonly guard: TreasuryGuardReadAdapter) {}
  configuration() { return this.guard.configuration(); }

  async preflight(org: string, proposalId: string, input: CreateExecutionPreflightDto) {
    const proposalResult = await this.db.query("SELECT * FROM proposals WHERE organization_id=$1 AND id=$2", [org, proposalId]); if (!proposalResult.rowCount) throw new NotFoundException("Proposal not found"); const proposal = proposalResult.rows[0];
    const policyResult = await this.db.query("SELECT * FROM policy_versions WHERE organization_id=$1 AND id=$2", [org, proposal.policy_version_id]); if (!policyResult.rowCount) throw new NotFoundException("Policy not found"); const policy = policyResult.rows[0];
    let config; try { config = validateTreasuryPolicy(policy.config); } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : "INVALID_POLICY"); }
    const simulationResult = await this.db.query("SELECT * FROM policy_simulations WHERE organization_id=$1 AND id=$2", [org, proposal.simulation_id]); if (!simulationResult.rowCount) throw new NotFoundException("Simulation not found"); const simulation = simulationResult.rows[0];
    const snapshotResult = await this.db.query("SELECT * FROM evidence_snapshots WHERE organization_id=$1 AND id=$2", [org, proposal.evidence_snapshot_id]); if (!snapshotResult.rowCount) throw new NotFoundException("Evidence snapshot not found"); const snapshot = snapshotResult.rows[0];
    const manifest = snapshot.manifest as { evidenceId:string;contentHash:string }[]; const evidence = await this.db.query("SELECT id,content_hash,verification_status,freshness_expires_at,quality_score,conflict_group_id FROM evidence WHERE organization_id=$1 AND id=ANY($2::text[])", [org, manifest.map((item) => item.evidenceId)]); const byId = new Map(evidence.rows.map((row) => [row.id,row]));
    const evidenceEligible = manifest.length > 0 && manifest.every((item) => { const row = byId.get(item.evidenceId); return row && row.content_hash === item.contentHash && row.verification_status === "VERIFIED" && new Date(row.freshness_expires_at).getTime() > Date.now() && row.quality_score >= config.minimumEvidenceQuality && !row.conflict_group_id; });
    const governanceResult = await this.db.query("SELECT * FROM proposal_state_observations WHERE organization_id=$1 AND proposal_id=$2 ORDER BY ordinal DESC LIMIT 1", [org, proposalId]); const governance = governanceResult.rows[0] ?? null;
    let action; try { action = buildErc20TransferAction(proposal.action); } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : "INVALID_PROPOSAL_ACTION"); }
    const governanceHash = governance?.payload_hash ?? `0x${"00".repeat(32)}`; const actionId = executionActionId(proposal.content_hash, governanceHash, policy.content_hash);
    let guardSnapshot; try { guardSnapshot = await this.guard.read({ actionId, target: action.target, selector: action.functionSelector }); } catch (error) { throw new ServiceUnavailableException({ message: "TreasuryGuard read failed", code: error instanceof Error ? error.message : "GUARD_READ_FAILED" }); }
    let resimulation; try { resimulation = simulatePolicy(config, simulation.input, evidenceEligible); } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : "RESIMULATION_FAILED"); }
    const createdAt = new Date(); const expiresAt = new Date(createdAt.getTime() + input.validForSeconds * 1000); const deadline = Math.floor(expiresAt.getTime()/1000);
    const result = buildExecutionPreflight({ proposal, policy, governance, guard: guardSnapshot, evidenceEligible, resimulation, actionId, actionCalldata: action.calldata, actionTarget: action.target, actionSelector: action.functionSelector, deadline, expiresAt: expiresAt.toISOString() });
    const frozenInput = { proposalId, proposalContentHash: proposal.content_hash, policyVersionId: policy.id, policyContentHash: policy.content_hash, evidenceSnapshotId: snapshot.id, evidenceManifestHash: snapshot.manifest_hash, governanceObservationId: governance?.id ?? null, governancePayloadHash: governance?.payload_hash ?? null, originalSimulationId: simulation.id, originalSimulationResultHash: simulation.result_hash, guardProvider: this.guard.provider, guardBlockHash: guardSnapshot.blockHash, actorId: input.actorId, createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString() };
    const inputHash = hash(frozenInput); const resultHash = hash(result);
    return this.db.transaction(async (client) => { const saved = await client.query("INSERT INTO execution_preflights(id,organization_id,proposal_id,policy_version_id,evidence_snapshot_id,governance_observation_id,status,action_id,input,input_hash,result,result_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *", [makeId("preflight"),org,proposalId,policy.id,snapshot.id,governance?.id??null,result.status,actionId,frozenInput,inputHash,result,resultHash,expiresAt.toISOString()]); await this.audit(client,org,saved.rows[0].id,{proposalId,status:result.status,blockers:result.blockers,actionId,safeHandoffPrepared:Boolean(result.safeHandoff),signed:false,submitted:false,assetExecutionAuthorized:false},input.actorId); return this.map(saved.rows[0]); });
  }

  async list(org:string,proposalId:string){const proposal=await this.db.query("SELECT 1 FROM proposals WHERE organization_id=$1 AND id=$2",[org,proposalId]);if(!proposal.rowCount)throw new NotFoundException("Proposal not found");const result=await this.db.query("SELECT * FROM execution_preflights WHERE organization_id=$1 AND proposal_id=$2 ORDER BY created_at DESC,id DESC LIMIT 100",[org,proposalId]);return {items:result.rows.map((row)=>this.map(row))}}
  async get(org:string,id:string){const result=await this.db.query("SELECT * FROM execution_preflights WHERE organization_id=$1 AND id=$2",[org,id]);if(!result.rowCount)throw new NotFoundException("Execution preflight not found");return this.map(result.rows[0])}
  private async audit(client:PoolClient,org:string,objectId:string,data:unknown,actorId:string){const payload={eventType:"execution.preflight_created",organizationId:org,objectType:"execution_preflight",objectId,data};await client.query("INSERT INTO audit_events(id,organization_id,event_type,actor,action,object_type,object_id,data,payload_hash) VALUES($1,$2,'execution.preflight_created',$3,'execution.preflight_created','execution_preflight',$4,$5,$6)",[makeId("audit"),org,{type:"human",id:actorId},objectId,data,hash(payload)])}
  private map(row:any){return {id:row.id,organizationId:row.organization_id,proposalId:row.proposal_id,policyVersionId:row.policy_version_id,evidenceSnapshotId:row.evidence_snapshot_id,governanceObservationId:row.governance_observation_id,status:row.status,actionId:row.action_id,input:row.input,inputHash:row.input_hash,result:row.result,resultHash:row.result_hash,expiresAt:new Date(row.expires_at).toISOString(),createdAt:new Date(row.created_at).toISOString(),assetExecutionAuthorized:false}}
}
