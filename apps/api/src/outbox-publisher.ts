import { Injectable, Inject, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "./database.service";
import { hashValue } from "./decision-engine";

export const OUTBOX_PUBLISHER=Symbol("OUTBOX_PUBLISHER");
export const OUTBOX_CONSUMER="mock-observer-v1";
export interface OutboxEnvelope {id:string;organization_id:string;type:string;occurred_at:Date|string;actor:unknown;object_ref:unknown;data:unknown;schema_version:string;request_id:string|null;content_hash:string}
export interface OutboxPublisher {
  readonly consumer:string;
  configuration():Record<string,unknown>;
  publish(event:Readonly<OutboxEnvelope>,idempotencyKey:string):Promise<{providerRequestId:string;receiptHash:string}>;
}
const deepFreeze=<T>(value:T):T=>{if(value&&typeof value==="object"){Object.freeze(value);for(const child of Object.values(value as Record<string,unknown>))deepFreeze(child)}return value};
const frozenPublisherEnvelope=(event:OutboxEnvelope)=>deepFreeze(JSON.parse(JSON.stringify(event)) as OutboxEnvelope);
const safeCode=(error:unknown)=>(error instanceof Error?error.constructor.name:"UnknownError").replace(/[^A-Za-z0-9_]/g,"_").slice(0,60).toUpperCase();
const boundedTimeout=async<T>(work:Promise<T>,milliseconds:number)=>{let timer:NodeJS.Timeout|undefined;try{return await Promise.race([work,new Promise<T>((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error("PublisherTimeout")),milliseconds)})])}finally{if(timer)clearTimeout(timer)}};

export class MockOutboxPublisher implements OutboxPublisher{
  readonly consumer=OUTBOX_CONSUMER;
  configuration(){return {mode:"mock",consumer:this.consumer,networkAccess:false,credentialsRequired:false,idempotencyKeyRequired:true,signerCapability:false,broadcastCapability:false,assetExecutionAuthorized:false}}
  async publish(event:Readonly<OutboxEnvelope>,idempotencyKey:string){
    if(idempotencyKey!==event.id)throw new Error("IdempotencyKeyMismatch");const receiptHash=hashValue({consumer:this.consumer,eventId:event.id,contentHash:event.content_hash});return {providerRequestId:`mock_${receiptHash.slice(2,34)}`,receiptHash};
  }
}
export function createOutboxPublisherFromEnvironment():OutboxPublisher{const mode=(process.env.OUTBOX_PUBLISHER??"mock").toLowerCase();if(mode==="mock")return new MockOutboxPublisher();throw new Error(`Unsupported OUTBOX_PUBLISHER: ${mode}`)}

@Injectable()
export class OutboxDispatcherService implements OnApplicationBootstrap,OnModuleDestroy{
  private readonly logger=new Logger(OutboxDispatcherService.name);private timer?:NodeJS.Timeout;private running=false;
  constructor(private readonly db:DatabaseService,@Inject(OUTBOX_PUBLISHER)private readonly publisher:OutboxPublisher){}
  configuration(){return this.publisher.configuration()}
  onApplicationBootstrap(){if((process.env.OUTBOX_AUTO_DISPATCH??"true").toLowerCase()==="false")return;const parsed=Number(process.env.OUTBOX_DISPATCH_INTERVAL_MS??5000);const interval=Number.isSafeInteger(parsed)&&parsed>=1000&&parsed<=60000?parsed:5000;this.timer=setInterval(()=>void this.tick(),interval);this.timer.unref();void this.tick()}
  onModuleDestroy(){if(this.timer)clearInterval(this.timer)}
  private async tick(){if(this.running)return;this.running=true;try{for(let count=0;count<10;count++){const result=await this.dispatchOnce();if(result.status==="IDLE")break}}catch(error){this.logger.warn(JSON.stringify({event:"outbox.dispatch.failed",error_type:safeCode(error),sensitive_fields_logged:false}))}finally{this.running=false}}
  async dispatchOnce(){
    const claimToken=`claim_${randomUUID().replaceAll("-","")}`;
    const claimed=await this.db.runAsSystem(()=>this.db.transaction(async(client)=>{
      const delivery=await client.query(`WITH candidate AS (
        SELECT event_id,consumer FROM outbox_deliveries WHERE consumer=$1 AND attempts<3 AND (status IN('PENDING','FAILED') OR (status='CLAIMED' AND lease_expires_at<=now()))
        ORDER BY created_at,event_id FOR UPDATE SKIP LOCKED LIMIT 1)
        UPDATE outbox_deliveries d SET status='CLAIMED',attempts=d.attempts+1,claim_token=$2,lease_expires_at=now()+interval '30 seconds',last_error_code=NULL,updated_at=now()
        FROM candidate c WHERE d.event_id=c.event_id AND d.consumer=c.consumer RETURNING d.*`,[this.publisher.consumer,claimToken]);
      if(!delivery.rowCount)return null;const event=await client.query("SELECT * FROM outbox_events WHERE id=$1 AND organization_id=$2",[delivery.rows[0].event_id,delivery.rows[0].organization_id]);return {delivery:delivery.rows[0],event:event.rows[0] as OutboxEnvelope};
    }));
    if(!claimed)return {status:"IDLE" as const};
    try{
      const published=await boundedTimeout(this.publisher.publish(frozenPublisherEnvelope(claimed.event),claimed.event.id),5000);
      return this.db.runAsSystem(()=>this.db.transaction(async(client)=>{
        const locked=await client.query("SELECT * FROM outbox_deliveries WHERE event_id=$1 AND consumer=$2 FOR UPDATE",[claimed.event.id,this.publisher.consumer]);const current=locked.rows[0];
        if(!current||current.claim_token!==claimToken)return {status:"LOST_LEASE" as const,eventId:claimed.event.id};
        const receiptId=`outreceipt_${randomUUID().replaceAll("-","")}`;
        await client.query("INSERT INTO outbox_consumer_receipts(id,event_id,organization_id,consumer,provider_request_id,receipt_hash) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(event_id,consumer) DO NOTHING",[receiptId,claimed.event.id,claimed.event.organization_id,this.publisher.consumer,published.providerRequestId,published.receiptHash]);
        await client.query("UPDATE outbox_deliveries SET status='DELIVERED',claim_token=NULL,lease_expires_at=NULL,provider_request_id=$3,receipt_hash=$4,delivered_at=now(),updated_at=now() WHERE event_id=$1 AND consumer=$2 AND claim_token=$5",[claimed.event.id,this.publisher.consumer,published.providerRequestId,published.receiptHash,claimToken]);
        return {status:"DELIVERED" as const,eventId:claimed.event.id,attempts:current.attempts,assetExecutionAuthorized:false};
      }));
    }catch(error){const errorCode=safeCode(error);await this.db.runAsSystem(()=>this.db.query("UPDATE outbox_deliveries SET status='FAILED',claim_token=NULL,lease_expires_at=NULL,last_error_code=$3,updated_at=now() WHERE event_id=$1 AND consumer=$2 AND claim_token=$4",[claimed.event.id,this.publisher.consumer,errorCode,claimToken]));return {status:"FAILED" as const,eventId:claimed.event.id,errorCode,retryable:claimed.delivery.attempts<3,assetExecutionAuthorized:false}}
  }
}
