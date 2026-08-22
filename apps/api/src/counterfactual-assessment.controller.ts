import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthContext } from "./auth.service";
import { CreateCounterfactualAssessmentDto } from "./counterfactual-assessment.dto";
import { CounterfactualAssessmentService } from "./counterfactual-assessment.service";
import { IdempotentCommand } from "./idempotency.interceptor";
import { activeOrganizationId, CurrentAuth, ORGANIZATION_ROLES, RequireRoles, SessionGuard } from "./session.guard";

@Controller("treasury-outcomes/:outcomeId/counterfactual-assessments")
@UseGuards(SessionGuard)
@RequireRoles(...ORGANIZATION_ROLES)
export class CounterfactualAssessmentController {
  constructor(private readonly service: CounterfactualAssessmentService) {}
  @Get() list(@CurrentAuth() auth: AuthContext, @Param("outcomeId") outcomeId: string) { return this.service.list(activeOrganizationId(auth), outcomeId); }
  @Get(":assessmentId") get(@CurrentAuth() auth: AuthContext, @Param("outcomeId") outcomeId: string, @Param("assessmentId") assessmentId: string) { return this.service.get(activeOrganizationId(auth), outcomeId, assessmentId); }
  @Post() @RequireRoles("ADMIN", "TREASURY_COMMITTEE", "REVIEWER") @IdempotentCommand()
  create(@CurrentAuth() auth: AuthContext, @Param("outcomeId") outcomeId: string, @Body() body: CreateCounterfactualAssessmentDto) { return this.service.create(activeOrganizationId(auth), outcomeId, body, auth.userId); }
}
