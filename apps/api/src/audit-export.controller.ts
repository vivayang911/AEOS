import { Body,Controller,Get,Param,Post,UseGuards } from "@nestjs/common";
import { AuditExportService } from "./audit-export.service";
import { CreateAuditExportDto } from "./audit-export.dto";
import { AuthContext } from "./auth.service";
import { activeOrganizationId,CurrentAuth,RequireRoles,SessionGuard } from "./session.guard";
import { IdempotentCommand } from "./idempotency.interceptor";
@Controller("audit-exports") @UseGuards(SessionGuard) @RequireRoles("ADMIN","AUDITOR")
export class AuditExportController{constructor(private readonly exports:AuditExportService){}@Post() @IdempotentCommand()create(@CurrentAuth()auth:AuthContext,@Body()body:CreateAuditExportDto){return this.exports.create(activeOrganizationId(auth),auth.userId,body)}@Get()list(@CurrentAuth()auth:AuthContext){return this.exports.list(activeOrganizationId(auth))}@Get(":id")get(@CurrentAuth()auth:AuthContext,@Param("id")id:string){return this.exports.get(activeOrganizationId(auth),id)}@Get(":id/verify")verify(@CurrentAuth()auth:AuthContext,@Param("id")id:string){return this.exports.verify(activeOrganizationId(auth),id)}}
