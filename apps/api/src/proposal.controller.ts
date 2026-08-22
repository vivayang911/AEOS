import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CreateProposalDto } from "./proposal.dto";
import { ProposalService } from "./proposal.service";
import { AuthContext } from "./auth.service";
import { activeOrganizationId, CurrentAuth, ORGANIZATION_ROLES, RequireRoles, SessionGuard } from "./session.guard";
import { IdempotentCommand } from "./idempotency.interceptor";

@Controller("proposals")
@UseGuards(SessionGuard)
@RequireRoles(...ORGANIZATION_ROLES)
export class ProposalController {
  constructor(private readonly service: ProposalService) {}
  @Get() list(@CurrentAuth()auth:AuthContext) { return this.service.list(activeOrganizationId(auth)); }
  @Post() @RequireRoles("ADMIN","TREASURY_COMMITTEE") @IdempotentCommand() create(@CurrentAuth()auth:AuthContext, @Body() body: CreateProposalDto) { return this.service.create(activeOrganizationId(auth), {...body,createdBy:auth.userId}); }
  @Get(":id") get(@CurrentAuth()auth:AuthContext, @Param("id") id: string) { return this.service.get(activeOrganizationId(auth), id); }
}
