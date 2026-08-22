import { Body,Controller,Get,Param,Post,UseGuards } from "@nestjs/common";
import { AuthContext } from "./auth.service";
import { CreateGovernedSkillDto,GovernedSkillTransitionDto } from "./governed-skill.dto";
import { GovernedSkillService } from "./governed-skill.service";
import { IdempotentCommand } from "./idempotency.interceptor";
import { activeOrganizationId,CurrentAuth,ORGANIZATION_ROLES,RequireRoles,SessionGuard } from "./session.guard";

@Controller("skills") @UseGuards(SessionGuard) @RequireRoles(...ORGANIZATION_ROLES)
export class GovernedSkillController{
  constructor(private readonly skills:GovernedSkillService){}
  @Get() list(@CurrentAuth()auth:AuthContext){return this.skills.list(activeOrganizationId(auth))}
  @Get(":id") get(@CurrentAuth()auth:AuthContext,@Param("id")id:string){return this.skills.get(activeOrganizationId(auth),id)}
  @Post() @RequireRoles("ADMIN","REVIEWER") @IdempotentCommand() create(@CurrentAuth()auth:AuthContext,@Body()body:CreateGovernedSkillDto){return this.skills.create(activeOrganizationId(auth),auth.userId,body)}
  @Post(":id/approve") @RequireRoles("ADMIN","REVIEWER") @IdempotentCommand() approve(@CurrentAuth()auth:AuthContext,@Param("id")id:string,@Body()body:GovernedSkillTransitionDto){return this.skills.approve(activeOrganizationId(auth),id,auth.userId,body.rationale)}
  @Post(":id/retire") @RequireRoles("ADMIN") @IdempotentCommand() retire(@CurrentAuth()auth:AuthContext,@Param("id")id:string,@Body()body:GovernedSkillTransitionDto){return this.skills.retire(activeOrganizationId(auth),id,auth.userId,body.rationale)}
}
