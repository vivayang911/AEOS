import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { CreateOrganizationDto } from "./organization.dto";
import { OrganizationService } from "./organization.service";
import { RequireRoles, SessionGuard } from "./session.guard";
import { IdempotentCommand } from "./idempotency.interceptor";

@Controller("organizations")
@UseGuards(SessionGuard)
export class OrganizationController {
  constructor(private readonly organizations: OrganizationService) {}
  @Get() list(@Req() request: any) { return this.organizations.list(request.auth); }
  @Post() @IdempotentCommand() create(@Req() request: any, @Body() body: CreateOrganizationDto) { return this.organizations.create(request.auth, body.name); }
  @Get(":id/memberships") @RequireRoles("ADMIN", "AUDITOR") memberships(@Req() request: any, @Param("id") id: string) { return this.organizations.memberships(request.auth, id); }
}
