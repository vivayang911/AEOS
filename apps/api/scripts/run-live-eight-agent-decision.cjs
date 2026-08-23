const {mkdirSync,readFileSync,writeFileSync}=require("node:fs");
const {dirname,resolve}=require("node:path");
require("dotenv").config({path:resolve(__dirname,"../../../.env"),quiet:true});
process.env.ADVISORY_PROVIDER="mock-deterministic";
const {NestFactory}=require("@nestjs/core");
const {AppModule}=require("../dist/app.module");
const {DatabaseService}=require("../dist/database.service");
const {DecisionService}=require("../dist/decision.service");
const {buildLiveEightAgentDecisionArtifact}=require("../dist/live-eight-agent-decision");

const load=path=>JSON.parse(readFileSync(resolve(path),"utf8"));
const pause=ms=>new Promise(resolvePromise=>setTimeout(resolvePromise,ms));
async function main(){
  const step5=load(process.env.AEOS_LIVE_VERIFICATION_REQUEST_OUTPUT||resolve(__dirname,"../../../reports/live-demo/step-5-usc-verification-request-retry-1.json"));
  const step7=load(process.env.AEOS_LIVE_EVIDENCE_IMPORT_OUTPUT||resolve(__dirname,"../../../reports/live-demo/step-7-evidence-import-public-retry-1.json"));
  const wallet=step5?.verificationRequest?.from,evidenceId=step7?.evidenceId;if(!wallet||!evidenceId)throw new Error("LIVE_STEP_8_INPUT_MISSING");
  const app=await NestFactory.createApplicationContext(AppModule,{logger:false});
  try{
    const db=app.get(DatabaseService),decisions=app.get(DecisionService);
    const sessions=await db.runAsSystem(()=>db.query("SELECT s.user_id,s.active_organization_id AS organization_id,m.role FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN memberships m ON m.organization_id=s.active_organization_id AND m.user_id=s.user_id AND m.status='ACTIVE' WHERE lower(u.wallet_address)=lower($1) AND s.revoked_at IS NULL AND s.expires_at>now() ORDER BY s.created_at DESC",[wallet]));
    if(sessions.rowCount!==1)throw new Error(sessions.rowCount?"LIVE_STEP_8_ACTIVE_SESSION_AMBIGUOUS":"LIVE_STEP_8_ACTIVE_SESSION_REQUIRED");
    const session=sessions.rows[0],objective="Assess the verified source-transaction inclusion evidence and determine whether any treasury action is justified under Evidence-first DAO governance.";
    const run=work=>db.runWithTenant(session.organization_id,session.user_id,session.role,work);
    const evidence=await run(()=>db.query("SELECT e.id,e.content_hash,c.classification_hash FROM evidence e JOIN evidence_classifications c ON c.organization_id=e.organization_id AND c.evidence_id=e.id AND c.classifier_version='deterministic-evidence-classifier-v1' WHERE e.organization_id=$1 AND e.id=$2 AND e.verification_status='VERIFIED'",[session.organization_id,evidenceId]));
    if(evidence.rowCount!==1)throw new Error("LIVE_STEP_8_VERIFIED_EVIDENCE_REQUIRED");
    const queued=await run(()=>decisions.enqueue({organizationId:session.organization_id,objective,evidenceIds:[evidenceId]},`live-step-8-v3-${evidenceId}`,session.role));
    let job=queued;for(let attempt=0;attempt<150&&!['COMPLETED','FAILED','TIMED_OUT'].includes(job.status);attempt++){await pause(100);job=await run(()=>decisions.getJob(session.organization_id,queued.jobId));}
    if(job.status!=="COMPLETED"||!job.decisionId)throw new Error(`LIVE_STEP_8_JOB_${job.status}_${job.lastErrorCode??"UNKNOWN"}`);
    const decision=await run(()=>decisions.get(session.organization_id,job.decisionId));
    const snapshots=await run(()=>db.query("SELECT id,manifest,manifest_hash FROM evidence_snapshots WHERE organization_id=$1 AND id=$2",[session.organization_id,decision.evidenceSnapshotId]));
    if(snapshots.rowCount!==1)throw new Error("LIVE_STEP_8_SNAPSHOT_MISSING");
    const row=evidence.rows[0],snapshotRow=snapshots.rows[0];
    const artifact=buildLiveEightAgentDecisionArtifact({recordedAt:new Date().toISOString(),evidence:{id:row.id,contentHash:row.content_hash,classificationHash:row.classification_hash},snapshot:{id:snapshotRow.id,manifestHash:snapshotRow.manifest_hash,manifest:snapshotRow.manifest},job,decision});
    const outputPath=resolve(process.env.AEOS_LIVE_STEP_8_OUTPUT||resolve(__dirname,"../../../reports/live-demo/step-8-eight-agent-decision.json"));mkdirSync(dirname(outputPath),{recursive:true});writeFileSync(outputPath,`${JSON.stringify(artifact,null,2)}\n`,{encoding:"utf8",flag:"wx"});
    console.log(JSON.stringify({status:artifact.status,outputPath,evidenceSnapshotId:artifact.evidenceSnapshot.id,decisionJobId:artifact.decision.jobId,decisionId:artifact.decision.id,recommendation:artifact.decision.recommendation,ragContextAvailable:artifact.truthBoundary.ragContextAvailable,agentRuns:artifact.decision.agentRuns,a2aMessages:artifact.decision.a2aMessages,rawTenantIdentifiersDisclosed:false,assetExecutionAuthorized:false},null,2));
  }finally{await app.close()}
}
if(require.main===module)main().catch(error=>{console.error(error instanceof Error?error.message:"LIVE_STEP_8_FAILED");process.exit(1)});
