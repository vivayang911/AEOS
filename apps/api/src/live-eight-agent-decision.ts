import { decisionRoles,hashValue } from "./decision-engine";

type BuildInput={
  recordedAt:string;
  evidence:{id:string;contentHash:string;classificationHash:string};
  snapshot:{id:string;manifestHash:string;manifest:Array<{evidenceId:string;contentHash:string}>};
  job:any;
  decision:any;
};

const fail=(code:string):never=>{throw new Error(code)};
const exactRoles=(items:any[],field:string)=>{
  const roles=items.map(item=>String(item[field])).sort();
  if(roles.join(",")!==[...decisionRoles].sort().join(","))fail("LIVE_STEP_8_EIGHT_ROLE_ROSTER_MISMATCH");
};

export function buildLiveEightAgentDecisionArtifact(input:BuildInput){
  const {evidence,snapshot,job,decision}=input;
  if(job.status!=="COMPLETED"||job.decisionId!==decision.id)fail("LIVE_STEP_8_JOB_NOT_COMPLETED");
  if(decision.status!=="REVIEW_REQUIRED"||decision.provider!=="mock-deterministic")fail("LIVE_STEP_8_DECISION_BOUNDARY_INVALID");
  if(decision.evidenceSnapshotId!==snapshot.id||decision.evidenceManifestHash!==snapshot.manifestHash)fail("LIVE_STEP_8_SNAPSHOT_IDENTITY_MISMATCH");
  if(snapshot.manifest.length!==1||snapshot.manifest[0].evidenceId!==evidence.id||snapshot.manifest[0].contentHash!==evidence.contentHash)fail("LIVE_STEP_8_EVIDENCE_MANIFEST_MISMATCH");
  if(decision.retrievalManifests?.length!==decisionRoles.length||decision.agentRuns?.length!==decisionRoles.length)fail("LIVE_STEP_8_EIGHT_ROLE_RECORDS_REQUIRED");
  exactRoles(decision.retrievalManifests,"role");exactRoles(decision.agentRuns,"role");
  const output=decision.recommendation;
  if(output?.schemaVersion!=="decision.recommendation.v3"||output.recommendation!=="HOLD"||output.assetExecutionAuthorized!==false||output.humanApprovalRequired!==true||output.actions?.length!==0)fail("LIVE_STEP_8_DECISION_OUTPUT_INVALID");
  if(output.citationCoverage?.coverage!==1||output.agentPositions?.length!==decisionRoles.length)fail("LIVE_STEP_8_CITATION_COVERAGE_INVALID");
  for(const [index,position] of output.agentPositions.entries()){
    const manifest=decision.retrievalManifests.find((item:any)=>item.role===position.role);
    if(position.role!==decisionRoles[index]||!position.citations?.includes(evidence.id)||position.retrievalManifestHash!==manifest?.manifest_hash||position.retrievalStatus!==manifest?.status||position.assetExecutionAuthorized!==false)fail("LIVE_STEP_8_AGENT_CITATION_INVALID");
  }
  const raised=new Set(output.challenges?.map((item:any)=>item.raisedBy));
  if(!raised.has("Risk")||!raised.has("Compliance"))fail("LIVE_STEP_8_INDEPENDENT_CHALLENGES_REQUIRED");
  if(decision.agentRuns.some((run:any)=>run.run_state!=="SUCCEEDED"||run.model_version!=="mock-deterministic-v4-eight-agent"))fail("LIVE_STEP_8_AGENT_RUN_INVALID");
  if(!decision.agentMessages?.length||decision.agentMessages.some((message:any)=>!message.evidence_ids?.includes(evidence.id)))fail("LIVE_STEP_8_A2A_LINEAGE_INVALID");
  if(decision.retrievalManifests.some((manifest:any)=>!Array.isArray(manifest.items)))fail("LIVE_STEP_8_RAG_ITEMS_SHAPE_INVALID");
  const manifests=decision.retrievalManifests.map((manifest:any)=>({
    role:manifest.role,id:manifest.id,manifestHash:manifest.manifest_hash,queryHash:manifest.query_hash,
    status:manifest.status,reasonCode:manifest.reason_code,hasConflicts:manifest.has_conflicts,
    embeddingModel:manifest.embedding_model,rerankerVersion:manifest.reranker_version,
    itemCount:Array.isArray(manifest.items)?manifest.items.length:0,
    evidenceSnapshotBinding:{snapshotId:snapshot.id,manifestHash:snapshot.manifestHash,evidenceId:evidence.id}
  }));
  const core={
    schemaVersion:"aeos.live-attestcoin-step.v1",step:8,status:"DECISION_FROZEN",recordedAt:input.recordedAt,
    tenantBinding:"SERVER_RESOLVED_ACTIVE_SESSION",rawTenantIdentifiersDisclosed:false,
    evidence:{id:evidence.id,contentHash:evidence.contentHash,classificationHash:evidence.classificationHash},
    evidenceSnapshot:{id:snapshot.id,manifestHash:snapshot.manifestHash,evidenceCount:snapshot.manifest.length},
    rag:{bundleHash:decision.retrievalBundleHash,manifests},
    decision:{jobId:job.jobId,id:decision.id,status:decision.status,provider:decision.provider,
      modelVersion:"mock-deterministic-v4-eight-agent",inputHash:decision.inputHash,outputHash:decision.outputHash,
      recommendation:output.recommendation,citationCoverage:output.citationCoverage,
      challenges:{risk:output.challenges.filter((item:any)=>item.raisedBy==="Risk").length,compliance:output.challenges.filter((item:any)=>item.raisedBy==="Compliance").length},
      agentRuns:decision.agentRuns.length,a2aMessages:decision.agentMessages.length,humanApprovalRequired:true},
    truthBoundary:{verifiedClaim:"SOURCE_TRANSACTION_INCLUSION",marketStateVerified:false,economicTruthVerified:false,ragContextAvailable:manifests.some((item:any)=>item.status==="SUPPORTED")},
    controls:{exactEightAgentRoster:true,independentRiskChallenge:true,independentComplianceChallenge:true,immutableLineageValidated:true,signerCustody:false,broadcastCapability:false,assetExecutionAuthorized:false}
  };
  return {...core,artifactHash:hashValue(core)};
}
