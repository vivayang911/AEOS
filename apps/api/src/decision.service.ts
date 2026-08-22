import { BadRequestException, ConflictException, forwardRef, Inject, Injectable, NotFoundException, OnModuleInit, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PoolClient } from "pg";
import { DatabaseService } from "./database.service";
import { EvidenceService } from "./evidence.service";
import { CreateDecisionDto, ReviewDecisionDto } from "./decision.dto";
import { advisoryTools, DecisionOutputValidationError, decisionRoles, hashValue, minimumEightAgentBudget, roleToolCallUsage, validateDecisionOutput } from "./decision-engine";
import { ADVISORY_PROVIDER, AdvisoryProvider, AdvisoryProviderTimeoutError, DeterministicMockAdvisoryProvider, FrozenAdvisoryInput, immutableProviderInput } from "./advisory-provider";
import { KnowledgeService } from "./knowledge.service";
import { allowedKnowledgeCitations,buildRetrievalManifestBundle,RetrievalManifestBundle,unavailableRetrievalManifestBundle,validateRetrievalManifestBundle } from "./retrieval-manifest";
import { deriveCommitteeEvidenceGaps } from "./committee-evidence-gap";
import { EvidenceRequestService } from "./evidence-request.service";
import { AdvisoryProviderReliabilityService } from "./advisory-provider-reliability.service";

const hash=hashValue;
const id=(prefix:string)=>`${prefix}_${randomUUID().replaceAll("-","")}`;

@Injectable()
export class DecisionService implements OnModuleInit {
  private readonly workerId=`decision-worker-${randomUUID()}`;
  private readonly advisoryReliability?:AdvisoryProviderReliabilityService;
  constructor(private readonly db:DatabaseService,private readonly evidence:EvidenceService,@Inject(ADVISORY_PROVIDER) private readonly provider:AdvisoryProvider=new DeterministicMockAdvisoryProvider(),@Optional() private readonly knowledge?:KnowledgeService,@Optional() @Inject(forwardRef(()=>EvidenceRequestService)) private readonly evidenceRequests?:EvidenceRequestService,@Optional() advisoryReliability?:AdvisoryProviderReliabilityService){this.advisoryReliability=advisoryReliability??(db instanceof DatabaseService?new AdvisoryProviderReliabilityService(db):undefined)}

  onModuleInit(){setImmediate(()=>void this.recoverJobs())}

  async enqueue(input:CreateDecisionDto,idempotencyKey?:string,requesterRole="TREASURY_COMMITTEE"){
    const evidenceIds=[...new Set(input.evidenceIds)].sort();
    const evidence=await Promise.all(evidenceIds.map(evidenceId=>this.evidence.get(input.organizationId,evidenceId)));
    const snapshot=await this.evidence.snapshot(input.organizationId,evidenceIds);
    const policy=await this.policy(input.organizationId,input.policyVersionId);
    const retrievalBundle=await this.freezeRetrieval(input.organizationId,input.objective,requesterRole);
    const evidenceClassifications=evidence.map(item=>({evidenceId:item.id,classification:item.classification??null}));
    const evidenceClassificationHash=hash(evidenceClassifications);
    const frozenInput={organizationId:input.organizationId,objective:input.objective,evidenceIds,policyVersionId:policy.id,evidenceSnapshotId:snapshot.id,evidenceManifestHash:snapshot.manifest_hash,evidenceClassifications,evidenceClassificationHash,requesterRole,retrievalBundle};
    const inputHash=hash(frozenInput);
    const key=idempotencyKey?.trim()||inputHash;
    if(key.length>200)throw new BadRequestException("Idempotency-Key must be at most 200 characters");
    const job=await this.db.transaction(async client=>{
      const existing=await client.query<any>("SELECT * FROM decision_jobs WHERE organization_id=$1 AND idempotency_key=$2",[input.organizationId,key]);
      if(existing.rowCount){if(existing.rows[0].input_hash!==inputHash)throw new ConflictException("Idempotency-Key was already used with different input");return existing.rows[0]}
      const jobId=id("job");
      const saved=await client.query<any>("INSERT INTO decision_jobs(id,organization_id,idempotency_key,input,input_hash,status,current_stage,progress) VALUES($1,$2,$3,$4,$5,'QUEUED','QUEUED',0) RETURNING *",[jobId,input.organizationId,key,frozenInput,inputHash]);
      await this.audit(client,input.organizationId,"decision.job_queued",jobId,{inputHash,evidenceSnapshotId:snapshot.id,policyVersionId:policy.id},{type:"system",id:"decision-orchestrator"},"decision_job");
      return saved.rows[0];
    });
    if(job.status==="QUEUED")this.schedule(job.id);
    return this.mapJob(job);
  }

