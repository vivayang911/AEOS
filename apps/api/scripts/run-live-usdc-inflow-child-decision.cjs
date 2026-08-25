const {existsSync,mkdirSync,readFileSync,writeFileSync}=require("node:fs");
const {dirname,resolve}=require("node:path");
require("dotenv").config({path:resolve(__dirname,"../../../.env"),quiet:true});
process.env.ADVISORY_PROVIDER="mock-deterministic";
const {NestFactory}=require("@nestjs/core");
const {AppModule}=require("../dist/app.module");
const {DatabaseService}=require("../dist/database.service");
const {DecisionService}=require("../dist/decision.service");
const {buildLiveUsdcInflowChildDecisionArtifact}=require("../dist/live-usdc-inflow-child-decision");

const load=file=>JSON.parse(readFileSync(resolve(file),"utf8"));
const PARENT_DECISION_ID="decision_6967bcf81c7e43e9bba64b3bb5f7101a";

async function main(){
  const imported=load(process.env.AEOS_LIVE_USDC_EVIDENCE_IMPORT_OUTPUT||resolve(__dirname,"../../../reports/live-demo/real-usdc-inflow-evidence-import-v1.json"));
  const request=load(process.env.AEOS_LIVE_USDC_VERIFICATION_REQUEST_OUTPUT||resolve(__dirname,"../../../reports/live-demo/real-usdc-inflow-usc-verification-request-retry-1.json"));
  if(imported?.status!=="IMMUTABLE_EVIDENCE_IMPORTED"||imported?.predicate!=="asset.transfer.inflow"||imported?.controls?.assetExecutionAuthorized!==false)throw new Error("LIVE_USDC_CHILD_IMPORT_ARTIFACT_INVALID");
  const wallet=request?.verificationRequest?.from;if(!wallet)throw new Error("LIVE_USDC_CHILD_WALLET_MISSING");
  const app=await NestFactory.createApplicationContext(AppModule,{logger:false});
  try{
    const db=app.get(DatabaseService),decisions=app.get(DecisionService);
    const sessions=await db.runAsSystem(()=>db.query("SELECT DISTINCT s.user_id,s.active_organization_id AS organization_id,m.role FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN memberships m ON m.organization_id=s.active_organization_id AND m.user_id=s.user_id AND m.status='ACTIVE' WHERE lower(u.wallet_address)=lower($1) AND s.revoked_at IS NULL AND s.expires_at>now()",[wallet]));
    if(sessions.rowCount!==1)throw new Error(sessions.rowCount?"LIVE_USDC_CHILD_ACTIVE_SESSION_AMBIGUOUS":"LIVE_USDC_CHILD_ACTIVE_SESSION_REQUIRED");
    const session=sessions.rows[0],run=work=>db.runWithTenant(session.organization_id,session.user_id,session.role,work);
    const evidenceResult=await run(()=>db.query("SELECT id,content_hash,predicate,freshness_status,verification_status FROM evidence WHERE organization_id=$1 AND id=$2",[session.organization_id,imported.evidenceId]));
    if(evidenceResult.rowCount!==1)throw new Error("LIVE_USDC_CHILD_EVIDENCE_NOT_VISIBLE_IN_TENANT");
    const evidenceRow=evidenceResult.rows[0];
    const parentBefore=await run(()=>decisions.get(session.organization_id,PARENT_DECISION_ID));
    const child=await run(()=>decisions.createChildRevision(session.organization_id,PARENT_DECISION_ID,imported.evidenceId));
    const parent=await run(()=>decisions.get(session.organization_id,PARENT_DECISION_ID));
    const snapshots=await run(()=>db.query("SELECT id,manifest_hash,evidence_ids FROM evidence_snapshots WHERE organization_id=$1 AND id=ANY($2::text[])",[session.organization_id,[parent.evidenceSnapshotId,child.evidenceSnapshotId]]));
    const byId=new Map(snapshots.rows.map(row=>[row.id,row]));
    const parentSnapshot=byId.get(parent.evidenceSnapshotId),childSnapshot=byId.get(child.evidenceSnapshotId);
    if(!parentSnapshot||!childSnapshot)throw new Error("LIVE_USDC_CHILD_SNAPSHOT_MISSING");
    if(parentBefore.outputHash!==parent.outputHash||parentBefore.evidenceManifestHash!==parent.evidenceManifestHash)throw new Error("LIVE_USDC_PARENT_DECISION_MUTATED");
    const output=resolve(process.env.AEOS_LIVE_USDC_CHILD_DECISION_OUTPUT||resolve(__dirname,"../../../reports/live-demo/live-usdc-inflow-child-decision-v1.json"));
    const existing=existsSync(output)?load(output):null;
    const artifact=buildLiveUsdcInflowChildDecisionArtifact({recordedAt:existing?.recordedAt??new Date().toISOString(),parent,child,parentSnapshot:{id:parentSnapshot.id,manifestHash:parentSnapshot.manifest_hash,evidenceIds:parentSnapshot.evidence_ids},childSnapshot:{id:childSnapshot.id,manifestHash:childSnapshot.manifest_hash,evidenceIds:childSnapshot.evidence_ids},newEvidence:{id:evidenceRow.id,contentHash:evidenceRow.content_hash,predicate:evidenceRow.predicate,freshnessStatus:evidenceRow.freshness_status,verificationStatus:evidenceRow.verification_status}});
    if(existing){if(existing?.artifactHash!==artifact.artifactHash||existing?.lineage?.childDecisionId!==artifact.lineage.childDecisionId||existing?.controls?.assetExecutionAuthorized!==false)throw new Error("LIVE_USDC_CHILD_DECISION_ARTIFACT_MISMATCH")}else{mkdirSync(dirname(output),{recursive:true});writeFileSync(output,`${JSON.stringify(artifact,null,2)}\n`,{encoding:"utf8",flag:"wx"})}
    console.log(JSON.stringify({status:artifact.status,outputPath:output,artifactHash:artifact.artifactHash,idempotentReplay:Boolean(existing),parentDecisionId:artifact.lineage.parentDecisionId,childDecisionId:artifact.lineage.childDecisionId,parentSnapshotId:artifact.lineage.parentSnapshot.id,childSnapshotId:artifact.lineage.childSnapshot.id,retrievalBundleHash:artifact.retrieval.bundleHash,retrievalInheritedExactly:true,recommendation:artifact.decisionComparison.recommendation,strategyPositionChanged:artifact.decisionComparison.strategy.position.changed,treasuryEvidenceAdded:artifact.decisionComparison.treasury.evidenceCitations.added,riskChallenges:artifact.decisionComparison.risk.after.map(item=>item.code),complianceChallenges:artifact.decisionComparison.compliance.after.map(item=>item.code),signature:false,broadcast:false,assetExecutionAuthorized:false},null,2));
  }finally{await app.close()}
}
main().catch(error=>{console.error(error instanceof Error?error.message:"LIVE_USDC_CHILD_DECISION_FAILED");process.exit(1)});
