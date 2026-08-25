import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runAgentEvals, EvalDataset } from "./agent-eval.runner";
import { buildDecisionOutput, decisionRoles, hashValue } from "./decision-engine";

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

  it("uses frozen role-scoped Knowledge citations to produce contentful HOLD positions and independent challenges",()=>{
    const manifests=decisionRoles.map(role=>({role,manifestHash:`0x${role.toLowerCase().padEnd(64,"0").slice(0,64)}`,status:"SUPPORTED",items:[{citation:`rag:source:v1:chunk_${role}:0xcontent`}]}));
    const result=buildDecisionOutput({objective:"Review approved governance and risk context",evidence:[evidence],policy:{minimumEvidenceQuality:80},retrievalManifests:manifests});
    expect(result.positions.every(position=>position.retrievalStatus==="SUPPORTED"&&position.knowledgeCitations?.length===1)).toBe(true);
    expect(result.positions.find(position=>position.role==="Quant")?.position).toContain("unsupported numerical calculation is refused");
    expect(result.positions.find(position=>position.role==="Treasury")?.position).toContain("no transaction is drafted");
    expect(result.challenges).toEqual(expect.arrayContaining([
      expect.objectContaining({raisedBy:"Risk",code:"RISK_MARKET_EVIDENCE_REQUIRED"}),
      expect.objectContaining({raisedBy:"Compliance",code:"COMPLIANCE_AUTHORITY_EVIDENCE_REQUIRED"})
    ]));
    expect(result.output.actions).toEqual([]);
    expect(result.output.assetExecutionAuthorized).toBe(false);
  });

  it("keeps stale Evidence fail-closed while approved Knowledge adds contentful positions and challenges",()=>{
    const manifests=decisionRoles.map(role=>({role,manifestHash:`0x${role.toLowerCase().padEnd(64,"0").slice(0,64)}`,status:"SUPPORTED",items:[{citation:`rag:source:v1:chunk_${role}:0xcontent`}]}));
    const result=buildDecisionOutput({objective:"Review stale Evidence with approved policy context",evidence:[{...evidence,freshness:"STALE"}],policy:{minimumEvidenceQuality:80},retrievalManifests:manifests});
    expect(result.output.recommendation).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.positions.find(position=>position.role==="Strategy")?.position).toContain("retaining HOLD");
    expect(result.challenges).toEqual(expect.arrayContaining([expect.objectContaining({code:"STALE_EVIDENCE",status:"UNRESOLVED"}),expect.objectContaining({code:"RISK_MARKET_EVIDENCE_REQUIRED",status:"RESOLVED"}),expect.objectContaining({code:"COMPLIANCE_AUTHORITY_EVIDENCE_REQUIRED",status:"RESOLVED"})]));
    expect(result.output.actions).toEqual([]);
    expect(result.output.assetExecutionAuthorized).toBe(false);
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
