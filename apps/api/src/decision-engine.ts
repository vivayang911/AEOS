import { createHash } from "node:crypto";

export const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`:JSON.stringify(value);
export const hashValue=(value:unknown)=>`0x${createHash("sha256").update(canonical(value)).digest("hex")}`;

export const decisionRoles=["Governor","Research","Strategy","Quant","Risk","Compliance","Portfolio","Treasury"] as const;
export type DecisionRole=typeof decisionRoles[number];
export const advisoryTools=["evidence.read","workflow.coordinate","opportunity.discover","policy.read","calculator.deterministic","risk.evaluate","compliance.check","committee.read","simulation.read"] as const;
export type AdvisoryTool=typeof advisoryTools[number];
export const roleToolPermissions:Readonly<Record<DecisionRole,ReadonlyArray<AdvisoryTool>>>={
  Governor:["evidence.read","workflow.coordinate"],
  Research:["evidence.read","opportunity.discover"],
  Strategy:["evidence.read","policy.read"],
  Quant:["evidence.read","calculator.deterministic"],
  Risk:["evidence.read","risk.evaluate"],
  Compliance:["evidence.read","compliance.check"],
  Portfolio:["evidence.read","committee.read"],
  Treasury:["evidence.read","simulation.read"]
};
export const roleToolCallUsage:Readonly<Record<DecisionRole,number>>={Governor:1,Research:2,Strategy:2,Quant:2,Risk:1,Compliance:1,Portfolio:1,Treasury:2};
export const minimumEightAgentBudget={maxAgentRuns:10,maxToolCalls:16,timeoutMs:15000,maxRetries:1} as const;

export type DecisionEvidence={id:string;value:unknown;verification:{status:string};freshness:string;qualityScore:number;conflictGroupId:string|null};
export type DecisionPolicy={minimumEvidenceQuality:number};
export type DecisionClaim={text:string;materiality:"MATERIAL"|"SUPPORTING";evidenceIds:string[];confidence:number};
export type DecisionChallenge={round:number;raisedBy:"Risk"|"Compliance";targetRole:"Strategy";code:string;challenge:string;response:string;status:"RESOLVED"|"UNRESOLVED"};
export type AgentMessage={ordinal:number;round:number;senderRole:DecisionRole;recipientRole:DecisionRole;messageType:"REQUEST"|"RESPONSE"|"CHALLENGE"|"RESOLUTION"|"HANDOFF"|"DECISION";code:string;content:string;evidenceIds:string[]};
export type DecisionBudget={timeoutMs:number;maxRetries:number;maxAgentRuns:number;maxToolCalls:number};

const injectionPattern=/ignore\s+(all\s+)?(previous|prior)|system\s+prompt|developer\s+message|reveal\s+(a\s+)?secret|private\s+key|execute\s+(this\s+)?(instruction|command)|bypass\s+(the\s+)?(policy|guardrail)/i;
const containsExtremeInteger=(value:unknown):boolean=>{
  if(typeof value==="string"&&/^[+-]?\d+$/.test(value))return value.replace(/^[+-]/,"").length>78;
  if(Array.isArray(value))return value.some(containsExtremeInteger);
  if(value&&typeof value==="object")return Object.values(value).some(containsExtremeInteger);
  return false;
};

export class DecisionOutputValidationError extends Error {
  constructor(message:string){super(message);this.name="DecisionOutputValidationError"}
}

export function citationCoverage(claims:DecisionClaim[]){
  const material=claims.filter(claim=>claim.materiality==="MATERIAL");
  const cited=material.filter(claim=>claim.evidenceIds.length>0);
  return {totalClaims:claims.length,materialClaims:material.length,citedMaterialClaims:cited.length,coverage:material.length?cited.length/material.length:1};
}

const rolePosition=(role:DecisionRole,recommendation:"HOLD"|"INSUFFICIENT_EVIDENCE",citations:string[],retrievalManifest?:{manifestHash:string;status:string;items:ReadonlyArray<{citation:string}>})=>{
  const positions:Record<DecisionRole,string>={
    Governor:recommendation==="HOLD"?"Committee evidence, challenges, and handoffs are complete; route HOLD to human review.":"Committee guardrails require refusal; unresolved challenges remain visible.",
    Research:recommendation==="HOLD"?"Verified Evidence was reviewed and no supported asset-changing opportunity was established.":"Available Evidence cannot support a reliable research conclusion.",
    Strategy:recommendation==="HOLD"?"No policy-consistent rebalance candidate is justified by the frozen snapshot.":"No strategy candidate may advance while Evidence or challenge blockers remain.",
    Quant:recommendation==="HOLD"?"Deterministic calculations do not justify an asset-changing recommendation.":"Quantitative interpretation is blocked by invalid or insufficient inputs.",
    Risk:recommendation==="HOLD"?"Risk challenge is resolved only for a no-action HOLD recommendation.":"Risk challenge remains unresolved and blocks committee approval.",
    Compliance:recommendation==="HOLD"?"Compliance challenge is resolved because no restricted action is proposed.":"Compliance cannot clear a recommendation based on the frozen snapshot.",
    Portfolio:recommendation==="HOLD"?"Portfolio retains the current allocation and proposes no executable action.":"Portfolio refuses to form an allocation recommendation.",
    Treasury:recommendation==="HOLD"?"Treasury checklist contains no transaction draft and awaits human governance review.":"Treasury produces no action draft while committee blockers remain."
  };
  const knowledgeCitations=retrievalManifest?.items.map(item=>item.citation)??[];
  return {role,responsibility:role,position:positions[role],confidence:recommendation==="HOLD"?0.8:0,citations,...(retrievalManifest?{retrievalManifestHash:retrievalManifest.manifestHash,retrievalStatus:retrievalManifest.status}:{}),...(knowledgeCitations.length?{knowledgeCitations:[...knowledgeCitations]}:{}),toolPermissions:[...roleToolPermissions[role]],runState:"SUCCEEDED",attempts:1,assetExecutionAuthorized:false};
};

function buildAgentMessages(citations:string[],challenges:DecisionChallenge[],recommendation:"HOLD"|"INSUFFICIENT_EVIDENCE"){
  const messages:AgentMessage[]=[];
  const add=(round:number,senderRole:DecisionRole,recipientRole:DecisionRole,messageType:AgentMessage["messageType"],code:string,content:string,evidenceIds=citations)=>messages.push({ordinal:messages.length,round,senderRole,recipientRole,messageType,code,content,evidenceIds:[...evidenceIds]});
  add(1,"Governor","Research","REQUEST","RESEARCH_AND_DISCOVERY","Review the frozen Evidence and identify only supported opportunity signals.");
  add(1,"Governor","Strategy","REQUEST","STRATEGY_CANDIDATES","Form policy-consistent candidates without executable actions.");
  add(1,"Governor","Quant","REQUEST","DETERMINISTIC_ASSESSMENT","Calculate only metrics supported by the frozen Evidence.");
  add(1,"Research","Strategy","RESPONSE","OPPORTUNITY_DISCOVERY","Opportunity Discovery found no Evidence-supported asset-changing candidate.");
  add(1,"Quant","Strategy","RESPONSE","QUANT_ASSESSMENT","Deterministic assessment is complete; no autonomous action is permitted.");
  for(const challenge of challenges){
    add(2,challenge.raisedBy,challenge.targetRole,"CHALLENGE",challenge.code,challenge.challenge);
    add(2,challenge.targetRole,challenge.raisedBy,"RESOLUTION",challenge.code,challenge.response);
  }
  add(3,"Strategy","Portfolio","HANDOFF","CHALLENGE_AWARE_STRATEGY",recommendation==="HOLD"?"Pass the no-action candidate with resolved Risk and Compliance challenges.":"Pass refusal state with every unresolved challenge preserved.");
  add(3,"Portfolio","Treasury","HANDOFF","PORTFOLIO_RECOMMENDATION",recommendation==="HOLD"?"Retain allocation; prepare no transaction.":"Do not prepare an action draft.");
  add(3,"Treasury","Governor","RESPONSE","TREASURY_CHECKLIST",recommendation==="HOLD"?"No transaction is drafted; human review remains mandatory.":"Treasury is blocked and has produced no action.");
  add(3,"Governor","Portfolio","DECISION","COMMITTEE_OUTCOME",recommendation==="HOLD"?"HOLD is advisory and requires human review.":"INSUFFICIENT_EVIDENCE is final for this frozen snapshot.");
  return messages;
}

export function buildDecisionOutput(input:{objective:string;evidence:DecisionEvidence[];policy:DecisionPolicy;budget?:DecisionBudget;retrievalManifests?:ReadonlyArray<{role:DecisionRole;manifestHash:string;status:string;items:ReadonlyArray<{citation:string}>}>}){
  const budget={...minimumEightAgentBudget,...input.budget};
  if(!Number.isInteger(budget.maxAgentRuns)||budget.maxAgentRuns<decisionRoles.length)throw new DecisionOutputValidationError("Eight-Agent run budget is insufficient");
  const minimumToolCalls=Object.values(roleToolCallUsage).reduce((sum,value)=>sum+value,0);
  if(!Number.isInteger(budget.maxToolCalls)||budget.maxToolCalls<minimumToolCalls)throw new DecisionOutputValidationError("Eight-Agent tool-call budget is insufficient");
  const blockers:string[]=[];
  if(input.evidence.some(item=>item.verification.status!=="VERIFIED"))blockers.push("UNVERIFIED_EVIDENCE");
  if(input.evidence.some(item=>item.freshness!=="FRESH"))blockers.push("STALE_EVIDENCE");
  if(input.evidence.some(item=>item.qualityScore<input.policy.minimumEvidenceQuality))blockers.push("LOW_QUALITY_EVIDENCE");
  if(input.evidence.some(item=>item.conflictGroupId))blockers.push("UNRESOLVED_CONFLICT");
  if(injectionPattern.test(canonical({objective:input.objective,evidence:input.evidence.map(item=>item.value)})))blockers.push("PROMPT_INJECTION_DETECTED");
  if(input.evidence.some(item=>containsExtremeInteger(item.value)))blockers.push("EXTREME_NUMERIC_VALUE");

  const recommendation=blockers.length?"INSUFFICIENT_EVIDENCE" as const:"HOLD" as const;
  const citations=input.evidence.map(item=>item.id).sort();
  const claims:DecisionClaim[]=[recommendation==="HOLD"
    ?{text:"Current verified snapshot supports no asset-changing action.",materiality:"MATERIAL",evidenceIds:citations,confidence:0.8}
    :{text:"The selected snapshot is insufficient for a governed high-impact recommendation.",materiality:"MATERIAL",evidenceIds:citations,confidence:1}];
  const challenges:DecisionChallenge[]=blockers.length
    ?blockers.flatMap(code=>(["Risk","Compliance"] as const).map(raisedBy=>({round:2,raisedBy,targetRole:"Strategy" as const,code,challenge:`${raisedBy} requires ${code} to be resolved before a strategy may advance.`,response:"Strategy cannot resolve this issue from the frozen snapshot.",status:"UNRESOLVED" as const})))
    :[
      {round:2,raisedBy:"Risk",targetRole:"Strategy",code:"RISK_NO_ACTION_CONFIRMED",challenge:"Does the candidate create an unsupported risk exposure?",response:"No asset-changing candidate is proposed; HOLD remains advisory.",status:"RESOLVED"},
      {round:2,raisedBy:"Compliance",targetRole:"Strategy",code:"COMPLIANCE_NO_ACTION_CONFIRMED",challenge:"Does the candidate violate policy or governance constraints?",response:"No transaction or policy change is proposed; human review remains required.",status:"RESOLVED"}
    ];
  const retrievalByRole=new Map((input.retrievalManifests??[]).map(manifest=>[manifest.role,manifest]));
  const positions=decisionRoles.map(role=>rolePosition(role,recommendation,citations,retrievalByRole.get(role)));
  const agentMessages=buildAgentMessages(citations,challenges,recommendation);
  const orchestration={state:"COMPLETED",roundsCompleted:3,retriesUsed:0,timeouts:0,budget:{...budget,agentRunsUsed:decisionRoles.length,toolCallsUsed:minimumToolCalls}};
  const output={schemaVersion:"decision.recommendation.v3",recommendation,claims,actions:[],risks:blockers.map(code=>({severity:"HIGH",code,description:"Deterministic evidence guardrail blocked the recommendation."})),dissent:challenges.filter(item=>item.status==="UNRESOLVED").map(item=>item.challenge),challenges,agentMessages,unresolvedDisagreements:challenges.filter(item=>item.status==="UNRESOLVED").length,citationCoverage:citationCoverage(claims),assumptions:["Mock provider is deterministic and advisory only.","Opportunity Discovery is a Research/Strategy capability; Monitoring is a deterministic service outside the committee."],agentPositions:positions,orchestration,humanApprovalRequired:true,assetExecutionAuthorized:false};
  validateDecisionOutput(output,citations,Object.fromEntries((input.retrievalManifests??[]).map(manifest=>[manifest.role,manifest.items.map(item=>item.citation)])),Object.fromEntries((input.retrievalManifests??[]).map(manifest=>[manifest.role,{manifestHash:manifest.manifestHash,status:manifest.status}])));
  return {output,claims,challenges,agentMessages,positions,blockers,citations,orchestration};
}

export function validateDecisionOutput(output:any,allowedEvidenceIds:string[],allowedKnowledgeByRole:Partial<Record<DecisionRole,string[]>>={},allowedRetrievalByRole:Partial<Record<DecisionRole,{manifestHash:string;status:string}>>={}){
  if(!output||typeof output!=="object"||output.schemaVersion!=="decision.recommendation.v3")throw new DecisionOutputValidationError("Decision output schema version is invalid");
  const allowedTopLevel=new Set(["schemaVersion","recommendation","claims","actions","risks","dissent","challenges","agentMessages","unresolvedDisagreements","citationCoverage","assumptions","agentPositions","orchestration","humanApprovalRequired","assetExecutionAuthorized"]);
  const unknownTopLevel=Object.keys(output).filter(key=>!allowedTopLevel.has(key));
  if(unknownTopLevel.length)throw new DecisionOutputValidationError(`Decision output contains unknown fields: ${unknownTopLevel.join(",")}`);
  if(!["HOLD","INSUFFICIENT_EVIDENCE"].includes(output.recommendation))throw new DecisionOutputValidationError("Decision recommendation is invalid");
  if(!Array.isArray(output.claims)||!Array.isArray(output.actions)||!Array.isArray(output.agentPositions)||!Array.isArray(output.agentMessages)||!Array.isArray(output.challenges))throw new DecisionOutputValidationError("Decision output arrays are invalid");
  for(const claim of output.claims){
    if(!["MATERIAL","SUPPORTING"].includes(claim.materiality)||!Array.isArray(claim.evidenceIds))throw new DecisionOutputValidationError("Claim schema is invalid");
    if(claim.materiality==="MATERIAL"&&!claim.evidenceIds.length)throw new DecisionOutputValidationError("Material claims require Evidence citations");
    for(const citation of claim.evidenceIds)if(!allowedEvidenceIds.includes(citation))throw new DecisionOutputValidationError(`Unknown Evidence ID: ${citation}`);
  }
  const measured=citationCoverage(output.claims);
  if(!output.citationCoverage||output.citationCoverage.coverage!==measured.coverage||measured.coverage!==1)throw new DecisionOutputValidationError("Material claim citation coverage must be complete and accurately reported");
  if(output.actions.length)throw new DecisionOutputValidationError("Agent output cannot contain executable asset actions");
  if(output.assetExecutionAuthorized!==false||output.humanApprovalRequired!==true)throw new DecisionOutputValidationError("Decision authority boundary is invalid");
  if(output.agentPositions.length!==decisionRoles.length||output.agentPositions.some((position:any,index:number)=>position.role!==decisionRoles[index]))throw new DecisionOutputValidationError("Decision must contain the complete ordered eight-Agent roster");
  for(const position of output.agentPositions){
    const role=position.role as DecisionRole;
    const expected=roleToolPermissions[role];
    if(!expected||canonical(position.toolPermissions)!==canonical(expected))throw new DecisionOutputValidationError(`Agent tool policy forbids permissions for ${String(role)}`);
    if(position.assetExecutionAuthorized!==false)throw new DecisionOutputValidationError("Agent authority boundary is invalid");
    for(const citation of position.citations??[])if(!allowedEvidenceIds.includes(citation))throw new DecisionOutputValidationError(`Unknown Evidence ID: ${citation}`);
    const allowedRetrieval=allowedRetrievalByRole[role];if(allowedRetrieval&&(position.retrievalManifestHash!==allowedRetrieval.manifestHash||position.retrievalStatus!==allowedRetrieval.status))throw new DecisionOutputValidationError(`Unknown or role-forbidden RAG Manifest: ${role}`);
    const allowedKnowledge=allowedKnowledgeByRole[role]??[];for(const citation of position.knowledgeCitations??[])if(!allowedKnowledge.includes(citation))throw new DecisionOutputValidationError(`Unknown or role-forbidden RAG citation: ${citation}`);
  }
  for(const [index,message] of output.agentMessages.entries()){
    if(message.ordinal!==index||!decisionRoles.includes(message.senderRole)||!decisionRoles.includes(message.recipientRole)||message.senderRole===message.recipientRole)throw new DecisionOutputValidationError("A2A message sequence or role is invalid");
    if(!["REQUEST","RESPONSE","CHALLENGE","RESOLUTION","HANDOFF","DECISION"].includes(message.messageType)||!Array.isArray(message.evidenceIds))throw new DecisionOutputValidationError("A2A message schema is invalid");
    for(const citation of message.evidenceIds)if(!allowedEvidenceIds.includes(citation))throw new DecisionOutputValidationError(`Unknown A2A Evidence ID: ${citation}`);
  }
  const riskChallenge=output.challenges.some((challenge:any)=>challenge.raisedBy==="Risk"&&challenge.targetRole==="Strategy");
  const complianceChallenge=output.challenges.some((challenge:any)=>challenge.raisedBy==="Compliance"&&challenge.targetRole==="Strategy");
  if(!riskChallenge||!complianceChallenge)throw new DecisionOutputValidationError("Risk and Compliance challenges are both required");
  const unresolved=output.challenges.filter((challenge:any)=>challenge.status==="UNRESOLVED").length;
  if(!Number.isInteger(output.unresolvedDisagreements)||output.unresolvedDisagreements!==unresolved)throw new DecisionOutputValidationError("Unresolved disagreement count is invalid");
  if(output.unresolvedDisagreements&&output.recommendation!=="INSUFFICIENT_EVIDENCE")throw new DecisionOutputValidationError("Unresolved disagreements must block recommendation");
  const budget=output.orchestration?.budget;
  if(!budget||budget.agentRunsUsed!==decisionRoles.length||budget.maxAgentRuns<decisionRoles.length||budget.toolCallsUsed>budget.maxToolCalls)throw new DecisionOutputValidationError("Eight-Agent orchestration budget is invalid");
  return measured;
}