  async create(input:CreateDecisionDto&{retrievalBundle?:RetrievalManifestBundle;requesterRole?:string;evidenceClassifications?:Array<{evidenceId:string;classification:unknown|null}>;evidenceClassificationHash?:string;parentDecisionId?:string;revisionNumber?:number},jobId?:string){
    if(jobId){const existing=await this.db.query<any>("SELECT d.*,s.manifest_hash FROM decisions d JOIN evidence_snapshots s ON s.id=d.evidence_snapshot_id WHERE d.organization_id=$1 AND d.job_id=$2",[input.organizationId,jobId]);if(existing.rowCount)return this.mapExistingDecision(existing.rows[0])}
    const currentEvidence=await Promise.all([...new Set(input.evidenceIds)].map((evidenceId)=>this.evidence.get(input.organizationId,evidenceId)));
    const evidenceClassifications=input.evidenceClassifications??currentEvidence.map(item=>({evidenceId:item.id,classification:item.classification??null}));
    if(input.evidenceClassificationHash&&input.evidenceClassificationHash!==hash(evidenceClassifications))throw new BadRequestException("Frozen Evidence classification hash mismatch");
    const classificationByEvidence=new Map(evidenceClassifications.map(item=>[item.evidenceId,item.classification]));
    if(evidenceClassifications.length!==currentEvidence.length||currentEvidence.some(item=>!classificationByEvidence.has(item.id)))throw new BadRequestException("Frozen Evidence classifications do not match Evidence input");
    const evidence=currentEvidence.map(item=>{const classification=classificationByEvidence.get(item.id);const {classification:_current,...base}=item;return classification?{...base,classification}:base});
    const snapshot=await this.evidence.snapshot(input.organizationId,evidence.map(item=>item.id));
    const policy=await this.policy(input.organizationId,input.policyVersionId);
    const configuredBudget=policy.config.agentBudget??minimumEightAgentBudget;
    if(configuredBudget.maxAgentRuns<decisionRoles.length)throw new BadRequestException("Active policy Agent budget cannot run the required eight-Agent committee");
    if(configuredBudget.maxToolCalls<Object.values(roleToolCallUsage).reduce((sum,value)=>sum+value,0))throw new BadRequestException("Active policy tool budget cannot run the required eight-Agent committee");
    const requesterRole=input.requesterRole??"TREASURY_COMMITTEE";
    const retrievalBundle=validateRetrievalManifestBundle(input.retrievalBundle??await this.freezeRetrieval(input.organizationId,input.objective,requesterRole));
    const providerEvidence=evidence.map(item=>({id:item.id,value:item.value,verification:{status:item.verification.status},freshness:item.freshness,qualityScore:item.qualityScore,conflictGroupId:item.conflictGroupId??null}));
    const providerInput:FrozenAdvisoryInput={schemaVersion:"advisory.input.v2",objective:input.objective,evidence:providerEvidence,policy:{minimumEvidenceQuality:policy.config.minimumEvidenceQuality},allowedEvidenceIds:providerEvidence.map(item=>item.id).sort(),allowedTools:[...advisoryTools],retrievalManifests:retrievalBundle.manifests,budget:{timeoutMs:configuredBudget.timeoutMs,maxRetries:configuredBudget.maxRetries,maxAgentRuns:configuredBudget.maxAgentRuns,maxToolCalls:configuredBudget.maxToolCalls}};
    const output:any=await this.runProvider(input.organizationId,providerInput);
    const claims=output.claims;
    const challenges=output.challenges;
    const agentMessages=output.agentMessages;
    const positions=output.agentPositions;
    const orchestration=output.orchestration;
    const coverage=output.citationCoverage;
    const inputSnapshot={objective:input.objective,policyVersionId:policy.id,evidenceSnapshotId:snapshot.id,evidenceManifestHash:snapshot.manifest_hash,evidenceClassificationHash:hash(evidenceClassifications),retrievalBundleHash:retrievalBundle.bundleHash,providerId:this.provider.providerId,modelVersion:this.provider.modelVersion};
    const decisionId=id("decision");
    const evidenceGaps=output.recommendation==="INSUFFICIENT_EVIDENCE"?deriveCommitteeEvidenceGaps(output.risks.map((risk:any)=>risk.code),evidence):[];
    const agentRunIds=new Map<string,string>();
    await this.db.transaction(async client=>{
      await client.query("INSERT INTO decisions(id,organization_id,objective,policy_version_id,evidence_snapshot_id,provider,schema_version,status,recommendation,input_hash,output_hash,citation_coverage,orchestration,job_id,retrieval_bundle_hash,parent_decision_id,revision_number) VALUES($1,$2,$3,$4,$5,$6,'decision.recommendation.v3','REVIEW_REQUIRED',$7,$8,$9,$10,$11,$12,$13,$14,$15)",[decisionId,input.organizationId,input.objective,policy.id,snapshot.id,this.provider.providerId,output,hash(inputSnapshot),hash(output),coverage,orchestration,jobId??null,retrievalBundle.bundleHash,input.parentDecisionId??null,input.revisionNumber??0]);
      for(const manifest of retrievalBundle.manifests)await client.query("INSERT INTO decision_retrieval_manifests(id,organization_id,decision_id,role,requester_role,query,query_hash,status,reason_code,has_conflicts,embedding_model,reranker_version,items,manifest_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",[id("rmanifest"),input.organizationId,decisionId,manifest.role,requesterRole,manifest.query,manifest.queryHash,manifest.status,manifest.reasonCode,manifest.hasConflicts,manifest.embeddingModel,manifest.rerankerVersion,manifest.items,manifest.manifestHash]);
      for(const [ordinal,claim] of claims.entries())await client.query("INSERT INTO decision_claims(id,organization_id,decision_id,ordinal,text,materiality,confidence,evidence_ids,content_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",[id("claim"),input.organizationId,decisionId,ordinal,claim.text,claim.materiality,claim.confidence,JSON.stringify(claim.evidenceIds),hash(claim)]);
      for(const challenge of challenges)await client.query("INSERT INTO decision_challenges(id,organization_id,decision_id,round,raised_by,target_role,code,challenge,response,status,content_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",[id("challenge"),input.organizationId,decisionId,challenge.round,challenge.raisedBy,challenge.targetRole,challenge.code,challenge.challenge,challenge.response,challenge.status,hash(challenge)]);
      for(const message of agentMessages)await client.query("INSERT INTO agent_messages(id,organization_id,decision_id,ordinal,round,sender_role,recipient_role,message_type,code,content,evidence_ids,input_hash,content_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",[id("message"),input.organizationId,decisionId,message.ordinal,message.round,message.senderRole,message.recipientRole,message.messageType,message.code,message.content,JSON.stringify(message.evidenceIds),hash(inputSnapshot),hash(message)]);
      for(const position of positions){const runId=id("run");agentRunIds.set(position.role,runId);await client.query("INSERT INTO agent_runs(id,organization_id,decision_id,role,model_version,tool_permissions,input_hash,output,output_hash,run_state,attempts,budget_usage) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'SUCCEEDED',1,$10)",[runId,input.organizationId,decisionId,position.role,this.provider.modelVersion,JSON.stringify(position.toolPermissions),hash(inputSnapshot),position,hash(position),{toolCalls:roleToolCallUsage[position.role as keyof typeof roleToolCallUsage]}])}
      for(const gap of evidenceGaps)await client.query("INSERT INTO decision_evidence_gaps(id,organization_id,decision_id,schema_version,code,source_blocker,requesting_role,status,gap_type,source_chain_id,subject,rationale,supporting_evidence_ids,gap_hash,asset_execution_authorized)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,false)",[id("gap"),input.organizationId,decisionId,gap.schemaVersion,gap.code,gap.sourceBlocker,gap.requestingRole,gap.status,gap.gapType,gap.sourceChainId,gap.subject,gap.rationale,gap.supportingEvidenceIds,gap.gapHash]);
      await this.audit(client,input.organizationId,"decision.review_required",decisionId,{inputHash:hash(inputSnapshot),outputHash:hash(output),provider:this.provider.providerId,modelVersion:this.provider.modelVersion,citationCoverage:coverage,unresolvedDisagreements:output.unresolvedDisagreements},{type:"system",id:"decision-orchestrator"});
    });
    if(this.evidenceRequests&&evidenceGaps.some(gap=>gap.status==="REQUESTABLE")&&(input.revisionNumber??0)===0)await this.evidenceRequests.fulfillCommitteeGaps(input.organizationId,decisionId,evidenceGaps,agentRunIds);
    return {id:decisionId,organizationId:input.organizationId,status:"REVIEW_REQUIRED",parentDecisionId:input.parentDecisionId??null,revisionNumber:input.revisionNumber??0,provider:this.provider.providerId,modelVersion:this.provider.modelVersion,policyVersionId:policy.id,evidenceSnapshotId:snapshot.id,evidenceManifestHash:snapshot.manifest_hash,retrievalBundleHash:retrievalBundle.bundleHash,retrievalManifests:retrievalBundle.manifests,recommendation:output,inputHash:hash(inputSnapshot),outputHash:hash(output)};
  }

