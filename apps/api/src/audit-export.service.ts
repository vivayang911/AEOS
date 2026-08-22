import { BadRequestException,Injectable,NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "./database.service";
import { AUDIT_EXPORT_MAX_EVENTS,AuditEventRow,auditExportManifestHash,buildAuditExportManifest,normalizeAuditExportFilters,verifyAuditExportManifest } from "./audit-export-engine";
import { hashValue } from "./decision-engine";

const makeId=(prefix:string)=>`${prefix}_${randomUUID().replaceAll("-","")}`;
@Injectable()
export class AuditExportService{
  constructor(private readonly db:DatabaseService){}
  async create(org:string,userId:string,input:{eventType?:string;from?:string;to?:string}){
    const filters=normalizeAuditExportFilters(input);if(filters.from&&filters.to&&filters.from>filters.to)throw new BadRequestException("Audit export from must not be after to");
    return this.db.transaction(async client=>{
      const result=await client.query<AuditEventRow>(`SELECT id,event_type,actor,object_type,object_id,data,payload_hash,schema_version,request_id,created_at FROM audit_events WHERE organization_id=$1 AND ($2::text IS NULL OR event_type=$2) AND ($3::timestamptz IS NULL OR created_at>=$3) AND ($4::timestamptz IS NULL OR created_at<=$4) ORDER BY created_at,id LIMIT $5`,[org,filters.eventType,filters.from,filters.to,AUDIT_EXPORT_MAX_EVENTS+1]);
      if(result.rows.length>AUDIT_EXPORT_MAX_EVENTS)throw new BadRequestException(`Audit export exceeds the ${AUDIT_EXPORT_MAX_EVENTS} event limit; narrow the time or type filter`);
      const manifest=buildAuditExportManifest(org,filters,result.rows);const manifestHash=auditExportManifestHash(manifest);const first=result.rows.at(0)?.id??null;const last=result.rows.at(-1)?.id??null;const id=makeId("auditexport");
      const saved=await client.query("INSERT INTO audit_exports(id,organization_id,requested_by,filters,manifest,manifest_hash,event_count,first_event_id,last_event_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(organization_id,manifest_hash) DO NOTHING RETURNING *",[id,org,userId,filters,manifest,manifestHash,result.rows.length,first,last]);
      let row=saved.rows[0];if(!row){row=(await client.query("SELECT * FROM audit_exports WHERE organization_id=$1 AND manifest_hash=$2",[org,manifestHash])).rows[0];return this.map(row)}
      const data={exportId:id,manifestHash,eventCount:result.rows.length,filters,assetExecutionAuthorized:false};const payload={eventType:"audit.export_created",organizationId:org,objectType:"audit_export",objectId:id,data};await client.query("INSERT INTO audit_events(id,organization_id,event_type,actor,action,object_type,object_id,data,payload_hash) VALUES($1,$2,'audit.export_created',$3,'audit.export_created','audit_export',$4,$5,$6)",[makeId("audit"),org,{type:"human",id:userId},id,data,hashValue(payload)]);return this.map(row);
    });
  }
  async list(org:string){const result=await this.db.query("SELECT id,organization_id,requested_by,filters,manifest_hash,event_count,first_event_id,last_event_id,created_at FROM audit_exports WHERE organization_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100",[org]);return {items:result.rows.map(row=>this.map(row,false)),assetExecutionAuthorized:false}}
  async get(org:string,id:string){const result=await this.db.query("SELECT * FROM audit_exports WHERE organization_id=$1 AND id=$2",[org,id]);if(!result.rowCount)throw new NotFoundException("Audit export not found");return this.map(result.rows[0])}
  async verify(org:string,id:string){const found=await this.db.query("SELECT * FROM audit_exports WHERE organization_id=$1 AND id=$2",[org,id]);if(!found.rowCount)throw new NotFoundException("Audit export not found");const row=found.rows[0];const events=Array.isArray(row.manifest?.events)?row.manifest.events:[];const ids=events.map((event:any)=>event.id).filter((value:unknown)=>typeof value==="string");const source=ids.length?await this.db.query<AuditEventRow>("SELECT id,event_type,actor,object_type,object_id,data,payload_hash,schema_version,request_id,created_at FROM audit_events WHERE organization_id=$1 AND id=ANY($2::text[]) ORDER BY created_at,id",[org,ids]):{rows:[] as AuditEventRow[]};const rebuilt=buildAuditExportManifest(org,row.filters,source.rows);const storedManifestValid=verifyAuditExportManifest(row.manifest,row.manifest_hash);const sourceEventsMatch=source.rows.length===row.event_count&&auditExportManifestHash(rebuilt)===row.manifest_hash;return {exportId:id,manifestHash:row.manifest_hash,eventCount:row.event_count,storedManifestValid,sourceEventsMatch,verified:storedManifestValid&&sourceEventsMatch,assetExecutionAuthorized:false}}
  private map(row:any,includeManifest=true){return {id:row.id,organizationId:row.organization_id,requestedBy:row.requested_by,filters:row.filters,manifestHash:row.manifest_hash,eventCount:row.event_count,firstEventId:row.first_event_id,lastEventId:row.last_event_id,...includeManifest?{manifest:row.manifest}:{},createdAt:new Date(row.created_at).toISOString(),assetExecutionAuthorized:false}}
}
