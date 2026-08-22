import { Injectable,Logger,OnApplicationBootstrap,OnModuleDestroy,NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "./database.service";
import { alertAdapterConfiguration,alertContentHash,ALERT_CONSUMER,ALERT_RULE_VERSION,classifyAlert } from "./alert-engine";
import { hashValue } from "./decision-engine";
import { OutboxEnvelope } from "./outbox-publisher";
import { currentRequestId } from "./request-trace";
import { ANOMALY_PRODUCER_VERSION, GOVERNANCE_UNKNOWN_AFTER_SECONDS } from "./anomaly-scanner-engine";

const makeId=(prefix:string)=>`${prefix}_${randomUUID().replaceAll("-","")}`;
const safeCode=(error:unknown)=>(error instanceof Error?error.constructor.name:"UnknownError").replace(/[^A-Za-z0-9_]/g,"_").slice(0,60).toUpperCase();

@Injectable()
export class AlertService implements OnApplicationBootstrap,OnModuleDestroy{
  private readonly logger=new Logger(AlertService.name);private timer?:NodeJS.Timeout;private running=false;
  constructor(private readonly db:DatabaseService){}
  configuration(){return {...alertAdapterConfiguration(),periodicProducers:{version:ANOMALY_PRODUCER_VERSION,source:"IMMUTABLE_STORED_STATE",governanceUnknownAfterSeconds:GOVERNANCE_UNKNOWN_AFTER_SECONDS,networkAccess:false,assetExecutionAuthorized:false}}}
  onApplicationBootstrap(){if((process.env.ALERT_AUTO_PROCESS??"true").toLowerCase()==="false")return;const parsed=Number(process.env.ALERT_PROCESS_INTERVAL_MS??5000);const interval=Number.isSafeInteger(parsed)&&parsed>=1000&&parsed<=60000?parsed:5000;this.timer=setInterval(()=>void this.tick(),interval);this.timer.unref();void this.tick()}
  onModuleDestroy(){if(this.timer)clearInterval(this.timer)}
  private async tick(){if(this.running)return;this.running=true;try{for(let count=0;count<20;count++){if((await this.processOnce()).status==="IDLE")break}}catch(error){this.logger.warn(JSON.stringify({event:"alerts.processing.failed",error_type:safeCode(error),sensitive_fields_logged:false}))}finally{this.running=false}}
  async processOnce(organizationId?:string){
    return this.db.runAsSystem(()=>this.db.transaction(async(client)=>{
      const claimed=await client.query(`WITH candidate AS (
        SELECT event_id,consumer FROM outbox_deliveries WHERE consumer=$1 AND ($3::text IS NULL OR organization_id=$3) AND attempts<3 AND (status IN('PENDING','FAILED') OR (status='CLAIMED' AND lease_expires_at<=now()))
        ORDER BY created_at,event_id FOR UPDATE SKIP LOCKED LIMIT 1)
        UPDATE outbox_deliveries d SET status='CLAIMED',attempts=d.attempts+1,claim_token=$2,lease_expires_at=now()+interval '30 seconds',last_error_code=NULL,updated_at=now()
        FROM candidate c WHERE d.event_id=c.event_id AND d.consumer=c.consumer RETURNING d.*`,[ALERT_CONSUMER,makeId("claim"),organizationId??null]);
      if(!claimed.rowCount)return {status:"IDLE" as const};
      const delivery=claimed.rows[0];const found=await client.query("SELECT * FROM outbox_events WHERE id=$1 AND organization_id=$2",[delivery.event_id,delivery.organization_id]);
      if(!found.rowCount)throw new Error("OutboxEventMissing");const event=found.rows[0] as OutboxEnvelope;const classification=classifyAlert(event);let alertId:string|null=null;
      if(classification){alertId=`alert_${event.id}`;const details={schemaVersion:ALERT_RULE_VERSION,sourceObject:event.object_ref,ruleDetails:classification.details,requestId:event.request_id,assetExecutionAuthorized:false};await client.query("INSERT INTO alerts(id,organization_id,source_event_id,source_event_type,severity,category,rule_version,title_code,details,content_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(organization_id,source_event_id) DO NOTHING",[alertId,event.organization_id,event.id,event.type,classification.severity,classification.category,ALERT_RULE_VERSION,classification.titleCode,details,alertContentHash(event,classification)]);}
      const receiptHash=hashValue({consumer:ALERT_CONSUMER,eventId:event.id,alertId,classification:classification?.titleCode??null});const providerRequestId=`internal_${receiptHash.slice(2,34)}`;
      await client.query("INSERT INTO outbox_consumer_receipts(id,event_id,organization_id,consumer,provider_request_id,receipt_hash) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(event_id,consumer) DO NOTHING",[makeId("outreceipt"),event.id,event.organization_id,ALERT_CONSUMER,providerRequestId,receiptHash]);
      await client.query("UPDATE outbox_deliveries SET status='DELIVERED',claim_token=NULL,lease_expires_at=NULL,provider_request_id=$3,receipt_hash=$4,delivered_at=now(),updated_at=now() WHERE event_id=$1 AND consumer=$2",[event.id,ALERT_CONSUMER,providerRequestId,receiptHash]);
      return {status:"DELIVERED" as const,eventId:event.id,alertId,assetExecutionAuthorized:false};
    }));
  }
  async list(org:string,severity?:string,acknowledged?:boolean,limit=50){const result=await this.db.query(`SELECT a.*,EXISTS(SELECT 1 FROM alert_acknowledgements aa WHERE aa.organization_id=a.organization_id AND aa.alert_id=a.id) AS acknowledged,(SELECT max(acknowledged_at) FROM alert_acknowledgements aa WHERE aa.organization_id=a.organization_id AND aa.alert_id=a.id) AS acknowledged_at FROM alerts a WHERE a.organization_id=$1 AND ($2::text IS NULL OR a.severity=$2) AND ($3::boolean IS NULL OR EXISTS(SELECT 1 FROM alert_acknowledgements aa WHERE aa.organization_id=a.organization_id AND aa.alert_id=a.id)=$3) ORDER BY a.created_at DESC,a.id DESC LIMIT $4`,[org,severity??null,acknowledged??null,limit]);return {items:result.rows.map(row=>this.map(row)),notificationAdapter:this.configuration(),assetExecutionAuthorized:false}}
  async get(org:string,id:string){const result=await this.db.query("SELECT * FROM alerts WHERE organization_id=$1 AND id=$2",[org,id]);if(!result.rowCount)throw new NotFoundException("Alert not found");const acknowledgements=await this.db.query("SELECT id,acknowledged_by,note,note_hash,request_id,acknowledged_at FROM alert_acknowledgements WHERE organization_id=$1 AND alert_id=$2 ORDER BY acknowledged_at,id",[org,id]);return {...this.map(result.rows[0]),acknowledgements:acknowledgements.rows,notificationAdapter:this.configuration(),assetExecutionAuthorized:false}}
  async acknowledge(org:string,id:string,userId:string,note?:string){return this.db.transaction(async(client)=>{const found=await client.query("SELECT * FROM alerts WHERE organization_id=$1 AND id=$2",[org,id]);if(!found.rowCount)throw new NotFoundException("Alert not found");const ackId=makeId("alertack");const normalizedNote=note?.trim()||null;const noteHash=hashValue({alertId:id,userId,note:normalizedNote});await client.query("INSERT INTO alert_acknowledgements(id,alert_id,organization_id,acknowledged_by,note,note_hash,request_id) VALUES($1,$2,$3,$4,$5,$6,$7)",[ackId,id,org,userId,normalizedNote,noteHash,currentRequestId()]);const data={acknowledgementId:ackId,alertContentHash:found.rows[0].content_hash,noteHash,assetExecutionAuthorized:false};const payload={eventType:"alert.acknowledged",organizationId:org,objectType:"alert",objectId:id,data};await client.query("INSERT INTO audit_events(id,organization_id,event_type,actor,action,object_type,object_id,data,payload_hash) VALUES($1,$2,'alert.acknowledged',$3,'alert.acknowledged','alert',$4,$5,$6)",[makeId("audit"),org,{type:"human",id:userId},id,data,hashValue(payload)]);return {id:ackId,alertId:id,organizationId:org,acknowledgedBy:userId,note:normalizedNote,noteHash,assetExecutionAuthorized:false}})}
  private map(row:any){return {id:row.id,organizationId:row.organization_id,sourceEventId:row.source_event_id,sourceEventType:row.source_event_type,severity:row.severity,category:row.category,ruleVersion:row.rule_version,titleCode:row.title_code,details:row.details,contentHash:row.content_hash,notificationAdapter:row.notification_adapter,acknowledged:Boolean(row.acknowledged),acknowledgedAt:row.acknowledged_at?new Date(row.acknowledged_at).toISOString():null,createdAt:new Date(row.created_at).toISOString(),assetExecutionAuthorized:false}}
}
