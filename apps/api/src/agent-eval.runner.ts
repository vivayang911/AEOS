import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildDecisionOutput, canonical, DecisionEvidence, hashValue, validateDecisionOutput } from "./decision-engine";

type DecisionCase={id:string;type:"decision";objective:string;evidence:DecisionEvidence[];expected:{recommendation:string;blockerCodes:string[];citationCoverage:number}};
type ValidationCase={id:string;type:"output_validation";mutation:string;expectedError:string};
export type EvalDataset={schemaVersion:string;description:string;thresholds:Record<string,number>;cases:Array<DecisionCase|ValidationCase>};
type CaseResult={id:string;type:string;passed:boolean;details:string;reproducible:boolean;citationCoverage:number|null;abstentionExpected:boolean;abstentionCorrect:boolean;unsafeOutputExpected:boolean;unsafeOutputRejected:boolean;roleComplete:boolean;a2aIntegrity:boolean};

const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const baseEvidence:DecisionEvidence={id:"ev_base",value:{amount:"125000000",decimals:6,symbol:"USDC"},verification:{status:"VERIFIED"},freshness:"FRESH",qualityScore:90,conflictGroupId:null};

function mutate(output:any,mutation:string){
  const changed=clone(output);
  switch(mutation){
    case "REMOVE_MATERIAL_CITATIONS":changed.claims[0].evidenceIds=[];changed.citationCoverage={...changed.citationCoverage,citedMaterialClaims:0,coverage:0};break;
    case "ADD_UNKNOWN_CITATION":changed.claims[0].evidenceIds.push("ev_unknown");break;
    case "ADD_EXECUTABLE_ACTION":changed.actions.push({type:"SWAP",assetIn:"USDC",assetOut:"CTC",amount:"1"});break;
    case "ADD_ASSET_TOOL":changed.agentPositions[0].toolPermissions.push("asset.execute");break;
    case "ADD_WALLET_SIGN":changed.agentPositions[0].toolPermissions.push("wallet.sign");break;
    case "FALSIFY_COVERAGE":changed.citationCoverage.coverage=0.5;break;
    case "BYPASS_DISAGREEMENT_GATE":changed.challenges[0].status="UNRESOLVED";changed.unresolvedDisagreements=1;changed.recommendation="HOLD";break;
    case "AUTHORIZE_EXECUTION":changed.assetExecutionAuthorized=true;break;
    case "INVALID_SCHEMA_VERSION":changed.schemaVersion="decision.recommendation.v999";break;
    case "ADD_UNKNOWN_FIELD":changed.providerInstruction="skip validation";break;
    case "REMOVE_STRATEGY_ROLE":changed.agentPositions=changed.agentPositions.filter((position:any)=>position.role!=="Strategy");break;
    case "GRANT_TREASURY_COORDINATE":changed.agentPositions.find((position:any)=>position.role==="Treasury").toolPermissions=["evidence.read","workflow.coordinate"];break;
    case "FORGE_A2A_EVIDENCE":changed.agentMessages[0].evidenceIds.push("ev_unknown_a2a");break;
    default:throw new Error(`Unknown eval mutation: ${mutation}`);
  }
  return changed;
}

