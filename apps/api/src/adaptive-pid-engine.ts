import { TreasuryPolicyConfig, validateTreasuryPolicy } from "./policy-engine";

export type AdaptivePidEnvelope = {
  enabled: boolean;
  kpMinBps: number; kpMaxBps: number;
  kiMinBps: number; kiMaxBps: number;
  kdMinBps: number; kdMaxBps: number;
  maxGainStepBps: number;
  derivativeFilterBps: number;
  maxOutputBps: number;
  maxOutputRateBps: number;
  minimumEvidenceConfidenceBps: number;
  volatileThresholdBps: number;
  liquidityStressThresholdBps: number;
  blackSwanDeviationBps: number;
  evidenceObservation?: { samplePeriodMs:number; maxMetricSkewMs:number; predicateSetVersion:"treasury.observed-state.v1" };
};

export type AdaptivePidInput = {
  observedAllocationBps: number;
  previousErrorBps: number;
  integralErrorBps: number;
  previousFilteredDerivativeBpsPerDay: number;
  previousOutputBps: number;
  previousGains: { kpBps: number; kiBps: number; kdBps: number };
  deltaTimeMs: number;
  volatilityBps: number;
  liquidityDropBps: number;
  pegDeviationBps: number;
  criticalIncident: boolean;
  evidenceEligible: boolean;
  evidenceConfidenceBps: number;
};

type Regime = "NORMAL"|"VOLATILE"|"LIQUIDITY_STRESS"|"EVIDENCE_UNCERTAIN"|"BLACK_SWAN";
const integer=(value:unknown,min:number,max:number,field:string)=>{if(!Number.isInteger(value)||(value as number)<min||(value as number)>max)throw new Error(`INVALID_${field.toUpperCase()}`);return value as number};
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const signedClamp=(value:number,limit:number)=>clamp(value,-limit,limit);
const moveToward=(current:number,target:number,step:number)=>current<target?Math.min(target,current+step):Math.max(target,current-step);

export function validateAdaptivePidEnvelope(config:TreasuryPolicyConfig,envelope:AdaptivePidEnvelope){
  validateTreasuryPolicy(config);
  if(!envelope||envelope.enabled!==true)throw new Error("ADAPTIVE_PID_NOT_GOVERNED");
  for(const field of ["kpMinBps","kpMaxBps","kiMinBps","kiMaxBps","kdMinBps","kdMaxBps","maxGainStepBps"] as const)integer(envelope[field],0,50_000,field);
  integer(envelope.derivativeFilterBps,0,10_000,"derivativeFilterBps");integer(envelope.maxOutputBps,0,10_000,"maxOutputBps");integer(envelope.maxOutputRateBps,0,10_000,"maxOutputRateBps");
  integer(envelope.minimumEvidenceConfidenceBps,0,10_000,"minimumEvidenceConfidenceBps");integer(envelope.volatileThresholdBps,1,100_000,"volatileThresholdBps");integer(envelope.liquidityStressThresholdBps,1,10_000,"liquidityStressThresholdBps");integer(envelope.blackSwanDeviationBps,1,10_000,"blackSwanDeviationBps");
  if(envelope.evidenceObservation){integer(envelope.evidenceObservation.samplePeriodMs,10,86_400_000,"samplePeriodMs");integer(envelope.evidenceObservation.maxMetricSkewMs,1,86_400_000,"maxMetricSkewMs");if(envelope.evidenceObservation.predicateSetVersion!=="treasury.observed-state.v1")throw new Error("INVALID_OBSERVED_STATE_PREDICATE_VERSION")}
  if(envelope.kpMinBps>envelope.kpMaxBps||envelope.kiMinBps>envelope.kiMaxBps||envelope.kdMinBps>envelope.kdMaxBps)throw new Error("ADAPTIVE_PID_GAIN_RANGE_INVALID");
  if(config.pid.kpBps<envelope.kpMinBps||config.pid.kpBps>envelope.kpMaxBps||config.pid.kiBps<envelope.kiMinBps||config.pid.kiBps>envelope.kiMaxBps||config.pid.kdBps<envelope.kdMinBps||config.pid.kdBps>envelope.kdMaxBps)throw new Error("BASE_PID_OUTSIDE_GOVERNED_ENVELOPE");
  if(envelope.maxOutputBps>config.pid.maxAdjustmentBps||envelope.maxOutputBps>config.riskLimits.maxSingleAdjustmentBps)throw new Error("ADAPTIVE_OUTPUT_EXCEEDS_HARD_LIMIT");
  return envelope;
}

function regime(envelope:AdaptivePidEnvelope,input:AdaptivePidInput):Regime{
  if(input.criticalIncident||input.pegDeviationBps>=envelope.blackSwanDeviationBps)return "BLACK_SWAN";
  if(!input.evidenceEligible||input.evidenceConfidenceBps<envelope.minimumEvidenceConfidenceBps)return "EVIDENCE_UNCERTAIN";
  if(input.liquidityDropBps>=envelope.liquidityStressThresholdBps)return "LIQUIDITY_STRESS";
  if(input.volatilityBps>=envelope.volatileThresholdBps)return "VOLATILE";
  return "NORMAL";
}