  async getJob(org:string,jobId:string){
    const result=await this.db.query<any>("SELECT * FROM decision_jobs WHERE organization_id=$1 AND id=$2",[org,jobId]);
    if(!result.rowCount)throw new NotFoundException("Decision job not found");
    const response:any=this.mapJob(result.rows[0]);
    if(result.rows[0].decision_id)response.decision=await this.get(org,result.rows[0].decision_id);
    return response;
  }

  async retryJob(jobId:string,org:string,actorId:string){
    const job=await this.db.transaction(async client=>{
      const found=await client.query<any>("SELECT * FROM decision_jobs WHERE organization_id=$1 AND id=$2 FOR UPDATE",[org,jobId]);
      if(!found.rowCount)throw new NotFoundException("Decision job not found");
      const current=found.rows[0];
      if(!["FAILED","TIMED_OUT"].includes(current.status))throw new ConflictException("Only failed or timed-out jobs can be retried");
      if(current.attempts>=current.max_attempts)throw new ConflictException("Decision job retry budget is exhausted");
      const updated=await client.query<any>("UPDATE decision_jobs SET status='QUEUED',current_stage='RETRY_QUEUED',progress=0,lease_owner=NULL,lease_expires_at=NULL,last_error_code=NULL WHERE organization_id=$1 AND id=$2 RETURNING *",[org,jobId]);
      await this.audit(client,org,"decision.job_retry_queued",jobId,{attempts:current.attempts,maxAttempts:current.max_attempts},{type:"human",id:actorId},"decision_job");
      return updated.rows[0];
    });
    this.schedule(jobId);
    return this.mapJob(job);
  }

