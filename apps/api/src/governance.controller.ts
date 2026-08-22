import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { MockGovernanceObservationDto } from "./governance.dto";
import { GovernanceService } from "./governance.service";
import { AuthContext } from "./auth.service";
import { IdempotentCommand } from "./idempotency.interceptor";
import { activeOrganizationId, CurrentAuth, ORGANIZATION_ROLES, RequireRoles, SessionGuard } from "./session.guard";

@Controller()
@UseGuards(SessionGuard)
@RequireRoles(...ORGANIZATION_ROLES)
export class GovernanceController {
  constructor(private readonly service: GovernanceService) {}
  @Get("governance-adapter") configuration() { return this.service.configuration(); }
  @Get("proposals/:id/observations") list(@CurrentAuth()auth:AuthContext, @Param("id") id: string) { return this.service.list(activeOrganizationId(auth), id); }
  @Post("proposals/:id/sync-governor") @RequireRoles("ADMIN","OPERATOR") @IdempotentCommand() sync(@CurrentAuth()auth:AuthContext, @Param("id") id: string) { return this.service.sync(activeOrganizationId(auth), id); }
  @Post("proposals/:id/mock-observations") @RequireRoles("ADMIN","OPERATOR") @IdempotentCommand() observe(@CurrentAuth()auth:AuthContext, @Param("id") id: string, @Body() body: MockGovernanceObservationDto) { return this.service.observeMock(activeOrganizationId(auth), id, body); }
}
