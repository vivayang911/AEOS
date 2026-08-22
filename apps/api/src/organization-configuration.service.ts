import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import { DatabaseService } from "./database.service";
import { AuthContext } from "./auth.service";
import { hashSecret, recoverSiweWallet } from "./auth-engine";
import { hashValue } from "./decision-engine";
import { ORGANIZATION_CONFIGURATION_ADAPTER, OrganizationConfigurationAdapter } from "./organization-configuration-adapter";
import { buildOrganizationConfigurationApprovalMessage, normalizeOrganizationConfiguration, organizationConfigurationHash, OrganizationConfigurationInput } from "./organization-configuration-engine";
import { consumeDatabaseRateLimit } from "./rate-limit-engine";

const makeId=(prefix:string)=>`${prefix}_${randomUUID().replaceAll("-","")}`;

@Injectable()
export class OrganizationConfigurationService {
  constructor(private readonly db:DatabaseService,@Inject(ORGANIZATION_CONFIGURATION_ADAPTER)private readonly adapter:OrganizationConfigurationAdapter){}
  configuration(){return this.adapter.configuration()}

  async prepare(auth:AuthContext,input:OrganizationConfigurationInput){
    if(!auth.activeOrganizationId)throw new UnauthorizedException("Select an organization first");
    await consumeDatabaseRateLimit(this.db,`${auth.activeOrganizationId}:${auth.userId}`,"organization.configuration.prepare",10,600);
    let config;try{config=normalizeOrganizationConfiguration(input)}catch(error){throw new BadRequestException(error instanceof Error?error.message:"INVALID_ORGANIZATION_CONFIGURATION")}
    let inspection;try{inspection=await this.adapter.inspect(config)}catch(error){
      const message=error instanceof Error?error.message:"ORGANIZATION_CONFIGURATION_INSPECTION_FAILED";
      if(message.startsWith("ORGANIZATION_CONFIGURATION_")&&!message.includes("RPC_")&&!message.includes("CHAIN_NOT_CONFIRMED")&&!message.includes("SAFE_BLOCK"))throw new BadRequestException(message);
      throw new ServiceUnavailableException("Organization configuration read-only inspection is unavailable");
    }
    const issuedAt=new Date();const expiresAt=new Date(issuedAt.getTime()+5*60*1000);const nonce=randomBytes(16).toString("hex");const contentHash=organizationConfigurationHash(config);
    const message=buildOrganizationConfigurationApprovalMessage({organizationId:auth.activeOrganizationId,walletAddress:auth.walletAddress,contentHash,nonce,issuedAt,expiresAt});
    const requestId=makeId("orgconfigreq");
    await this.db.query("INSERT INTO organization_configuration_requests(id,organization_id,requested_by,config,content_hash,inspection,message_hash,nonce,expires_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",[requestId,auth.activeOrganizationId,auth.userId,config,contentHash,inspection,hashSecret(message),nonce,expiresAt,issuedAt]);
    return {requestId,organizationId:auth.activeOrganizationId,config,contentHash,inspection,message,expiresAt:expiresAt.toISOString(),signatureStored:false,privateKeyAccepted:false,assetExecutionAuthorized:false};
  }

