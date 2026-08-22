import { CallHandler, ConflictException, ExecutionContext } from "@nestjs/common";
import { lastValueFrom, of } from "rxjs";
import { IdempotencyInterceptor } from "./idempotency.interceptor";
import { hashValue } from "./decision-engine";

const request={method:"POST",originalUrl:"/api/v1/proposals",headers:{"idempotency-key":"command-1"},body:{title:"Treasury action"},auth:{userId:"user_1",activeOrganizationId:"org_1"}};
const makeContext=(response:any)=>({switchToHttp:()=>({getRequest:()=>request,getResponse:()=>response}),getHandler:()=>function handler(){},getClass:()=>class Controller{}}) as unknown as ExecutionContext;

describe("IdempotencyInterceptor",()=>{
  it("stores a completed command response for deterministic replay",async()=>{
    const db={query:jest.fn().mockResolvedValueOnce({rowCount:1,rows:[{id:"idem_1"}]}).mockResolvedValueOnce({rowCount:1,rows:[]})} as any;
    const reflector={getAllAndOverride:jest.fn().mockReturnValue(true)} as any;
    const response={statusCode:201,status:jest.fn(),setHeader:jest.fn()};
    const next={handle:jest.fn().mockReturnValue(of({id:"proposal_1"}))} as CallHandler;
    const output=await lastValueFrom(await new IdempotencyInterceptor(db,reflector).intercept(makeContext(response),next));
    expect(output).toEqual({id:"proposal_1"});
    expect(db.query.mock.calls[1][0]).toContain("state='COMPLETED'");
    expect(db.query.mock.calls[1][1][2]).toEqual({id:"proposal_1"});
  });

  it("replays the stored response without invoking the command",async()=>{
    const route="POST:/api/v1/proposals";const requestHash=hashValue({route,body:request.body});
    const db={query:jest.fn().mockResolvedValueOnce({rowCount:0,rows:[]}).mockResolvedValueOnce({rowCount:1,rows:[{route,request_hash:requestHash,state:"COMPLETED",response_status:202,response_body:{id:"proposal_1"}}]})} as any;
    const reflector={getAllAndOverride:jest.fn().mockReturnValue(true)} as any;
    const response={statusCode:200,status:jest.fn(),setHeader:jest.fn()};
    const next={handle:jest.fn()} as unknown as CallHandler;
    const interceptor=new IdempotencyInterceptor(db,reflector);
    const output=await lastValueFrom(await interceptor.intercept(makeContext(response),next));
    expect(output).toEqual({id:"proposal_1"});
    expect(response.status).toHaveBeenCalledWith(202);
    expect(response.setHeader).toHaveBeenCalledWith("Idempotency-Replayed","true");
    expect(next.handle).not.toHaveBeenCalled();
  });

  it("rejects reuse with different command input",async()=>{
    const db={query:jest.fn().mockResolvedValueOnce({rowCount:0,rows:[]}).mockResolvedValueOnce({rowCount:1,rows:[{route:"POST:/api/v1/other",request_hash:"different",state:"COMPLETED"}]})} as any;
    const reflector={getAllAndOverride:jest.fn().mockReturnValue(true)} as any;
    await expect(new IdempotencyInterceptor(db,reflector).intercept(makeContext({}),{handle:jest.fn()} as any)).rejects.toBeInstanceOf(ConflictException);
  });
});
