import { classifySafeReadFailure,recoverySummary } from "./execution-recovery-engine";

describe("execution recovery guardrails",()=>{
  it("retries transient provider failures with bounded deterministic backoff",()=>{expect(classifySafeReadFailure(new Error("SAFE_TRANSACTION_SERVICE_503"),1)).toEqual({outcome:"FAILED_RETRYABLE",errorCode:"SAFE_TRANSACTION_SERVICE_503",retryAfterSeconds:30,retryPermitted:true});expect(classifySafeReadFailure(new Error("SAFE_TRANSACTION_SERVICE_503"),20).retryAfterSeconds).toBe(900)});
  it("never retries a frozen handoff mismatch",()=>expect(classifySafeReadFailure(new Error("SAFE_HANDOFF_MISMATCH"),1)).toEqual({outcome:"FAILED_TERMINAL",errorCode:"SAFE_HANDOFF_MISMATCH",retryAfterSeconds:0,retryPermitted:false}));
  it("redacts unknown provider messages",()=>expect(classifySafeReadFailure(new Error("secret https://rpc/?key=abc"),1).errorCode).toBe("SAFE_TRANSACTION_READ_FAILED"));
  it("keeps recovery manual and without submission authority",()=>expect(recoverySummary({outcome:"FAILED_RETRYABLE",error_code:"SAFE_TRANSACTION_SERVICE_503",retry_after_seconds:30,attempted_at:"2026-08-06T00:00:00.000Z"})).toEqual(expect.objectContaining({retryPermitted:true,nextRetryAt:"2026-08-06T00:00:30.000Z",manualOnly:true,automaticSubmission:false,assetExecutionAuthorized:false})));
});
