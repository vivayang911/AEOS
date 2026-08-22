import { BadRequestException, CallHandler, ConflictException, ExecutionContext, Injectable, NestInterceptor, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { randomUUID } from "node:crypto";
import { catchError, from, Observable, of, switchMap, throwError } from "rxjs";
import { DatabaseService } from "./database.service";
import { hashValue } from "./decision-engine";

export const IDEMPOTENT_COMMAND="aeos.idempotent.command";
export const IdempotentCommand=()=>SetMetadata(IDEMPOTENT_COMMAND,true);

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor{
  constructor(private readonly db:DatabaseService,private readonly reflector:Reflector){}
  async intercept(context:ExecutionContext,next:CallHandler):Promise<Observable<unknown>>{
    const enabled=this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_COMMAND,[context.getHandler(),context.getClass()]);if(!enabled)return next.handle();
    const request=context.switchToHttp().getRequest();const response=context.switchToHttp().getResponse();const key=request.headers["idempotency-key"];
    if(key===undefined)return next.handle();if(typeof key!=="string"||key.trim().length<1||key.trim().length>200)throw new BadRequestException("Idempotency-Key must be between 1 and 200 characters");
    const auth=request.auth;if(!auth?.userId)throw new ConflictException("Authenticated idempotency scope is unavailable");const normalizedKey=key.trim();const scopeId=auth.activeOrganizationId??`user:${auth.userId}`;const route=`${request.method}:${String(request.originalUrl??request.url).split("?")[0]}`;const requestHash=hashValue({route,body:request.body??null});const id=`idem_${randomUUID().replaceAll("-","")}`;const expiresAt=new Date(Date.now()+24*60*60*1000);
    const inserted=await this.db.query("INSERT INTO idempotency_records(id,scope_id,organization_id,user_id,idempotency_key,route,request_hash,state,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,'IN_PROGRESS',$8) ON CONFLICT(scope_id,idempotency_key) DO UPDATE SET id=EXCLUDED.id,organization_id=EXCLUDED.organization_id,user_id=EXCLUDED.user_id,route=EXCLUDED.route,request_hash=EXCLUDED.request_hash,state='IN_PROGRESS',response_status=NULL,response_body=NULL,expires_at=EXCLUDED.expires_at,created_at=now(),completed_at=NULL WHERE idempotency_records.expires_at<=now() RETURNING id",[id,scopeId,auth.activeOrganizationId,auth.userId,normalizedKey,route,requestHash,expiresAt]);
    if(!inserted.rowCount){const found=await this.db.query("SELECT * FROM idempotency_records WHERE scope_id=$1 AND idempotency_key=$2",[scopeId,normalizedKey]);const record=found.rows[0];if(!record||record.route!==route||record.request_hash!==requestHash)throw new ConflictException("Idempotency-Key was already used with different input");if(record.state==="COMPLETED"){response.status(record.response_status);response.setHeader("Idempotency-Replayed","true");return of(record.response_body)}throw new ConflictException("An identical command is already in progress")}
    return next.handle().pipe(
      switchMap((body)=>from(this.db.query("UPDATE idempotency_records SET state='COMPLETED',response_status=$2,response_body=$3,completed_at=now() WHERE id=$1 AND request_hash=$4",[id,response.statusCode,body??null,requestHash])).pipe(switchMap(()=>of(body)))),
      catchError((error)=>from(this.db.query("DELETE FROM idempotency_records WHERE id=$1 AND state='IN_PROGRESS' AND request_hash=$2",[id,requestHash])).pipe(catchError(()=>of(null)),switchMap(()=>throwError(()=>error))))
    );
  }
}
