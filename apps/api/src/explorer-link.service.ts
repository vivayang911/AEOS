import { Injectable,NotFoundException } from "@nestjs/common";
import { DatabaseService } from "./database.service";
import { ExplorerConfiguration,projectExplorerLinks } from "./explorer-link-engine";
@Injectable()
export class ExplorerLinkService{
  constructor(private readonly db:DatabaseService){}
  async configuration(org:string):Promise<ExplorerConfiguration|null>{const result=await this.db.query("SELECT version,content_hash,config FROM organization_configuration_versions WHERE organization_id=$1 ORDER BY version DESC LIMIT 1",[org]);if(!result.rowCount)return null;const row=result.rows[0];const chainId=Number(row.config?.chainId);const blockExplorerUrl=row.config?.blockExplorerUrl;return Number.isSafeInteger(chainId)&&chainId>0&&typeof blockExplorerUrl==="string"?{chainId,blockExplorerUrl,version:Number(row.version),contentHash:row.content_hash}:null}
  projection(config:ExplorerConfiguration|null,event:{data:unknown}){return {configured:Boolean(config),configurationVersion:config?.version??null,configurationContentHash:config?.contentHash??null,chainId:config?.chainId??null,links:projectExplorerLinks(config,event),generatedFromTrustedConfiguration:Boolean(config),networkAccess:false,assetExecutionAuthorized:false}}
  async forEvent(org:string,eventId:string){const [config,event]=await Promise.all([this.configuration(org),this.db.query<{id:string;data:unknown}>("SELECT id,data FROM audit_events WHERE organization_id=$1 AND id=$2",[org,eventId])]);if(!event.rowCount)throw new NotFoundException("Audit event not found");return {eventId,...this.projection(config,event.rows[0])}}
}