  async get(org:string,decisionId:string){
    const result=await this.db.query<any>("SELECT d.*,s.manifest_hash FROM decisions d JOIN evidence_snapshots s ON s.id=d.evidence_snapshot_id WHERE d.organization_id=$1 AND d.id=$2",[org,decisionId]);
    if(!result.rowCount)throw new NotFoundException("Decision not found");
    const [runs,challenges,messages,reviews,retrievalManifests,gaps,children]=await Promise.all([
      this.db.query("SELECT id,role,model_version,tool_permissions,run_state,attempts,budget_usage,input_hash,output_hash,created_at FROM agent_runs WHERE organization_id=$1 AND decision_id=$2 ORDER BY created_at,id",[org,decisionId]),
      this.db.query("SELECT id,round,raised_by,target_role,code,challenge,response,status,content_hash,created_at FROM decision_challenges WHERE organization_id=$1 AND decision_id=$2 ORDER BY round,id",[org,decisionId]),
      this.db.query("SELECT id,ordinal,round,sender_role,recipient_role,message_type,code,content,evidence_ids,evidence_request_id,input_hash,content_hash,created_at FROM agent_messages WHERE organization_id=$1 AND decision_id=$2 ORDER BY ordinal,id",[org,decisionId]),
      this.db.query("SELECT id,outcome,actor_id,rationale,payload_hash,created_at FROM decision_reviews WHERE organization_id=$1 AND decision_id=$2 ORDER BY created_at,id",[org,decisionId]),
      this.db.query("SELECT id,role,requester_role,query,query_hash,status,reason_code,has_conflicts,embedding_model,reranker_version,items,manifest_hash,created_at FROM decision_retrieval_manifests WHERE organization_id=$1 AND decision_id=$2 ORDER BY CASE role WHEN 'Governor' THEN 1 WHEN 'Research' THEN 2 WHEN 'Strategy' THEN 3 WHEN 'Quant' THEN 4 WHEN 'Risk' THEN 5 WHEN 'Compliance' THEN 6 WHEN 'Portfolio' THEN 7 WHEN 'Treasury' THEN 8 END",[org,decisionId]),
      this.db.query("SELECT g.id,g.schema_version,g.code,g.source_blocker,g.requesting_role,g.status,g.gap_type,g.source_chain_id,g.subject,g.rationale,g.supporting_evidence_ids,g.gap_hash,l.evidence_request_id,l.agent_message_id,l.child_decision_id,g.created_at FROM decision_evidence_gaps g LEFT JOIN decision_evidence_gap_links l ON l.gap_id=g.id AND l.organization_id=g.organization_id WHERE g.organization_id=$1 AND g.decision_id=$2 ORDER BY g.created_at,g.id",[org,decisionId]),
      this.db.query("SELECT id,revision_number,evidence_snapshot_id,input_hash,output_hash,status,created_at FROM decisions WHERE organization_id=$1 AND parent_decision_id=$2 ORDER BY revision_number,id",[org,decisionId])
    ]);
    const row=result.rows[0];
    return {id:row.id,organizationId:row.organization_id,parentDecisionId:row.parent_decision_id,revisionNumber:row.revision_number,children:children.rows,status:row.status,provider:row.provider,policyVersionId:row.policy_version_id,evidenceSnapshotId:row.evidence_snapshot_id,evidenceManifestHash:row.manifest_hash,retrievalBundleHash:row.retrieval_bundle_hash,retrievalManifests:retrievalManifests.rows,recommendation:row.recommendation,evidenceGaps:gaps.rows,inputHash:row.input_hash,outputHash:row.output_hash,createdAt:new Date(row.created_at).toISOString(),reviewedAt:row.reviewed_at?new Date(row.reviewed_at).toISOString():null,agentRuns:runs.rows,challenges:challenges.rows,agentMessages:messages.rows,reviews:reviews.rows};
  }

