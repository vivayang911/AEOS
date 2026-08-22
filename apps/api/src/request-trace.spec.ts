import { EventEmitter } from "node:events";
import { buildAccessLog, currentRequestId, normalizeRequestId, RequestTraceMiddleware } from "./request-trace";

describe("request tracing",()=>{
  it("accepts a bounded caller ID and replaces unsafe log-injection input",()=>{
    expect(normalizeRequestId("client.trace-1:retry")).toBe("client.trace-1:retry");
    expect(normalizeRequestId("bad\nforged-log")).toMatch(/^req_[a-f0-9]{32}$/);
    expect(normalizeRequestId("x".repeat(101))).toMatch(/^req_[a-f0-9]{32}$/);
  });
  it("builds a query-free structured access record with no sensitive fields",()=>{
    const record=buildAccessLog({requestId:"req_1",method:"POST",originalUrl:"/api/v1/auth/verify?signature=secret",headers:{cookie:"secret"},body:{signature:"secret"}},201,4.6);
    expect(record).toEqual({event:"http.request.completed",request_id:"req_1",method:"POST",route:"/api/v1/auth/verify",status_code:201,duration_ms:5,sensitive_fields_logged:false});
    expect(JSON.stringify(record)).not.toContain("secret");
  });
  it("returns the same request ID in context and the response header",()=>{
    const response=Object.assign(new EventEmitter(),{statusCode:200,setHeader:jest.fn()});const request={headers:{"x-request-id":"trace_1"},method:"GET",url:"/health/live"};let observed:string|undefined;
    new RequestTraceMiddleware().use(request,response,()=>{observed=currentRequestId()});
    expect(observed).toBe("trace_1");expect(request).toHaveProperty("requestId","trace_1");expect(response.setHeader).toHaveBeenCalledWith("X-Request-ID","trace_1");
  });
});
