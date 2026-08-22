import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CreateExecutionPreflightDto } from "./execution.dto";
import { ExecutionService } from "./execution.service";
import { AuthContext } from "./auth.service";
import { IdempotentCommand } from "./idempotency.interceptor";
import { activeOrganizationId, CurrentAuth, ORGANIZATION_ROLES, RequireRoles, SessionGuard } from "./session.guard";

@Controller()
@UseGuards(SessionGuard)
@RequireRoles(...ORGANIZATION_ROLES)
export class ExecutionController {
  constructor(private readonly service: ExecutionService) {}
  @Get("treasury-guard-adapter") configuration() { return this.service.configuration(); }
  @Post("proposals/:id/execution-preflights") @RequireRoles("ADMIN","TREASURY_COMMITTEE","OPERATOR") @IdempotentCommand() preflight(@CurrentAuth()auth:AuthContext,@Param("id") id:string,@Body() body:CreateExecutionPreflightDto){return this.service.preflight(activeOrganizationId(auth),id,{...body,actorId:auth.userId})}
  @Get("proposals/:id/execution-preflights") list(@CurrentAuth()auth:AuthContext,@Param("id") id:string){return this.service.list(activeOrganizationId(auth),id)}
  @Get("execution-preflights/:id") get(@CurrentAuth()auth:AuthContext,@Param("id") id:string){return this.service.get(activeOrganizationId(auth),id)}
}
