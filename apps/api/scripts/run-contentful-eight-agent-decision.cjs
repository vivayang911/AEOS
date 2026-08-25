const {mkdirSync,readFileSync,writeFileSync}=require("node:fs");
const {dirname,resolve}=require("node:path");
require("dotenv").config({path:resolve(__dirname,"../../../.env"),quiet:true});
process.env.ADVISORY_PROVIDER="mock-deterministic";
const {NestFactory}=require("@nestjs/core");
const {AppModule}=require("../dist/app.module");
const {DatabaseService}=require("../dist/database.service");
const {DecisionService}=require("../dist/decision.service");
const {buildContentfulEightAgentDecisionArtifact}=require("../dist/contentful-eight-agent-decision");

const load=file=>JSON.parse(readFileSync(resolve(file),"utf8"));
const pause=ms=>new Promise(resolvePromise=>setTimeout(resolvePromise,ms));
const sourceKeys=["aeos-governance-operating-policy","aeos-treasury-authorization-boundary","aeos-risk-review-rubric","aeos-contract-control-surface","aeos-hold-outcome-memory"];

async function main(){
  const step5=load(process.env.AEOS_LIVE_VERIFICATION_REQUEST_OUTPUT||resolve(__dirname,"../../../reports/live-demo/step-5-usc-verification-request-retry-1.json"));
  const step7=load(process.env.AEOS_LIVE_EVIDENCE_IMPORT_OUTPUT||resolve(__dirname,"../../../reports/live-demo/step-7-evidence-import-public-retry-1.json"));
  const step8=load(process.env.AEOS_LIVE_STEP_8_OUTPUT||resolve(__dirname,"../../../reports/live-demo/step-8-eight-agent-decision.json"));
  const approval=load(process.env.AEOS_APPROVED_RAG_RECEIPT||resolve(__dirname,"../../../reports/live-demo/demo-advisory-rubric-v1-approved.json"));
  const wallet=step5?.verificationRequest?.from,evidenceId=step7?.evidenceId,historicalDecisionId=step8?.decision?.id;
  if(!wallet||!evidenceId||!historicalDecisionId||approval?.approvedSourceCount!==5||approval?.controls?.assetExecutionAuthorized!==false)throw new Error("CONTENTFUL_DECISION_INPUT_MISSING");
  const app=await NestFactory.createApplicationContext(AppModule,{logger:false});
  try{
    const db=app.get(DatabaseService),decisions=app.get(DecisionService);
    const sessions=await db.runAsSystem(()=>db.query("SELECT DISTINCT s.user_id,s.active_organization_id AS organization_id,m.role FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN memberships m ON m.organization_id=s.active_organization_id AND m.user_id=s.user_id AND m.status='ACTIVE' WHERE lower(u.wallet_address)=lower($1) AND s.revoked_at IS NULL AND s.expires_at>now()",[wallet]));
    if(sessions.rowCount!==1)throw new Error(sessions.rowCount?"CONTENTFUL_DECISION_ACTIVE_SESSION_AMBIGUOUS":"CONTENTFUL_DECISION_ACTIVE_SESSION_REQUIRED");
    const session=sessions.rows[0],run=work=>db.runWithTenant(session.organization_id,session.user_id,session.role,work);
    const sources=await run(()=>db.query(`SELECT s.id,s.source_key,s.partition,s.content_hash,(SELECT e.status FROM knowledge_source_events e WHERE e.organization_id=s.organization_id AND e.source_id=s.id ORDER BY e.ordinal DESC LIMIT 1) status,(SELECT count(*)::int FROM knowledge_chunks c WHERE c.organization_id=s.organization_id AND c.source_id=s.id) chunk_count FROM knowledge_sources s WHERE s.organization_id=$1 AND s.source_key=ANY($2::text[]) ORDER BY array_position($2::text[],s.source_key)`,[session.organization_id,sourceKeys]));
    if(sources.rowCount!==5||sources.rows.some(row=>row.status!=="APPROVED"||Number(row.chunk_count)<1))throw new Error("CONTENTFUL_DECISION_APPROVED_CORPUS_REQUIRED");
    const receiptById=new Map(approval.sources.map(source=>[source.sourceId,source]));
    if(sources.rows.some(row=>receiptById.get(row.id)?.contentHash!==row.content_hash))throw new Error("CONTENTFUL_DECISION_APPROVAL_RECEIPT_MISMATCH");
    const evidence=await run(()=>db.query("SELECT e.id,e.content_hash FROM evidence e WHERE e.organization_id=$1 AND e.id=$2 AND e.verification_status='VERIFIED'",[session.organization_id,evidenceId]));
    if(evidence.rowCount!==1)throw new Error("CONTENTFUL_DECISION_VERIFIED_EVIDENCE_REQUIRED");
    const historical=await run(()=>decisions.get(session.organization_id,historicalDecisionId));
    const objective="Assess the verified source-transaction inclusion Evidence against the human-approved DEMO_ADVISORY_RUBRIC_V1. Determine whether any treasury action is justified, preserve missing economic Evidence, and return an advisory result for human review.";
    const queued=await run(()=>decisions.enqueue({organizationId:session.organization_id,objective,evidenceIds:[evidenceId]},`demo-advisory-rubric-v1-contentful-v2-${evidenceId}`,session.role));
    let job=queued;if(job.status==="FAILED"&&job.attempts<job.maxAttempts)job=await run(()=>decisions.retryJob(job.jobId,session.organization_id,session.user_id));
    for(let attempt=0;attempt<150&&!['COMPLETED','FAILED','TIMED_OUT'].includes(job.status);attempt++){await pause(100);job=await run(()=>decisions.getJob(session.organization_id,queued.jobId));}
    if(job.status!=="COMPLETED"||!job.decisionId)throw new Error(`CONTENTFUL_DECISION_JOB_${job.status}_${job.lastErrorCode??"UNKNOWN"}`);
    const current=await run(()=>decisions.get(session.organization_id,job.decisionId));
    const snapshot=await run(()=>db.query("SELECT id,manifest_hash FROM evidence_snapshots WHERE organization_id=$1 AND id=$2",[session.organization_id,current.evidenceSnapshotId]));
    if(snapshot.rowCount!==1)throw new Error("CONTENTFUL_DECISION_SNAPSHOT_MISSING");
    const artifact=buildContentfulEightAgentDecisionArtifact({recordedAt:new Date().toISOString(),approvalReceiptHash:approval.reportHash,approvedSources:sources.rows.map(row=>({id:row.id,sourceKey:row.source_key,partition:row.partition,contentHash:row.content_hash})),historical,current,job,snapshot:{id:snapshot.rows[0].id,manifestHash:snapshot.rows[0].manifest_hash},evidence:{id:evidence.rows[0].id,contentHash:evidence.rows[0].content_hash}});
    const output=resolve(process.env.AEOS_CONTENTFUL_DECISION_OUTPUT||resolve(__dirname,"../../../reports/live-demo/contentful-eight-agent-decision-v1.json"));mkdirSync(dirname(output),{recursive:true});writeFileSync(output,`${JSON.stringify(artifact,null,2)}\n`,{encoding:"utf8",flag:"wx"});
    console.log(JSON.stringify({status:artifact.status,outputPath:output,artifactHash:artifact.artifactHash,decisionId:artifact.current.decisionId,jobId:artifact.current.jobId,retrievalBundleHash:artifact.current.retrievalBundleHash,recommendation:artifact.current.recommendation,manifests:artifact.current.manifests.map(manifest=>({role:manifest.role,status:manifest.status,itemCount:manifest.itemCount,partitions:manifest.partitions,manifestHash:manifest.manifestHash})),challenges:artifact.current.challenges.map(challenge=>({raisedBy:challenge.raisedBy,code:challenge.code,status:challenge.status})),proposalCreated:false,signature:false,broadcast:false,assetExecutionAuthorized:false},null,2));
  }finally{await app.close()}
}
main().catch(error=>{console.error(error instanceof Error?error.message:"CONTENTFUL_DECISION_FAILED");process.exit(1)});
