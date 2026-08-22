import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { buildErrorLog, HttpErrorFilter } from "./http-error.filter";

const host=(request:any,response:any)=>({switchToHttp:()=>({getRequest:()=>request,getResponse:()=>response})}) as any;
describe("HttpErrorFilter request trace",()=>{
  it("uses only the trusted normalized request ID in error envelopes",()=>{
    const response={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn()};const request:any={headers:{"x-request-id":"bad\nforged"}};
    new HttpErrorFilter().catch(new BadRequestException("invalid input"),host(request,response));
    expect(request.requestId).toMatch(/^req_[a-f0-9]{32}$/);expect(response.setHeader).toHaveBeenCalledWith("X-Request-ID",request.requestId);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({error:expect.objectContaining({request_id:request.requestId,code:"VALIDATION_FAILED"})}));
  });
  it("builds an internal-error log without message, stack, body, or credentials",()=>{
    const error=Object.assign(new Error("postgresql://user:secret@host and signature=0xprivate"),{stack:"secret stack"});const record=buildErrorLog("trace_1",500,error);
    expect(record).toEqual({event:"http.request.failed",request_id:"trace_1",status_code:500,error_type:"Error",sensitive_fields_logged:false});expect(JSON.stringify(record)).not.toContain("secret");
  });
  it("preserves a bounded domain code for a retryable service rejection",()=>{
    const response={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn()};const request:any={headers:{}};
    new HttpErrorFilter().catch(new ServiceUnavailableException({message:"Capacity is exhausted",code:"COCKPIT_STREAM_CAPACITY_EXHAUSTED",retryable:true,retryAfterSeconds:1}),host(request,response));
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({error:expect.objectContaining({code:"COCKPIT_STREAM_CAPACITY_EXHAUSTED",message:"Capacity is exhausted",request_id:request.requestId})}));
  });
});