export function runAdaptivePid(config:TreasuryPolicyConfig,envelope:AdaptivePidEnvelope,input:AdaptivePidInput){
  validateAdaptivePidEnvelope(config,envelope);
  integer(input.observedAllocationBps,0,10_000,"observedAllocationBps");integer(input.previousErrorBps,-10_000,10_000,"previousErrorBps");integer(input.integralErrorBps,-1_000_000,1_000_000,"integralErrorBps");integer(input.previousFilteredDerivativeBpsPerDay,-10_000_000,10_000_000,"previousFilteredDerivativeBpsPerDay");
  integer(input.previousOutputBps,-10_000,10_000,"previousOutputBps");integer(input.deltaTimeMs,1,86_400_000,"deltaTimeMs");integer(input.volatilityBps,0,100_000,"volatilityBps");integer(input.liquidityDropBps,0,10_000,"liquidityDropBps");integer(input.pegDeviationBps,0,10_000,"pegDeviationBps");integer(input.evidenceConfidenceBps,0,10_000,"evidenceConfidenceBps");
  integer(input.previousGains.kpBps,envelope.kpMinBps,envelope.kpMaxBps,"previousKpBps");integer(input.previousGains.kiBps,envelope.kiMinBps,envelope.kiMaxBps,"previousKiBps");integer(input.previousGains.kdBps,envelope.kdMinBps,envelope.kdMaxBps,"previousKdBps");
  if(typeof input.criticalIncident!=="boolean"||typeof input.evidenceEligible!=="boolean")throw new Error("INVALID_ADAPTIVE_PID_BOOLEAN");

  const activeRegime=regime(envelope,input);
  const factors:Record<Regime,[number,number,number]>={NORMAL:[10_000,10_000,10_000],VOLATILE:[7_000,3_000,15_000],LIQUIDITY_STRESS:[6_000,0,15_000],EVIDENCE_UNCERTAIN:[0,0,0],BLACK_SWAN:[0,0,0]};
  const [kpFactor,kiFactor,kdFactor]=factors[activeRegime];
  const desired={
    kpBps:clamp(Math.trunc(config.pid.kpBps*kpFactor/10_000),envelope.kpMinBps,envelope.kpMaxBps),
    kiBps:clamp(Math.trunc(config.pid.kiBps*kiFactor/10_000),envelope.kiMinBps,envelope.kiMaxBps),
    kdBps:clamp(Math.trunc(config.pid.kdBps*kdFactor/10_000),envelope.kdMinBps,envelope.kdMaxBps)
  };
  const gains={kpBps:moveToward(input.previousGains.kpBps,desired.kpBps,envelope.maxGainStepBps),kiBps:moveToward(input.previousGains.kiBps,desired.kiBps,envelope.maxGainStepBps),kdBps:moveToward(input.previousGains.kdBps,desired.kdBps,envelope.maxGainStepBps)};
  const errorBps=config.targetAllocationBps-input.observedAllocationBps;
  const rawDerivativeBpsPerDay=Math.trunc((errorBps-input.previousErrorBps)*86_400_000/input.deltaTimeMs);
  const filteredDerivativeBpsPerDay=Math.trunc((envelope.derivativeFilterBps*input.previousFilteredDerivativeBpsPerDay+(10_000-envelope.derivativeFilterBps)*rawDerivativeBpsPerDay)/10_000);
  const hold=activeRegime==="BLACK_SWAN"||activeRegime==="EVIDENCE_UNCERTAIN";
  const withinDeadband=Math.abs(errorBps)<=config.pid.deadbandBps;
  const integralDelta=Math.trunc(errorBps*input.deltaTimeMs/86_400_000);
  const tentativeIntegral=signedClamp(input.integralErrorBps+integralDelta,config.pid.integralLimitBps);
  const initialRaw=withinDeadband||hold?0:Math.trunc((gains.kpBps*errorBps+gains.kiBps*tentativeIntegral+gains.kdBps*filteredDerivativeBpsPerDay)/10_000);
  const outputLimit=Math.min(envelope.maxOutputBps,config.pid.maxAdjustmentBps,config.riskLimits.maxSingleAdjustmentBps);
  const saturated=Math.abs(initialRaw)>outputLimit;
  const integralFrozen=hold||saturated||gains.kiBps===0;
  const integralBps=integralFrozen?input.integralErrorBps:tentativeIntegral;
  const rawOutputBps=withinDeadband||hold?0:Math.trunc((gains.kpBps*errorBps+gains.kiBps*integralBps+gains.kdBps*filteredDerivativeBpsPerDay)/10_000);
  const amplitudeBounded=signedClamp(rawOutputBps,outputLimit);
  const rateBounded=clamp(amplitudeBounded,input.previousOutputBps-envelope.maxOutputRateBps,input.previousOutputBps+envelope.maxOutputRateBps);
  const boundedOutputBps=hold?0:rateBounded;
  const safetyState=activeRegime==="BLACK_SWAN"?"EMERGENCY_HOLD":activeRegime==="EVIDENCE_UNCERTAIN"?"HOLD":activeRegime==="NORMAL"?"ACTIVE":"DEFENSIVE";
  return {schemaVersion:"treasury.adaptive-pid-advisory.v1",riskRegime:activeRegime,safetyState,targetAllocationBps:config.targetAllocationBps,observedAllocationBps:input.observedAllocationBps,errorBps,deltaTimeMs:input.deltaTimeMs,gains:{...gains,desired},components:{proportionalBps:Math.trunc(gains.kpBps*errorBps/10_000),integralBps:Math.trunc(gains.kiBps*integralBps/10_000),derivativeBps:Math.trunc(gains.kdBps*filteredDerivativeBpsPerDay/10_000)},controllerState:{integralErrorBps:integralBps,rawDerivativeBpsPerDay,filteredDerivativeBpsPerDay,integralFrozen,withinDeadband,saturated},rawOutputBps,boundedOutputBps,suggestedAdjustmentBps:boundedOutputBps,blockers:hold?[activeRegime==="BLACK_SWAN"?"BLACK_SWAN_HOLD":"EVIDENCE_CONFIDENCE_INSUFFICIENT"]:[],evidenceConfidenceBps:input.evidenceConfidenceBps,governedEnvelopeApplied:true,advisoryOnly:true,assetExecutionAuthorized:false} as const;
}