  async createChildRevision(org:string,parentDecisionId:string,newEvidenceId:string){const parent=await this.db.query<any>("SELECT d.*,s.evidence_ids FROM decisions d JOIN evidence_snapshots s ON s.id=d.evidence_snapshot_id WHERE d.organization_id=$1 AND d.id=$2",[org,parentDecisionId]);if(!parent.rowCount)throw new NotFoundException("Parent Decision not found");const row=parent.rows[0];if(row.revision_number>=3)throw new ConflictException("Decision Evidence revision budget is exhausted");const existing=await this.db.query<any>("SELECT id FROM decisions WHERE organization_id=$1 AND parent_decision_id=$2",[org,parentDecisionId]);if(existing.rowCount)return this.get(org,existing.rows[0].id);return this.create({organizationId:org,objective:row.objective,evidenceIds:[...new Set([...(row.evidence_ids as string[]),newEvidenceId])],policyVersionId:row.policy_version_id,parentDecisionId,revisionNumber:row.revision_number+1})}

  async review(decisionId:string,input:ReviewDecisionDto){
    return this.db.transaction(async client=>{
      const found=await client.query<any>("SELECT * FROM decisions WHERE organization_id=$1 AND id=$2 FOR UPDATE",[input.organizationId,decisionId]);
      if(!found.rowCount)throw new NotFoundException("Decision not found");
      const decision=found.rows[0];
      if(decision.status!=="REVIEW_REQUIRED")throw new ConflictException("Decision has already been reviewed");
      if(input.outcome==="APPROVED"&&decision.recommendation.recommendation!=="HOLD")throw new ConflictException("Insufficient evidence cannot be approved");
      const review={decisionId,outcome:input.outcome,actorId:input.actorId,rationale:input.rationale,outputHash:decision.output_hash};
      const reviewId=id("review");
      await client.query("INSERT INTO decision_reviews(id,organization_id,decision_id,outcome,actor_id,rationale,payload_hash) VALUES($1,$2,$3,$4,$5,$6,$7)",[reviewId,input.organizationId,decisionId,input.outcome,input.actorId,input.rationale,hash(review)]);
      await client.query("UPDATE decisions SET status=$1,reviewed_at=now() WHERE organization_id=$2 AND id=$3",[input.outcome,input.organizationId,decisionId]);
      await this.audit(client,input.organizationId,input.outcome==="APPROVED"?"decision.approved":"decision.rejected",decisionId,{reviewId,outcome:input.outcome,rationale:input.rationale,outputHash:decision.output_hash},{type:"human",id:input.actorId});
      return {id:decisionId,organizationId:input.organizationId,status:input.outcome,reviewId,outputHash:decision.output_hash,assetExecutionAuthorized:false};
    });
  }