  async activate(auth:AuthContext,requestId:string,message:string,signature:string){
    if(!auth.activeOrganizationId)throw new UnauthorizedException("Select an organization first");
    await consumeDatabaseRateLimit(this.db,`${auth.activeOrganizationId}:${auth.userId}`,"organization.configuration.activate",20,600);
    return this.db.transaction(async(client)=>{
      const found=await client.query("SELECT * FROM organization_configuration_requests WHERE organization_id=$1 AND id=$2 FOR UPDATE",[auth.activeOrganizationId,requestId]);const request=found.rows[0];
      if(!request)throw new NotFoundException("Organization configuration request not found");
      if(request.requested_by!==auth.userId)throw new UnauthorizedException("Configuration request belongs to another administrator");
      if(request.consumed_at)throw new ConflictException("Organization configuration request already consumed");
      if(new Date(request.expires_at).getTime()<=Date.now())throw new ConflictException("Organization configuration request expired");
      if(hashSecret(message)!==request.message_hash)throw new UnauthorizedException("Organization configuration approval message mismatch");
      let recovered:string;try{recovered=recoverSiweWallet(message,signature)}catch{throw new UnauthorizedException("Invalid organization configuration signature")}
      if(recovered!==auth.walletAddress.toLowerCase())throw new UnauthorizedException("Configuration signature does not match the authenticated wallet");
      const consumed=await client.query("UPDATE organization_configuration_requests SET consumed_at=now() WHERE organization_id=$1 AND id=$2 AND consumed_at IS NULL RETURNING id",[auth.activeOrganizationId,requestId]);if(!consumed.rowCount)throw new ConflictException("Organization configuration request already consumed");
      await client.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE",[auth.activeOrganizationId]);
      const next=await client.query<{version:number}>("SELECT coalesce(max(version),0)::int+1 AS version FROM organization_configuration_versions WHERE organization_id=$1",[auth.activeOrganizationId]);
      const previous=await client.query("SELECT content_hash FROM organization_configuration_versions WHERE organization_id=$1 ORDER BY version DESC LIMIT 1",[auth.activeOrganizationId]);
      let saved;try{saved=await client.query("INSERT INTO organization_configuration_versions(id,organization_id,version,config,content_hash,inspection,activated_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",[makeId("orgconfig"),auth.activeOrganizationId,next.rows[0].version,request.config,request.content_hash,request.inspection,auth.userId])}catch(error:any){if(error?.code==="23505")throw new ConflictException("This organization configuration is already versioned");throw error}
      const row=saved.rows[0];const data={version:row.version,contentHash:row.content_hash,previousContentHash:previous.rows[0]?.content_hash??null,inspectionStatus:row.inspection.status,onchainInterfacesVerified:row.inspection.onchainInterfacesVerified,signatureStored:false,assetExecutionAuthorized:false};
      const payload={eventType:"organization.configuration_activated",organizationId:auth.activeOrganizationId,objectType:"organization_configuration",objectId:row.id,data};
      await client.query("INSERT INTO audit_events(id,organization_id,event_type,actor,action,object_type,object_id,data,payload_hash) VALUES($1,$2,'organization.configuration_activated',$3,'organization.configuration_activated','organization_configuration',$4,$5,$6)",[makeId("audit"),auth.activeOrganizationId,{type:"human",id:auth.userId,walletAddress:auth.walletAddress},row.id,data,hashValue(payload)]);
      return {...this.map(row),signatureStored:false,privateKeyAccepted:false,assetExecutionAuthorized:false};
    });
  }

  async list(auth:AuthContext){if(!auth.activeOrganizationId)throw new UnauthorizedException("Select an organization first");const result=await this.db.query("SELECT * FROM organization_configuration_versions WHERE organization_id=$1 ORDER BY version DESC",[auth.activeOrganizationId]);return {items:result.rows.map((row)=>this.map(row))}}
  async current(auth:AuthContext){if(!auth.activeOrganizationId)throw new UnauthorizedException("Select an organization first");const result=await this.db.query("SELECT * FROM organization_configuration_versions WHERE organization_id=$1 ORDER BY version DESC LIMIT 1",[auth.activeOrganizationId]);if(!result.rowCount)throw new NotFoundException("Organization configuration not found");return this.map(result.rows[0])}
  private map(row:any){return {id:row.id,organizationId:row.organization_id,version:row.version,schemaVersion:row.schema_version,config:row.config,contentHash:row.content_hash,inspection:row.inspection,activatedBy:row.activated_by,activatedAt:new Date(row.activated_at).toISOString(),assetExecutionAuthorized:false}}
}
