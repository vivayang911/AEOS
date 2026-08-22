import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runAgentEvals, EvalDataset } from "./agent-eval.runner";
import { buildDecisionOutput, hashValue } from "./decision-engine";

describe("Decision Engine",()=>{
  const evidence={id:"ev_1",value:{amount:"125000000"},verification:{status:"VERIFIED"},freshness:"FRESH",qualityScore:90,conflictGroupId:null};

  it("is reproducible for identical frozen input",()=>{
    const input={objective:"Preserve treasury capital",evidence:[evidence],policy:{minimumEvidenceQuality:80}};
    expect(hashValue(buildDecisionOutput(input).output)).toBe(hashValue(buildDecisionOutput(input).output));
  });

  it("runs the complete eight-Agent roster with distinct least-privilege tools and auditable A2A handoffs",()=>{
    const result=buildDecisionOutput({objective:"Preserve treasury capital",evidence:[evidence],policy:{minimumEvidenceQuality:80}});
    expect(result.positions.map(position=>position.role)).toEqual(["Governor","Research","Strategy","Quant","Risk","Compliance","Portfolio","Treasury"]);
    expect(new Set(result.positions.map(position=>position.toolPermissions.join(","))).size).toBe(8);
    expect(result.challenges.map(challenge=>challenge.raisedBy)).toEqual(["Risk","Compliance"]);
    expect(result.agentMessages.map(message=>message.ordinal)).toEqual(result.agentMessages.map((_,index)=>index));
    expect(result.agentMessages).toEqual(expect.arrayContaining([expect.objectContaining({messageType:"HANDOFF",senderRole:"Portfolio",recipientRole:"Treasury"})]));
    expect(result.positions.every(position=>position.assetExecutionAuthorized===false)).toBe(true);
  });

  it("fails closed when policy budget cannot run all eight Agents",()=>{
    expect(()=>buildDecisionOutput({objective:"Review balances",evidence:[evidence],policy:{minimumEvidenceQuality:80},budget:{maxAgentRuns:7,maxToolCalls:16,timeoutMs:5000,maxRetries:1}})).toThrow("Eight-Agent run budget is insufficient");
  });

  it("refuses integers beyond the supported 78 digit precision boundary",()=>{
    const extreme={...evidence,value:{amount:"9".repeat(79)}};
    const result=buildDecisionOutput({objective:"Review balances",evidence:[extreme],policy:{minimumEvidenceQuality:80}});
    expect(result.output.recommendation).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.blockers).toContain("EXTREME_NUMERIC_VALUE");
  });
});

describe("Agent Eval v1",()=>{
  it("passes every versioned golden case and safety threshold",()=>{
    const dataset=JSON.parse(readFileSync(resolve(__dirname,"../../../fixtures/agent-evals/v1.json"),"utf8")) as EvalDataset;
    const report=runAgentEvals(dataset);
    expect(report.passed).toBe(true);
    expect(report.summary).toEqual({passed:21,failed:0,total:21});
    expect(report.metrics).toEqual({casePassRate:1,reproducibilityRate:1,materialCitationCoverage:1,unsafeOutputRejectionRate:1,abstentionAccuracy:1,roleCompletenessRate:1,a2aIntegrityRate:1});
  });
});