  private async policy(org:string,requested?:string){
    if(requested){const result=await this.db.query<any>("SELECT * FROM policy_versions WHERE organization_id=$1 AND id=$2",[org,requested]);if(!result.rowCount)throw new NotFoundException("Policy version not found");if(result.rows[0].status&&result.rows[0].status!=="ACTIVE")throw new ConflictException("Only an active policy can govern a new decision");return result.rows[0]}
    const active=await this.db.query<any>("SELECT * FROM policy_versions WHERE organization_id=$1 AND status='ACTIVE' ORDER BY version DESC LIMIT 1",[org]);
    if(active.rowCount)return active.rows[0];
    const config={minimumEvidenceQuality:80,highImpactRequiresFreshEvidence:true,agentTools:[...advisoryTools],assetExecutionTools:[],agentBudget:{...minimumEightAgentBudget}};
    const result=await this.db.query<any>("INSERT INTO policy_versions(id,organization_id,version,config,content_hash,status) VALUES($1,$2,1,$3,$4,'ACTIVE') ON CONFLICT(organization_id,version) DO UPDATE SET content_hash=policy_versions.content_hash RETURNING *",[id("policy"),org,config,hash(config)]);return result.rows[0];
  }

  private async runProvider(organizationId:string,input:FrozenAdvisoryInput){
    const frozen=immutableProviderInput(input);
    if(this.advisoryReliability)return this.advisoryReliability.execute(organizationId,this.provider.providerId,this.provider.modelVersion,hash(frozen),input.budget.timeoutMs,async()=>this.validateProviderOutput(await this.provider.run(frozen),input));
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      const output=await Promise.race([this.provider.run(frozen),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new AdvisoryProviderTimeoutError()),input.budget.timeoutMs)})]);
      return this.validateProviderOutput(output,input);
    }finally{if(timer)clearTimeout(timer)}
  }

  private validateProviderOutput(output:unknown,input:FrozenAdvisoryInput){try{validateDecisionOutput(output,[...input.allowedEvidenceIds],allowedKnowledgeCitations({schemaVersion:"decision.retrieval-bundle.v1",manifests:[...input.retrievalManifests],bundleHash:hash({schemaVersion:"decision.retrieval-bundle.v1",manifests:[...input.retrievalManifests],assetExecutionAuthorized:false}),assetExecutionAuthorized:false}));return output}catch(error){if(error instanceof DecisionOutputValidationError)throw new BadRequestException(error.message);throw error}}

  private schedule(jobId:string){setImmediate(()=>void this.processJob(jobId))}

  private async recoverJobs(){
    try{await this.db.runAsSystem(async()=>{
      await this.db.query("UPDATE decision_jobs SET status='QUEUED',current_stage='RECOVERING',progress=0,lease_owner=NULL,lease_expires_at=NULL,last_error_code='LEASE_EXPIRED' WHERE status='RUNNING' AND lease_expires_at<now() AND attempts<max_attempts");
      await this.db.query("UPDATE decision_jobs SET status='TIMED_OUT',current_stage='TIMED_OUT',last_error_code='RETRY_BUDGET_EXHAUSTED',completed_at=now(),lease_owner=NULL,lease_expires_at=NULL WHERE status='RUNNING' AND lease_expires_at<now() AND attempts>=max_attempts");
      const queued=await this.db.query<{id:string}>("SELECT id FROM decision_jobs WHERE status='QUEUED' ORDER BY created_at,id LIMIT 100");
      for(const job of queued.rows)this.schedule(job.id);
    });
    }catch{ /* Database initialization or shutdown will retry on the next service start. */ }
  }

  private async processJob(jobId:string){
    return this.db.runAsSystem(()=>this.processJobAsSystem(jobId));
  }

  private async processJobAsSystem(jobId:string){
    let claimed:any;
    try{
      claimed=await this.db.transaction(async client=>{
        const result=await client.query<any>("UPDATE decision_jobs SET status='RUNNING',current_stage='VALIDATING_FROZEN_INPUT',progress=10,attempts=attempts+1,lease_owner=$2,lease_expires_at=now()+interval '30 seconds',started_at=COALESCE(started_at,now()) WHERE id=$1 AND status='QUEUED' AND attempts<max_attempts RETURNING *",[jobId,this.workerId]);
        if(!result.rowCount)return null;
        await this.audit(client,result.rows[0].organization_id,"decision.job_started",jobId,{attempt:result.rows[0].attempts,worker:this.workerId},{type:"system",id:this.workerId},"decision_job");
        return result.rows[0];
      });
      if(!claimed)return;
      await this.db.query("UPDATE decision_jobs SET current_stage='AGENT_COMMITTEE',progress=35,lease_expires_at=now()+interval '30 seconds' WHERE id=$1 AND lease_owner=$2",[jobId,this.workerId]);
      const input=claimed.input as CreateDecisionDto&{retrievalBundle:RetrievalManifestBundle;requesterRole:string;evidenceClassifications:Array<{evidenceId:string;classification:unknown|null}>;evidenceClassificationHash:string};
      const decision=await this.create({organizationId:input.organizationId,objective:input.objective,evidenceIds:input.evidenceIds,policyVersionId:input.policyVersionId,retrievalBundle:input.retrievalBundle,requesterRole:input.requesterRole,evidenceClassifications:input.evidenceClassifications,evidenceClassificationHash:input.evidenceClassificationHash},jobId);
      await this.db.transaction(async client=>{
        await client.query("UPDATE decision_jobs SET status='COMPLETED',current_stage='REVIEW_REQUIRED',progress=100,decision_id=$2,completed_at=now(),lease_owner=NULL,lease_expires_at=NULL,last_error_code=NULL WHERE id=$1 AND lease_owner=$3",[jobId,decision.id,this.workerId]);
        await this.audit(client,claimed.organization_id,"decision.job_completed",jobId,{decisionId:decision.id,outputHash:decision.outputHash},{type:"system",id:this.workerId},"decision_job");
      });
    }catch(error:any){
      const code=typeof error?.code==="string"?error.code:error instanceof Error?error.name:"UNKNOWN_ERROR";
      try{await this.db.transaction(async client=>{
        const failed=await client.query<any>("UPDATE decision_jobs SET status=CASE WHEN attempts>=max_attempts THEN 'TIMED_OUT' ELSE 'FAILED' END,current_stage=CASE WHEN attempts>=max_attempts THEN 'TIMED_OUT' ELSE 'FAILED' END,last_error_code=$2,completed_at=now(),lease_owner=NULL,lease_expires_at=NULL WHERE id=$1 RETURNING *",[jobId,code]);
        if(failed.rowCount)await this.audit(client,failed.rows[0].organization_id,"decision.job_failed",jobId,{errorCode:code,attempts:failed.rows[0].attempts,maxAttempts:failed.rows[0].max_attempts},{type:"system",id:this.workerId},"decision_job");
      })}catch{ /* Preserve the original failure; an expired lease is recovered on restart. */ }
    }
  }

  private mapJob(row:any){return {jobId:row.id,organizationId:row.organization_id,status:row.status,currentStage:row.current_stage,progress:row.progress,attempts:row.attempts,maxAttempts:row.max_attempts,decisionId:row.decision_id??null,lastErrorCode:row.last_error_code??null,inputHash:row.input_hash,createdAt:row.created_at?new Date(row.created_at).toISOString():undefined,startedAt:row.started_at?new Date(row.started_at).toISOString():null,completedAt:row.completed_at?new Date(row.completed_at).toISOString():null}}
  private mapExistingDecision(row:any){return {id:row.id,organizationId:row.organization_id,status:row.status,provider:row.provider,policyVersionId:row.policy_version_id,evidenceSnapshotId:row.evidence_snapshot_id,evidenceManifestHash:row.manifest_hash,retrievalBundleHash:row.retrieval_bundle_hash,recommendation:row.recommendation,inputHash:row.input_hash,outputHash:row.output_hash}}

  private async freezeRetrieval(org:string,objective:string,requesterRole="TREASURY_COMMITTEE"){
    if(!this.knowledge)return unavailableRetrievalManifestBundle(objective);
    const result=await this.knowledge.search(org,requesterRole,{organizationId:org,query:objective,limit:8});
    return validateRetrievalManifestBundle(buildRetrievalManifestBundle(objective,result));
  }

  private async audit(client:PoolClient,org:string,eventType:string,objectId:string,data:unknown,actor:unknown,objectType="decision"){
    const payload={eventType,organizationId:org,objectType,objectId,data};
    await client.query("INSERT INTO audit_events(id,organization_id,event_type,actor,action,object_type,object_id,data,payload_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",[id("audit"),org,eventType,actor,eventType,objectType,objectId,data,hash(payload)]);
  }
}
