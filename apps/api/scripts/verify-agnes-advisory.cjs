const path=require("node:path");
require("dotenv").config({path:path.resolve(__dirname,"../../../.env"),override:false,quiet:true});
const{createAdvisoryProviderFromEnvironment}=require("../dist/advisory-provider");
const{advisoryTools,validateDecisionOutput}=require("../dist/decision-engine");
const{unavailableRetrievalManifestBundle}=require("../dist/retrieval-manifest");

async function main(){
  if(process.env.ADVISORY_PROVIDER!=="agnes-ai")throw new Error("ADVISORY_PROVIDER must be agnes-ai for the explicit live smoke test");
  const retrieval=unavailableRetrievalManifestBundle("Assess whether the treasury should remain unchanged.");
  const provider=createAdvisoryProviderFromEnvironment();
  const input={schemaVersion:"advisory.input.v2",objective:"Assess whether the treasury should remain unchanged.",evidence:[{id:"ev_live_smoke",value:{status:"verified treasury observation"},verification:{status:"VERIFIED"},freshness:"FRESH",qualityScore:96,conflictGroupId:null}],policy:{minimumEvidenceQuality:80},allowedEvidenceIds:["ev_live_smoke"],allowedTools:[...advisoryTools],retrievalManifests:retrieval.manifests,budget:{timeoutMs:30000,maxRetries:0,maxAgentRuns:10,maxToolCalls:16}};
  const started=Date.now(),output=await provider.run(input);
  validateDecisionOutput(output,input.allowedEvidenceIds);
  console.log(JSON.stringify({status:"PASS",providerId:provider.providerId,modelVersion:provider.modelVersion,recommendation:output.recommendation,agentCount:output.agentPositions.length,actions:output.actions.length,humanApprovalRequired:output.humanApprovalRequired,assetExecutionAuthorized:output.assetExecutionAuthorized,latencyMs:Date.now()-started}));
}
main().catch(error=>{const safeMessages=new Set(["Agnes response is not a JSON object","Agnes narrative schema is invalid","Agnes claim narrative is unsafe or invalid","Agnes Agent narratives are invalid","Agnes narrative must contain the exact eight-Agent roster and safe text","Agnes completion content is missing","Agnes completion is not strict JSON"]);console.error(JSON.stringify({status:"FAIL",errorCode:error?.code||error?.name||"UNKNOWN",failureClass:safeMessages.has(error?.message)?error.message:error?.message?.startsWith("Agnes HTTP ")?error.message:"RESPONSE_VALIDATION_FAILED"}));process.exitCode=1});
