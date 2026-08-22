import { Body,Controller,Get,Param,Post,Query,UseGuards } from "@nestjs/common";
import { AlertService } from "./alert.service";
import { AcknowledgeAlertDto,AlertQueryDto } from "./alert.dto";
import { AuthContext } from "./auth.service";
import { activeOrganizationId,CurrentAuth,ORGANIZATION_ROLES,RequireRoles,SessionGuard } from "./session.guard";
import { IdempotentCommand } from "./idempotency.interceptor";
@Controller("alerts") @UseGuards(SessionGuard) @RequireRoles(...ORGANIZATION_ROLES)
export class AlertController{constructor(private readonly alerts:AlertService){}@Get("configuration") @RequireRoles("ADMIN","AUDITOR") configuration(){return this.alerts.configuration()}@Get()list(@CurrentAuth()auth:AuthContext,@Query()query:AlertQueryDto){return this.alerts.list(activeOrganizationId(auth),query.severity,query.acknowledged,query.limit)}@Get(":id")get(@CurrentAuth()auth:AuthContext,@Param("id")id:string){return this.alerts.get(activeOrganizationId(auth),id)}@Post(":id/acknowledgements") @RequireRoles("ADMIN","OPERATOR","GUARDIAN") @IdempotentCommand()acknowledge(@CurrentAuth()auth:AuthContext,@Param("id")id:string,@Body()body:AcknowledgeAlertDto){return this.alerts.acknowledge(activeOrganizationId(auth),id,auth.userId,body.note)}}
