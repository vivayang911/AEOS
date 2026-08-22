import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

interface RequestTraceStore { requestId:string }
const traceStore=new AsyncLocalStorage<RequestTraceStore>();
const acceptedRequestId=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;

export function normalizeRequestId(value:unknown){
  return typeof value==="string"&&acceptedRequestId.test(value)?value:`req_${randomUUID().replaceAll("-","")}`;
}
export function runWithRequestTrace<T>(requestId:string,work:()=>T){return traceStore.run({requestId},work)}
export function currentRequestId(){return traceStore.getStore()?.requestId}

export function buildAccessLog(request:any,statusCode:number,durationMs:number){
  const route=String(request.route?.path??request.originalUrl??request.url??"/").split("?")[0].slice(0,256);
  const method=/^[A-Z]{1,12}$/.test(String(request.method??""))?String(request.method):"UNKNOWN";
  return {event:"http.request.completed",request_id:String(request.requestId),method,route,status_code:Number.isInteger(statusCode)?statusCode:500,duration_ms:Math.max(0,Math.round(durationMs)),sensitive_fields_logged:false};
}

@Injectable()
export class RequestTraceMiddleware implements NestMiddleware{
  private readonly logger=new Logger("HttpAccess");
  use(request:any,response:any,next:()=>void){
    const requestId=normalizeRequestId(request.headers?.["x-request-id"]);request.requestId=requestId;response.setHeader("X-Request-ID",requestId);const started=process.hrtime.bigint();
    response.once("finish",()=>{const durationMs=Number(process.hrtime.bigint()-started)/1_000_000;this.logger.log(JSON.stringify(buildAccessLog(request,response.statusCode,durationMs)))});
    runWithRequestTrace(requestId,next);
  }
}
