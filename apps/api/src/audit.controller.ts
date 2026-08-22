import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { DatabaseService } from "./database.service";
import { AuthContext } from "./auth.service";
import { activeOrganizationId, CurrentAuth, RequireRoles, SessionGuard } from "./session.guard";
import { ExplorerLinkService } from "./explorer-link.service";
class AuditQuery { @IsOptional() @IsString() eventType?: string; @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=50; }
@Controller("audit-events")
@UseGuards(SessionGuard)
@RequireRoles("ADMIN", "AUDITOR")
export class AuditController {
  constructor(private readonly db: DatabaseService,private readonly explorer:ExplorerLinkService) {}
  @Get() async list(@CurrentAuth() auth: AuthContext, @Query() query: AuditQuery) {
    const organizationId=activeOrganizationId(auth);
    const result=await this.db.query<{data:unknown}>("SELECT id,event_type,actor,object_type,object_id,data,payload_hash,schema_version,request_id,created_at FROM audit_events WHERE organization_id=$1 AND ($2::text IS NULL OR event_type=$2) ORDER BY created_at DESC,id DESC LIMIT $3",[organizationId,query.eventType??null,query.limit]);
    const configuration=await this.explorer.configuration(organizationId);return {items:result.rows.map(row=>({...row,explorer_links:this.explorer.projection(configuration,row).links})),explorer_configuration:this.explorer.projection(configuration,{data:{}}),assetExecutionAuthorized:false};
  }
  @Get(":id/explorer-links") async explorerLinks(@CurrentAuth()auth:AuthContext,@Param("id")id:string){return this.explorer.forEvent(activeOrganizationId(auth),id)}
}
