import { hashValue } from "./decision-engine";

export const AUDIT_EXPORT_SCHEMA_VERSION="audit.export.v1";
export const AUDIT_EXPORT_MAX_EVENTS=1000;
export interface AuditExportFilters{eventType:string|null;from:string|null;to:string|null}
export interface AuditEventRow{id:string;event_type:string;actor:unknown;object_type:string;object_id:string;data:unknown;payload_hash:string;schema_version:string;request_id:string|null;created_at:Date|string}

const iso=(value:Date|string)=>new Date(value).toISOString();
export function normalizeAuditExportFilters(input:{eventType?:string;from?:string;to?:string}):AuditExportFilters{
  return {eventType:input.eventType?.trim()||null,from:input.from?new Date(input.from).toISOString():null,to:input.to?new Date(input.to).toISOString():null};
}
export function auditEventSnapshot(row:AuditEventRow){return {id:row.id,type:row.event_type,occurredAt:iso(row.created_at),actor:row.actor,objectRef:{type:row.object_type,id:row.object_id},data:row.data,payloadHash:row.payload_hash,schemaVersion:row.schema_version,requestId:row.request_id}}
export function buildAuditExportManifest(organizationId:string,filters:AuditExportFilters,rows:AuditEventRow[]){
  const events=[...rows].sort((a,b)=>iso(a.created_at).localeCompare(iso(b.created_at))||a.id.localeCompare(b.id)).map(auditEventSnapshot);return {schemaVersion:AUDIT_EXPORT_SCHEMA_VERSION,organizationId,filters,ordering:"occurred_at_asc,id_asc",eventCount:events.length,events,assetExecutionAuthorized:false};
}
export const auditExportManifestHash=(manifest:unknown)=>hashValue(manifest);
export const verifyAuditExportManifest=(manifest:unknown,expectedHash:string)=>auditExportManifestHash(manifest)===expectedHash;
