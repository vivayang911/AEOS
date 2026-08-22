import { createHash, randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PoolClient } from "pg";
import { DatabaseService } from "./database.service";
import { CreatePolicyDto, SimulatePolicyDto } from "./policy.dto";
import { CreateAdaptivePidSnapshotDto, CreateEvidenceBoundAdaptivePidSnapshotDto } from "./policy.dto";
import { TreasuryPolicyConfig, simulatePolicy, validateTreasuryPolicy } from "./policy-engine";
import { comparePolicyScenarios, POLICY_SCENARIO_SUITE_VERSION } from "./policy-backtest-engine";
import { runAdaptivePid, validateAdaptivePidEnvelope } from "./adaptive-pid-engine";
import { applyGovernedSkills } from "./governed-skill-engine";
import { loadApprovedGovernedSkills } from "./governed-skill.service";
import { deriveEvidenceObservedState, ObservedStateEvidence } from "./evidence-observed-state-engine";

const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}` : JSON.stringify(value);
const hash = (value: unknown) => `0x${createHash("sha256").update(canonical(value)).digest("hex")}`;
const makeId = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;

@Injectable()
export class PolicyService {
  constructor(private readonly db: DatabaseService) {}

  async createDraft(org: string, input: CreatePolicyDto) {
    let config: TreasuryPolicyConfig;
    try {
      config = structuredClone(input.config);
      config.riskLimits.allowedTargetContracts = [...new Set(config.riskLimits.allowedTargetContracts.map((item) => item.toLowerCase()))].sort();
      config.riskLimits.allowedFunctionSelectors = [...new Set(config.riskLimits.allowedFunctionSelectors.map((item) => item.toLowerCase()))].sort();
      validateTreasuryPolicy(config);
    } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : "INVALID_POLICY"); }
    return this.db.transaction(async (client) => {
      await client.query("INSERT INTO organizations(id,name) VALUES($1,$2) ON CONFLICT(id) DO NOTHING", [org, "AEOS DAO"]);
      await client.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [org]);
      await loadApprovedGovernedSkills(client,org,config.governedSkillVersionIds??[]);
      const next = await client.query<{ version: number }>("SELECT coalesce(max(version),0)::int+1 AS version FROM policy_versions WHERE organization_id=$1", [org]);
      const content = { schemaVersion: "treasury.policy.v1", name: input.name, version: next.rows[0].version, config };
      const saved = await client.query("INSERT INTO policy_versions(id,organization_id,version,name,status,schema_version,config,content_hash) VALUES($1,$2,$3,$4,'DRAFT','treasury.policy.v1',$5,$6) RETURNING *", [makeId("policy"), org, content.version, input.name, config, hash(content)]);
      await this.audit(client, org, "policy.drafted", saved.rows[0].id, { version: content.version, contentHash: saved.rows[0].content_hash });
      return this.map(saved.rows[0]);
    });
  }

  async list(org: string) { const result = await this.db.query("SELECT * FROM policy_versions WHERE organization_id=$1 ORDER BY version DESC", [org]); return { items: result.rows.map((row) => this.map(row)) }; }
  async get(org: string, policyId: string) { return this.map(await this.requirePolicy(org, policyId)); }

  async activate(org: string, policyId: string, actorId: string) {
    return this.db.transaction(async (client) => {
      const found = await client.query("SELECT * FROM policy_versions WHERE organization_id=$1 AND id=$2 FOR UPDATE", [org, policyId]);
      if (!found.rowCount) throw new NotFoundException("Policy version not found");
      if (found.rows[0].status === "ACTIVE") return this.map(found.rows[0]);
      if (found.rows[0].status !== "DRAFT") throw new ConflictException("Only a draft policy can be activated");
      await loadApprovedGovernedSkills(client,org,(found.rows[0].config as TreasuryPolicyConfig).governedSkillVersionIds??[]);
      await client.query("UPDATE policy_versions SET status='RETIRED' WHERE organization_id=$1 AND status='ACTIVE'", [org]);
      const saved = await client.query("UPDATE policy_versions SET status='ACTIVE',activated_at=now(),activated_by=$3 WHERE organization_id=$1 AND id=$2 AND status='DRAFT' RETURNING *", [org, policyId, actorId]);
      await this.audit(client, org, "policy.activated", policyId, { actorId, version: saved.rows[0].version, contentHash: saved.rows[0].content_hash });
      return this.map(saved.rows[0]);
    });
  }

  async simulate(org: string, policyId: string, input: SimulatePolicyDto) {
    const policy = await this.requirePolicy(org, policyId);
    let config: TreasuryPolicyConfig;
    try { config = validateTreasuryPolicy(policy.config); } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : "INVALID_POLICY"); }
    const snapshot = await this.db.query("SELECT * FROM evidence_snapshots WHERE organization_id=$1 AND id=$2", [org, input.evidenceSnapshotId]);
    if (!snapshot.rowCount) throw new NotFoundException("Evidence snapshot not found");
    const manifest = snapshot.rows[0].manifest as { evidenceId: string; contentHash: string }[];
    const evidenceIds = manifest.map((item) => item.evidenceId);
    const evidence = await this.db.query("SELECT id,content_hash,verification_status,freshness_expires_at,quality_score,conflict_group_id FROM evidence WHERE organization_id=$1 AND id=ANY($2::text[])", [org, evidenceIds]);
    const byId = new Map(evidence.rows.map((row) => [row.id, row]));
    const evidenceEligible = manifest.length > 0 && manifest.every((item) => { const row = byId.get(item.evidenceId); return row && row.content_hash === item.contentHash && row.verification_status === "VERIFIED" && new Date(row.freshness_expires_at).getTime() > Date.now() && row.quality_score >= config.minimumEvidenceQuality && !row.conflict_group_id; });
    const frozenInput = { ...input, targetContract: input.targetContract.toLowerCase(), functionSelector: input.functionSelector.toLowerCase(), policyVersionId: policyId, policyContentHash: policy.content_hash, evidenceManifestHash: snapshot.rows[0].manifest_hash };
    let result;
    try { result = simulatePolicy(config, frozenInput, evidenceEligible); } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : "INVALID_SIMULATION_INPUT"); }
    const inputHash = hash(frozenInput); const resultHash = hash(result);
    return this.db.transaction(async (client) => {
      const saved = await client.query("INSERT INTO policy_simulations(id,organization_id,policy_version_id,evidence_snapshot_id,status,input,input_hash,result,result_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(organization_id,policy_version_id,input_hash) DO NOTHING RETURNING *", [makeId("sim"), org, policyId, input.evidenceSnapshotId, result.status, frozenInput, inputHash, result, resultHash]);
      const row = saved.rowCount ? saved.rows[0] : (await client.query("SELECT * FROM policy_simulations WHERE organization_id=$1 AND policy_version_id=$2 AND input_hash=$3", [org, policyId, inputHash])).rows[0];
      if (saved.rowCount) await this.audit(client, org, result.status === "SUGGESTED" ? "policy.simulation_suggested" : "policy.simulation_blocked", row.id, { policyVersionId: policyId, inputHash, resultHash, blockers: result.blockers, assetExecutionAuthorized: false });
      return this.mapSimulation(row);
    });
  }

  async listSimulations(org: string, policyId: string) { await this.requirePolicy(org, policyId); const result = await this.db.query("SELECT * FROM policy_simulations WHERE organization_id=$1 AND policy_version_id=$2 ORDER BY created_at DESC,id DESC LIMIT 100", [org, policyId]); return { items: result.rows.map((row) => this.mapSimulation(row)) }; }
  async createAdaptivePidSnapshot(org:string,policyId:string,input:CreateAdaptivePidSnapshotDto,actorId:string){return this.createAdaptivePidSnapshotInternal(org,policyId,input,actorId,{sourceMode:"DETERMINISTIC_SCENARIO_INPUT",observedState:null})}
  async createEvidenceBoundAdaptivePidSnapshot(org:string,policyId:string,input:CreateEvidenceBoundAdaptivePidSnapshotDto,actorId:string){
    const policy=await this.requirePolicy(org,policyId);if(policy.status!=="ACTIVE")throw new ConflictException("Adaptive PID requires the active DAO policy version");const config=validateTreasuryPolicy(structuredClone(policy.config))as TreasuryPolicyConfig;const observation=config.adaptivePid?.evidenceObservation;if(!observation)throw new BadRequestException("EVIDENCE_BOUND_PID_POLICY_NOT_CONFIGURED");
    const snapshot=await this.db.query("SELECT * FROM evidence_snapshots WHERE organization_id=$1 AND id=$2",[org,input.evidenceSnapshotId]);if(!snapshot.rowCount)throw new NotFoundException("Evidence snapshot not found");const manifest=snapshot.rows[0].manifest as {evidenceId:string;contentHash:string}[],ids=manifest.map(item=>item.evidenceId);
    const evidence=await this.db.query("SELECT e.id,e.content_hash,e.predicate,e.subject,e.value,e.source,e.verification_status,e.freshness_expires_at,e.quality_score,e.conflict_group_id,e.observed_at,EXISTS(SELECT 1 FROM attestcoin_proof_jobs j WHERE j.organization_id=e.organization_id AND j.evidence_id=e.id AND j.status='VERIFIED' AND j.proof_snapshot_hash IS NOT NULL AND j.verification_request_hash IS NOT NULL AND j.verification_receipt_hash IS NOT NULL) AS attestcoin_usc_verified FROM evidence e WHERE e.organization_id=$1 AND e.id=ANY($2::text[])",[org,ids]);let observedState;try{observedState=deriveEvidenceObservedState({manifest,evidence:evidence.rows.map(row=>({id:row.id,contentHash:row.content_hash,predicate:row.predicate,subject:row.subject,value:row.value,source:row.source,verificationStatus:row.verification_status,freshnessExpiresAt:row.freshness_expires_at,qualityScore:Number(row.quality_score),conflictGroupId:row.conflict_group_id,observedAt:row.observed_at,attestcoinUscVerified:row.attestcoin_usc_verified===true}))as ObservedStateEvidence[],treasuryId:input.treasuryId,minimumQuality:config.minimumEvidenceQuality,maxMetricSkewMs:observation.maxMetricSkewMs})}catch(error){throw new BadRequestException(error instanceof Error?error.message:"INVALID_EVIDENCE_OBSERVED_STATE")}
    let previousErrorBps=config.targetAllocationBps-observedState.observedAllocationBps,integralErrorBps=0,previousFilteredDerivativeBpsPerDay=0,previousOutputBps=0,previousGains={kpBps:config.pid.kpBps,kiBps:config.pid.kiBps,kdBps:config.pid.kdBps},deltaTimeMs=observation.samplePeriodMs;
    if(input.previousAdaptivePidSnapshotId){const previous=await this.db.query("SELECT * FROM adaptive_pid_snapshots WHERE organization_id=$1 AND policy_version_id=$2 AND treasury_id=$3 AND id=$4",[org,policyId,input.treasuryId,input.previousAdaptivePidSnapshotId]);if(!previous.rowCount)throw new NotFoundException("Previous adaptive PID snapshot not found");const priorInput=previous.rows[0].input,priorResult=previous.rows[0].result;if(priorInput.sourceMode!=="EVIDENCE_DERIVED_OBSERVED_STATE"||!priorInput.observedState?.observationAt)throw new BadRequestException("PREVIOUS_PID_SNAPSHOT_NOT_EVIDENCE_BOUND");deltaTimeMs=new Date(observedState.observationAt).getTime()-new Date(priorInput.observedState.observationAt).getTime();if(deltaTimeMs<=0||deltaTimeMs>observation.samplePeriodMs*10)throw new BadRequestException("EVIDENCE_OBSERVATION_INTERVAL_INVALID");previousErrorBps=Number(priorResult.errorBps);integralErrorBps=Number(priorResult.controllerState.integralErrorBps);previousFilteredDerivativeBpsPerDay=Number(priorResult.controllerState.filteredDerivativeBpsPerDay);previousOutputBps=Number(priorResult.boundedOutputBps);previousGains={kpBps:Number(priorResult.gains.kpBps),kiBps:Number(priorResult.gains.kiBps),kdBps:Number(priorResult.gains.kdBps)}}
    return this.createAdaptivePidSnapshotInternal(org,policyId,{treasuryId:input.treasuryId,evidenceSnapshotId:input.evidenceSnapshotId,decisionId:input.decisionId,observedAllocationBps:observedState.observedAllocationBps,previousErrorBps,integralErrorBps,previousFilteredDerivativeBpsPerDay,previousOutputBps,previousGains,deltaTimeMs,volatilityBps:observedState.volatilityBps,liquidityDropBps:observedState.liquidityDropBps,pegDeviationBps:observedState.pegDeviationBps,criticalIncident:observedState.criticalIncident},actorId,{sourceMode:"EVIDENCE_DERIVED_OBSERVED_STATE",observedState,previousAdaptivePidSnapshotId:input.previousAdaptivePidSnapshotId??null});
  }
  private async createAdaptivePidSnapshotInternal(org:string,policyId:string,input:CreateAdaptivePidSnapshotDto,actorId:string,source:{sourceMode:"DETERMINISTIC_SCENARIO_INPUT"|"EVIDENCE_DERIVED_OBSERVED_STATE";observedState:unknown;previousAdaptivePidSnapshotId?:string|null}){
    const policy=await this.requirePolicy(org,policyId);if(policy.status!=="ACTIVE")throw new ConflictException("Adaptive PID requires the active DAO policy version");
    const config=validateTreasuryPolicy(structuredClone(policy.config)) as TreasuryPolicyConfig;const envelope=config.adaptivePid;try{validateAdaptivePidEnvelope(config,envelope!)}catch(error){throw new BadRequestException(error instanceof Error?error.message:"INVALID_ADAPTIVE_PID_POLICY")}
    const snapshot=await this.db.query("SELECT * FROM evidence_snapshots WHERE organization_id=$1 AND id=$2",[org,input.evidenceSnapshotId]);if(!snapshot.rowCount)throw new NotFoundException("Evidence snapshot not found");
    const manifest=snapshot.rows[0].manifest as {evidenceId:string;contentHash:string}[];const evidenceIds=manifest.map(item=>item.evidenceId);const evidence=await this.db.query("SELECT id,content_hash,verification_status,freshness_expires_at,quality_score,conflict_group_id FROM evidence WHERE organization_id=$1 AND id=ANY($2::text[])",[org,evidenceIds]);const byId=new Map(evidence.rows.map(row=>[row.id,row]));
    const eligible=manifest.length>0&&manifest.every(item=>{const row=byId.get(item.evidenceId);return row&&row.content_hash===item.contentHash&&row.verification_status==="VERIFIED"&&new Date(row.freshness_expires_at).getTime()>Date.now()&&!row.conflict_group_id});const evidenceConfidenceBps=eligible?Math.min(...manifest.map(item=>Number(byId.get(item.evidenceId)!.quality_score)*100)):0;
    let ragManifestHashes:string[]=[];if(input.decisionId){const decision=await this.db.query("SELECT id FROM decisions WHERE organization_id=$1 AND id=$2 AND policy_version_id=$3 AND evidence_snapshot_id=$4",[org,input.decisionId,policyId,input.evidenceSnapshotId]);if(!decision.rowCount)throw new NotFoundException("Decision does not match the frozen Policy and Evidence snapshot");const manifests=await this.db.query("SELECT manifest_hash FROM decision_retrieval_manifests WHERE organization_id=$1 AND decision_id=$2 ORDER BY role",[org,input.decisionId]);ragManifestHashes=manifests.rows.map(row=>row.manifest_hash)}
    const controllerInput={observedAllocationBps:input.observedAllocationBps,previousErrorBps:input.previousErrorBps,integralErrorBps:input.integralErrorBps,previousFilteredDerivativeBpsPerDay:input.previousFilteredDerivativeBpsPerDay,previousOutputBps:input.previousOutputBps,previousGains:structuredClone(input.previousGains),deltaTimeMs:input.deltaTimeMs,volatilityBps:input.volatilityBps,liquidityDropBps:input.liquidityDropBps,pegDeviationBps:input.pegDeviationBps,criticalIncident:input.criticalIncident,evidenceEligible:eligible,evidenceConfidenceBps};
    const governedSkills=await loadApprovedGovernedSkills(this.db,org,config.governedSkillVersionIds??[]);let result;try{const baseline=runAdaptivePid(config,envelope!,controllerInput);result=applyGovernedSkills(baseline,{volatilityBps:input.volatilityBps,liquidityDropBps:input.liquidityDropBps,pegDeviationBps:input.pegDeviationBps,criticalIncident:input.criticalIncident},governedSkills)}catch(error){throw new BadRequestException(error instanceof Error?error.message:"INVALID_ADAPTIVE_PID_INPUT")}
    const skillVersionRefs=governedSkills.map(skill=>skill.id);const frozenInput={schemaVersion:source.sourceMode==="EVIDENCE_DERIVED_OBSERVED_STATE"?"treasury.adaptive-pid-input.v2":"treasury.adaptive-pid-input.v1",sourceMode:source.sourceMode,observedState:source.observedState,previousAdaptivePidSnapshotId:source.previousAdaptivePidSnapshotId??null,historicalPerformanceClaimed:false,causalImpactClaimed:false,treasuryId:input.treasuryId,policyVersionId:policyId,policyContentHash:policy.content_hash,evidenceSnapshotId:input.evidenceSnapshotId,evidenceManifestHash:snapshot.rows[0].manifest_hash,decisionId:input.decisionId??null,ragManifestHashes,skillVersions:governedSkills.map(skill=>({id:skill.id,contentHash:skill.contentHash})),governedSkillsLoaded:governedSkills.length>0,governedSkillsApplied:result.skillOverlay.appliedVersionRefs.length>0,...controllerInput};const inputHash=hash(frozenInput),resultHash=hash(result),status=result.safetyState.includes("HOLD")?"HOLD":"ADVISORY";
    return this.db.transaction(async client=>{const saved=await client.query("INSERT INTO adaptive_pid_snapshots(id,organization_id,treasury_id,policy_version_id,evidence_snapshot_id,decision_id,rag_manifest_hashes,skill_version_refs,status,input,input_hash,result,result_hash,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(organization_id,policy_version_id,input_hash) DO NOTHING RETURNING *",[makeId("pidadapt"),org,input.treasuryId,policyId,input.evidenceSnapshotId,input.decisionId??null,ragManifestHashes,skillVersionRefs,status,frozenInput,inputHash,result,resultHash,actorId]);const row=saved.rowCount?saved.rows[0]:(await client.query("SELECT * FROM adaptive_pid_snapshots WHERE organization_id=$1 AND policy_version_id=$2 AND input_hash=$3",[org,policyId,inputHash])).rows[0];if(saved.rowCount)await this.audit(client,org,status==="HOLD"?"policy.adaptive_pid_held":"policy.adaptive_pid_advised",row.id,{actorId,policyVersionId:policyId,evidenceSnapshotId:input.evidenceSnapshotId,inputHash,resultHash,riskRegime:result.riskRegime,safetyState:result.safetyState,skillVersionRefs,assetExecutionAuthorized:false});return this.mapAdaptivePidSnapshot(row)});
  }
  async listAdaptivePidSnapshots(org:string,policyId:string){await this.requirePolicy(org,policyId);const result=await this.db.query("SELECT * FROM adaptive_pid_snapshots WHERE organization_id=$1 AND policy_version_id=$2 ORDER BY created_at DESC,id DESC LIMIT 100",[org,policyId]);return{items:result.rows.map(row=>this.mapAdaptivePidSnapshot(row))}}
  async getAdaptivePidSnapshot(org:string,policyId:string,id:string){const result=await this.db.query("SELECT * FROM adaptive_pid_snapshots WHERE organization_id=$1 AND policy_version_id=$2 AND id=$3",[org,policyId,id]);if(!result.rowCount)throw new NotFoundException("Adaptive PID snapshot not found");return this.mapAdaptivePidSnapshot(result.rows[0])}
  async compareScenarios(org: string, policyVersionIds: string[], actorId: string) {
    const ids = [...new Set(policyVersionIds)].sort();
    if (ids.length !== policyVersionIds.length) throw new BadRequestException("DUPLICATE_POLICY_VERSION");
    if (ids.length < 2 || ids.length > 5) throw new BadRequestException("POLICY_COMPARISON_REQUIRES_2_TO_5_VERSIONS");
    const found = await this.db.query("SELECT * FROM policy_versions WHERE organization_id=$1 AND id=ANY($2::text[]) ORDER BY version,id", [org, ids]);
    if (found.rowCount !== ids.length) throw new NotFoundException("One or more policy versions not found");
    const snapshots = found.rows.map((row) => ({ id: row.id, version: row.version, contentHash: row.content_hash, config: structuredClone(row.config) as TreasuryPolicyConfig }));
    let result;
    try { result = comparePolicyScenarios(snapshots); } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : "INVALID_POLICY_COMPARISON"); }
    const frozenInput = { schemaVersion: "treasury.policy.scenario-comparison-input.v1", suiteVersion: POLICY_SCENARIO_SUITE_VERSION, sourceMode: "SYNTHETIC_DETERMINISTIC", historicalEvidenceUsed: false, policyVersions: snapshots };
    const inputHash = hash(frozenInput); const resultHash = hash(result);
    return this.db.transaction(async (client) => {
      const saved = await client.query("INSERT INTO policy_scenario_comparisons(id,organization_id,suite_version,policy_version_ids,input,input_hash,result,result_hash,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(organization_id,input_hash) DO NOTHING RETURNING *", [makeId("comparison"), org, POLICY_SCENARIO_SUITE_VERSION, snapshots.map((item) => item.id), frozenInput, inputHash, result, resultHash, actorId]);
      const row = saved.rowCount ? saved.rows[0] : (await client.query("SELECT * FROM policy_scenario_comparisons WHERE organization_id=$1 AND input_hash=$2", [org, inputHash])).rows[0];
      if (saved.rowCount) await this.audit(client, org, "policy.scenario_comparison_created", row.id, { actorId, policyVersionIds: snapshots.map((item) => item.id), inputHash, resultHash, suiteVersion: POLICY_SCENARIO_SUITE_VERSION, historicalEvidenceUsed: false, assetExecutionAuthorized: false });
      return this.mapScenarioComparison(row);
    });
  }
  async listScenarioComparisons(org: string) { const result = await this.db.query("SELECT * FROM policy_scenario_comparisons WHERE organization_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100", [org]); return { items: result.rows.map((row) => this.mapScenarioComparison(row)) }; }
  async getScenarioComparison(org: string, id: string) { const result = await this.db.query("SELECT * FROM policy_scenario_comparisons WHERE organization_id=$1 AND id=$2", [org, id]); if (!result.rowCount) throw new NotFoundException("Policy scenario comparison not found"); return this.mapScenarioComparison(result.rows[0]); }
  private async requirePolicy(org: string, policyId: string) { const result = await this.db.query("SELECT * FROM policy_versions WHERE organization_id=$1 AND id=$2", [org, policyId]); if (!result.rowCount) throw new NotFoundException("Policy version not found"); return result.rows[0]; }
  private async audit(client: PoolClient, org: string, eventType: string, objectId: string, data: unknown) { const payload = { eventType, organizationId: org, objectType: "policy", objectId, data }; await client.query("INSERT INTO audit_events(id,organization_id,event_type,actor,action,object_type,object_id,data,payload_hash) VALUES($1,$2,$3,$4,$5,'policy',$6,$7,$8)", [makeId("audit"), org, eventType, { type: "human_or_system", id: (data as any).actorId ?? "policy-engine" }, eventType, objectId, data, hash(payload)]); }
  private map(row: any) { return { id: row.id, organizationId: row.organization_id, version: row.version, name: row.name, status: row.status, schemaVersion: row.schema_version, config: row.config, contentHash: row.content_hash, activatedAt: row.activated_at ? new Date(row.activated_at).toISOString() : null, activatedBy: row.activated_by ?? null, createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined }; }
  private mapSimulation(row: any) { return { id: row.id, organizationId: row.organization_id, policyVersionId: row.policy_version_id, evidenceSnapshotId: row.evidence_snapshot_id, status: row.status, input: row.input, inputHash: row.input_hash, result: row.result, resultHash: row.result_hash, createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined }; }
  private mapScenarioComparison(row: any) { return { id: row.id, organizationId: row.organization_id, suiteVersion: row.suite_version, policyVersionIds: row.policy_version_ids, input: row.input, inputHash: row.input_hash, result: row.result, resultHash: row.result_hash, createdBy: row.created_by, createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined }; }
  private mapAdaptivePidSnapshot(row:any){return{id:row.id,organizationId:row.organization_id,treasuryId:row.treasury_id,policyVersionId:row.policy_version_id,evidenceSnapshotId:row.evidence_snapshot_id,decisionId:row.decision_id,ragManifestHashes:row.rag_manifest_hashes,skillVersionRefs:row.skill_version_refs,status:row.status,input:row.input,inputHash:row.input_hash,result:row.result,resultHash:row.result_hash,createdBy:row.created_by,advisoryOnly:true,assetExecutionAuthorized:false,createdAt:new Date(row.created_at).toISOString()}}
}
