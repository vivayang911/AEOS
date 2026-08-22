import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { normalizeRequestId } from "./request-trace";

export function buildErrorLog(requestId:string,statusCode:number,exception:unknown){return {event:"http.request.failed",request_id:requestId,status_code:statusCode,error_type:exception instanceof Error?exception.constructor.name:"UnknownError",sensitive_fields_logged:false}}
const safeDomainCode=(body:unknown)=>typeof (body as any)?.code==="string"&&/^[A-Z][A-Z0-9_]{2,80}$/.test((body as any).code)?(body as any).code:null;
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger=new Logger(HttpErrorFilter.name);
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const request = host.switchToHttp().getRequest();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : null;
    const message = typeof body === "string" ? body : (body as any)?.message ?? "Internal server error";
    const requestId = normalizeRequestId(request.requestId??request.headers?.["x-request-id"]);request.requestId=requestId;response.setHeader("X-Request-ID",requestId);
    if(!(exception instanceof HttpException))this.logger.error(JSON.stringify(buildErrorLog(requestId,status,exception)));
    const defaultCode=status===429?"RATE_LIMITED":status===401?"AUTH_REQUIRED":status===403?"AUTH_FORBIDDEN":status===404?"NOT_FOUND":status===400?"VALIDATION_FAILED":status===409?"STATE_CONFLICT":status===503?"SERVICE_UNAVAILABLE":"INTERNAL_ERROR";
    const code=safeDomainCode(body)??defaultCode;
    response.status(status).json({ error: { code, message, request_id: requestId, details: typeof body === "object" ? body : undefined } });
  }
}
