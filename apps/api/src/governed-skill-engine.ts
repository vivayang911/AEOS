export const GOVERNED_SKILL_SCHEMA_VERSION = "treasury.governed-skill.v1" as const;
export const GOVERNED_SKILL_BACKTEST_VERSION = "treasury.governed-skill-backtest.v1" as const;

export type GovernedSkillRule = {
  riskRegimes: Array<"NORMAL"|"VOLATILE"|"LIQUIDITY_STRESS"|"EVIDENCE_UNCERTAIN"|"BLACK_SWAN">;
  minimumVolatilityBps: number;
  minimumLiquidityDropBps: number;
  minimumPegDeviationBps: number;
  criticalIncidentOnly: boolean;
  maxAbsoluteAdjustmentBps: number;
  forceHold: boolean;
};

export type GovernedSkillVersion = {
  id:string;
  contentHash:string;
  rule:GovernedSkillRule;
};

type SkillInput={volatilityBps:number;liquidityDropBps:number;pegDeviationBps:number;criticalIncident:boolean};
type Advisory={riskRegime:string;safetyState:string;suggestedAdjustmentBps:number;blockers:readonly string[];advisoryOnly:boolean;assetExecutionAuthorized:boolean};
const integer=(value:unknown,min:number,max:number,field:string)=>{if(!Number.isInteger(value)||(value as number)<min||(value as number)>max)throw new Error(`INVALID_${field.toUpperCase()}`);return value as number};
const regimes=new Set(["NORMAL","VOLATILE","LIQUIDITY_STRESS","EVIDENCE_UNCERTAIN","BLACK_SWAN"]);

export function validateGovernedSkillRule(rule:GovernedSkillRule){
  if(!rule||!Array.isArray(rule.riskRegimes)||rule.riskRegimes.length<1||rule.riskRegimes.length>5||new Set(rule.riskRegimes).size!==rule.riskRegimes.length||rule.riskRegimes.some(item=>!regimes.has(item)))throw new Error("INVALID_SKILL_RISK_REGIMES");
  integer(rule.minimumVolatilityBps,0,100_000,"skillMinimumVolatilityBps");
  integer(rule.minimumLiquidityDropBps,0,10_000,"skillMinimumLiquidityDropBps");
  integer(rule.minimumPegDeviationBps,0,10_000,"skillMinimumPegDeviationBps");
  integer(rule.maxAbsoluteAdjustmentBps,0,10_000,"skillMaxAbsoluteAdjustmentBps");
  if(typeof rule.criticalIncidentOnly!=="boolean"||typeof rule.forceHold!=="boolean")throw new Error("INVALID_SKILL_BOOLEAN");
  if(rule.forceHold&&rule.maxAbsoluteAdjustmentBps!==0)throw new Error("SKILL_HOLD_MUST_HAVE_ZERO_CAP");
  return rule;
}

function applies(rule:GovernedSkillRule,advisory:Advisory,input:SkillInput){
  return rule.riskRegimes.includes(advisory.riskRegime as GovernedSkillRule["riskRegimes"][number])&&input.volatilityBps>=rule.minimumVolatilityBps&&input.liquidityDropBps>=rule.minimumLiquidityDropBps&&input.pegDeviationBps>=rule.minimumPegDeviationBps&&(!rule.criticalIncidentOnly||input.criticalIncident);
}

export function applyGovernedSkills<T extends Advisory>(advisory:T,input:SkillInput,skills:GovernedSkillVersion[]){
  const ordered=[...skills].sort((a,b)=>a.id.localeCompare(b.id));
  for(const skill of ordered)validateGovernedSkillRule(skill.rule);
  const applied=ordered.filter(skill=>applies(skill.rule,advisory,input));
  let output=advisory.suggestedAdjustmentBps;let hold=false;
  for(const skill of applied){if(skill.rule.forceHold){output=0;hold=true;break}const cap=skill.rule.maxAbsoluteAdjustmentBps;output=Math.max(-cap,Math.min(cap,output))}
  const blockers=[...advisory.blockers,...(hold?applied.filter(item=>item.rule.forceHold).map(item=>`GOVERNED_SKILL_HOLD:${item.id}`):[])];
  return {...advisory,safetyState:hold?"SKILL_HOLD":advisory.safetyState,suggestedAdjustmentBps:output,boundedOutputBps:output,blockers,skillOverlay:{schemaVersion:"treasury.governed-skill-overlay.v1",policyAllowlistedVersionRefs:ordered.map(item=>item.id),appliedVersionRefs:applied.map(item=>item.id),sourceContentHashes:ordered.map(item=>item.contentHash),baselineSuggestedAdjustmentBps:advisory.suggestedAdjustmentBps,finalSuggestedAdjustmentBps:output,canOnlyTighten:true},advisoryOnly:true,assetExecutionAuthorized:false};
}

export function runGovernedSkillBacktest(rule:GovernedSkillRule){
  validateGovernedSkillRule(rule);
  const cases=[
    {id:"normal-positive",advisory:{riskRegime:"NORMAL",safetyState:"ACTIVE",suggestedAdjustmentBps:400,blockers:[],advisoryOnly:true,assetExecutionAuthorized:false},input:{volatilityBps:100,liquidityDropBps:100,pegDeviationBps:5,criticalIncident:false}},
    {id:"volatile-negative",advisory:{riskRegime:"VOLATILE",safetyState:"DEFENSIVE",suggestedAdjustmentBps:-400,blockers:[],advisoryOnly:true,assetExecutionAuthorized:false},input:{volatilityBps:500,liquidityDropBps:100,pegDeviationBps:5,criticalIncident:false}},
    {id:"liquidity-stress",advisory:{riskRegime:"LIQUIDITY_STRESS",safetyState:"DEFENSIVE",suggestedAdjustmentBps:300,blockers:[],advisoryOnly:true,assetExecutionAuthorized:false},input:{volatilityBps:500,liquidityDropBps:4000,pegDeviationBps:5,criticalIncident:false}},
    {id:"black-swan",advisory:{riskRegime:"BLACK_SWAN",safetyState:"EMERGENCY_HOLD",suggestedAdjustmentBps:0,blockers:["BLACK_SWAN_HOLD"],advisoryOnly:true,assetExecutionAuthorized:false},input:{volatilityBps:2000,liquidityDropBps:8000,pegDeviationBps:500,criticalIncident:true}}
  ];
  const results=cases.map(test=>{const output=applyGovernedSkills(test.advisory,test.input,[{id:"candidate",contentHash:"0x"+"0".repeat(64),rule}]);return{id:test.id,baseline:test.advisory.suggestedAdjustmentBps,final:output.suggestedAdjustmentBps,applied:output.skillOverlay.appliedVersionRefs.length>0,neverIncreased:Math.abs(output.suggestedAdjustmentBps)<=Math.abs(test.advisory.suggestedAdjustmentBps),authorityWithheld:output.assetExecutionAuthorized===false}});
  const passed=results.every(item=>item.neverIncreased&&item.authorityWithheld);
  return{schemaVersion:GOVERNED_SKILL_BACKTEST_VERSION,sourceMode:"SYNTHETIC_DETERMINISTIC",historicalPerformanceClaimed:false,passed,cases:results,advisoryOnly:true,assetExecutionAuthorized:false};
}
