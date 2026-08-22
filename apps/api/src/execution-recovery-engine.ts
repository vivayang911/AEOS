export type ReconciliationOutcome="SUCCEEDED"|"FAILED_RETRYABLE"|"FAILED_TERMINAL"|"REJECTED";
export type ReconciliationFailure={outcome:"FAILED_RETRYABLE"|"FAILED_TERMINAL";errorCode:string;retryAfterSeconds:number;retryPermitted:boolean};

const terminal=new Set([
  "SAFE_ADDRESS_MISMATCH","SAFE_TX_HASH_MISMATCH","SAFE_HANDOFF_MISMATCH","SAFE_CONFIRMATION_POLICY_INVALID",
  "SAFE_CHAIN_MISMATCH","SAFE_EXECUTION_TARGET_MISMATCH","SAFE_EXECUTION_AFTER_PREFLIGHT_EXPIRY",
  "SAFE_EXECUTION_FAILURE_EVENT","SAFE_EXECUTION_SUCCESS_EVENT_MISSING","GUARD_AUTHORIZATION_EVENT_MISSING",
  "SAFE_EXECUTION_RECEIPT_FAILED","SAFE_EXECUTION_REORG_DETECTED","SAFE_OBSERVATION_TERMINAL"
]);
const retryableExact=new Set([
  "SAFE_TRANSACTION_READ_ADAPTER_NOT_CONFIGURED","SAFE_EXECUTION_TX_HASH_MISSING","SAFE_EXECUTION_NOT_CONFIRMED_ONCHAIN",
  "SAFE_EXECUTION_NOT_FINAL","SAFE_EXECUTION_BLOCK_MISSING"
]);

export function classifySafeReadFailure(error:unknown,attempt:number):ReconciliationFailure{
  const raw=error instanceof Error?error.message:"";let errorCode="SAFE_TRANSACTION_READ_FAILED";let retryable=true;
  if(terminal.has(raw)){errorCode=raw;retryable=false}
  else if(retryableExact.has(raw))errorCode=raw;
  else if(/^SAFE_TRANSACTION_SERVICE_(429|5\d\d)$/.test(raw))errorCode=raw;
  else if(/^SAFE_TRANSACTION_SERVICE_4\d\d$/.test(raw)){errorCode=raw;retryable=false}
  else if(raw==="This operation was aborted"||raw==="The operation was aborted")errorCode="SAFE_TRANSACTION_READ_TIMEOUT";
  const retryAfterSeconds=retryable?Math.min(900,30*(2**Math.max(0,Math.min(attempt-1,5)))):0;
  return {outcome:retryable?"FAILED_RETRYABLE":"FAILED_TERMINAL",errorCode,retryAfterSeconds,retryPermitted:retryable};
}

export function recoverySummary(latest:any|null){
  if(!latest)return {latestOutcome:null,retryPermitted:false,retryAfterSeconds:0,nextRetryAt:null,manualOnly:true,automaticSubmission:false,assetExecutionAuthorized:false};
  const retryPermitted=latest.outcome==="FAILED_RETRYABLE";const attemptedAt=new Date(latest.attempted_at);
  return {latestOutcome:latest.outcome,latestErrorCode:latest.error_code??null,retryPermitted,retryAfterSeconds:retryPermitted?latest.retry_after_seconds:0,nextRetryAt:retryPermitted?new Date(attemptedAt.getTime()+latest.retry_after_seconds*1000).toISOString():null,manualOnly:true,automaticSubmission:false,assetExecutionAuthorized:false};
}
