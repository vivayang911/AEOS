import { Body,Controller,Get,Headers,HttpCode,Param,Post,UseGuards } from "@nestjs/common";
import { CreateDecisionDto, RetryDecisionJobDto, ReviewDecisionDto } from "./decision.dto";
import { DecisionService } from "./decision.service";
import { AuthContext } from "./auth.service";
import { activeOrganizationId, CurrentAuth, ORGANIZATION_ROLES, RequireRoles, SessionGuard } from "./session.guard";
import { IdempotentCommand } from "./idempotency.interceptor";
@Controller("decisions")
@UseGuards(SessionGuard)
@RequireRoles(...ORGANIZATION_ROLES)
export class DecisionController {
  constructor(private readonly decisions:DecisionService) {}
  @Post() @HttpCode(202) @RequireRoles("ADMIN","TREASURY_COMMITTEE","REVIEWER") create(@CurrentAuth()auth:AuthContext,@Body() body:CreateDecisionDto,@Headers("idempotency-key") idempotencyKey?:string){return this.decisions.enqueue({...body,organizationId:activeOrganizationId(auth)},idempotencyKey,auth.role!)}
  @Get(":id") get(@Param("id") id:string,@CurrentAuth()auth:AuthContext){return this.decisions.get(activeOrganizationId(auth),id)}
  @Post(":id/review") @RequireRoles("ADMIN","TREASURY_COMMITTEE","REVIEWER") @IdempotentCommand() review(@Param("id") id:string,@CurrentAuth()auth:AuthContext,@Body() body:ReviewDecisionDto){return this.decisions.review(id,{...body,organizationId:activeOrganizationId(auth),actorId:auth.userId})}
}

@Controller("decision-jobs")
@UseGuards(SessionGuard)
@RequireRoles(...ORGANIZATION_ROLES)
export class DecisionJobController {
  constructor(private readonly decisions:DecisionService) {}
  @Get(":id") get(@Param("id") id:string,@CurrentAuth()auth:AuthContext){return this.decisions.getJob(activeOrganizationId(auth),id)}
  @Post(":id/retry") @HttpCode(202) @RequireRoles("ADMIN","TREASURY_COMMITTEE","REVIEWER") @IdempotentCommand() retry(@Param("id") id:string,@CurrentAuth()auth:AuthContext,@Body() _body:RetryDecisionJobDto){return this.decisions.retryJob(id,activeOrganizationId(auth),auth.userId)}
}