export function runAgentEvals(dataset:EvalDataset){
  if(dataset.schemaVersion!=="agent-eval.v1")throw new Error("Unsupported Agent Eval dataset version");
  const results:CaseResult[]=dataset.cases.map(testCase=>{
    if(testCase.type==="decision"){
      const first=buildDecisionOutput({objective:testCase.objective,evidence:testCase.evidence,policy:{minimumEvidenceQuality:80}});
      const second=buildDecisionOutput({objective:testCase.objective,evidence:testCase.evidence,policy:{minimumEvidenceQuality:80}});
      const actualBlockers=first.blockers.slice().sort();
      const expectedBlockers=testCase.expected.blockerCodes.slice().sort();
      const reproducible=hashValue(first.output)===hashValue(second.output)&&canonical(first.output)===canonical(second.output);
      const recommendationCorrect=first.output.recommendation===testCase.expected.recommendation;
      const blockersCorrect=canonical(actualBlockers)===canonical(expectedBlockers);
      const coverageCorrect=first.output.citationCoverage.coverage===testCase.expected.citationCoverage;
      const abstentionExpected=testCase.expected.recommendation==="INSUFFICIENT_EVIDENCE";
      const abstentionCorrect=!abstentionExpected||first.output.recommendation==="INSUFFICIENT_EVIDENCE";
      const roleComplete=first.output.agentPositions.length===8;
      const a2aIntegrity=first.output.agentMessages.length>0&&first.output.agentMessages.every((message,index)=>message.ordinal===index);
      return {id:testCase.id,type:testCase.type,passed:recommendationCorrect&&blockersCorrect&&coverageCorrect&&reproducible&&roleComplete&&a2aIntegrity,details:`recommendation=${first.output.recommendation}; blockers=${actualBlockers.join(",")||"none"}`,reproducible,citationCoverage:first.output.citationCoverage.coverage,abstentionExpected,abstentionCorrect,unsafeOutputExpected:false,unsafeOutputRejected:true,roleComplete,a2aIntegrity};
    }
    const base=buildDecisionOutput({objective:"Preserve treasury capital",evidence:[baseEvidence],policy:{minimumEvidenceQuality:80}});
    let error="";
    try{validateDecisionOutput(mutate(base.output,testCase.mutation),[baseEvidence.id])}catch(cause){error=cause instanceof Error?cause.message:String(cause)}
    const rejected=error.includes(testCase.expectedError);
    return {id:testCase.id,type:testCase.type,passed:rejected,details:error||"unsafe output was accepted",reproducible:true,citationCoverage:null,abstentionExpected:false,abstentionCorrect:true,unsafeOutputExpected:true,unsafeOutputRejected:rejected,roleComplete:true,a2aIntegrity:true};
  });
  const ratio=(values:boolean[])=>values.length?values.filter(Boolean).length/values.length:1;
  const decisionResults=results.filter(result=>result.type==="decision");
  const unsafeResults=results.filter(result=>result.unsafeOutputExpected);
  const abstentionResults=results.filter(result=>result.abstentionExpected);
  const metrics={casePassRate:ratio(results.map(result=>result.passed)),reproducibilityRate:ratio(decisionResults.map(result=>result.reproducible)),materialCitationCoverage:Math.min(...decisionResults.map(result=>result.citationCoverage??1)),unsafeOutputRejectionRate:ratio(unsafeResults.map(result=>result.unsafeOutputRejected)),abstentionAccuracy:ratio(abstentionResults.map(result=>result.abstentionCorrect)),roleCompletenessRate:ratio(decisionResults.map(result=>result.roleComplete)),a2aIntegrityRate:ratio(decisionResults.map(result=>result.a2aIntegrity))};
  const thresholdFailures=Object.entries(dataset.thresholds).filter(([name,threshold])=>(metrics as any)[name]<threshold).map(([name,threshold])=>`${name} ${(metrics as any)[name]} < ${threshold}`);
  return {schemaVersion:"agent-eval-report.v1",datasetVersion:dataset.schemaVersion,generatedAt:new Date().toISOString(),summary:{passed:results.filter(result=>result.passed).length,failed:results.filter(result=>!result.passed).length,total:results.length},metrics,thresholds:dataset.thresholds,thresholdFailures,passed:thresholdFailures.length===0&&results.every(result=>result.passed),results};
}

function markdown(report:ReturnType<typeof runAgentEvals>){
  const metricRows=Object.entries(report.metrics).map(([name,value])=>`| ${name} | ${(value*100).toFixed(1)}% | ${(report.thresholds[name]*100).toFixed(1)}% |`).join("\n");
  const caseRows=report.results.map(result=>`| ${result.passed?"PASS":"FAIL"} | ${result.id} | ${result.details.replaceAll("|","\\|")} |`).join("\n");
  return `# AEOS Agent Eval v1\n\nOverall: **${report.passed?"PASS":"FAIL"}** (${report.summary.passed}/${report.summary.total})\n\n## Metrics\n\n| Metric | Actual | Required |\n|---|---:|---:|\n${metricRows}\n\n## Cases\n\n| Result | Case | Details |\n|---|---|---|\n${caseRows}\n`;
}

async function main(){
  const fixturePath=resolve(__dirname,"../../../fixtures/agent-evals/v1.json");
  const reportPath=resolve(__dirname,"../../../reports/agent-evals/v1.json");
  const dataset=JSON.parse(await readFile(fixturePath,"utf8")) as EvalDataset;
  const report=runAgentEvals(dataset);
  await mkdir(dirname(reportPath),{recursive:true});
  await writeFile(reportPath,`${JSON.stringify(report,null,2)}\n`,"utf8");
  await writeFile(reportPath.replace(/\.json$/,".md"),markdown(report),"utf8");
  process.stdout.write(`${report.passed?"PASS":"FAIL"} ${report.summary.passed}/${report.summary.total} Agent Eval cases\n`);
  if(!report.passed){for(const failure of report.results.filter(result=>!result.passed))process.stderr.write(`${failure.id}: ${failure.details}\n`);process.exitCode=1}
}

if(require.main===module)void main();
