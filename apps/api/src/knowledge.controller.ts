import { Body,Controller,Param,Post,UseGuards } from "@nestjs/common";
import { AuthContext } from "./auth.service";
import { IdempotentCommand } from "./idempotency.interceptor";
import { ApproveKnowledgeSourceDto,CreateKnowledgeSourceDto,CreateMemoryCandidateDto,SearchKnowledgeDto,TransitionKnowledgeSourceDto,TransitionMemoryDto } from "./knowledge.dto";
import { KnowledgeService } from "./knowledge.service";
import { activeOrganizationId,CurrentAuth,ORGANIZATION_ROLES,RequireRoles,SessionGuard } from "./session.guard";
@Controller("knowledge") @UseGuards(SessionGuard) @RequireRoles(...ORGANIZATION_ROLES)
export class KnowledgeController{
  constructor(private readonly knowledge:KnowledgeService){}
  @Post("sources") @RequireRoles("ADMIN","REVIEWER") @IdempotentCommand() createSource(@CurrentAuth()auth:AuthContext,@Body()body:CreateKnowledgeSourceDto){return this.knowledge.createSource(activeOrganizationId(auth),auth.userId,body)}
  @Post("sources/:id/approve") @RequireRoles("ADMIN","REVIEWER") @IdempotentCommand() approve(@CurrentAuth()auth:AuthContext,@Param("id")id:string,@Body()body:ApproveKnowledgeSourceDto){return this.knowledge.approveSource(activeOrganizationId(auth),id,{...body,actorId:auth.userId})}
  @Post("sources/:id/transition") @RequireRoles("ADMIN","REVIEWER") @IdempotentCommand() transition(@CurrentAuth()auth:AuthContext,@Param("id")id:string,@Body()body:TransitionKnowledgeSourceDto){return this.knowledge.transitionSource(activeOrganizationId(auth),id,{...body,actorId:auth.userId})}
  @Post("search") search(@CurrentAuth()auth:AuthContext,@Body()body:SearchKnowledgeDto){return this.knowledge.search(activeOrganizationId(auth),auth.role!,body)}
  @Post("memory/candidates") @RequireRoles("ADMIN","TREASURY_COMMITTEE","REVIEWER") @IdempotentCommand() memory(@CurrentAuth()auth:AuthContext,@Body()body:CreateMemoryCandidateDto){return this.knowledge.createMemory(activeOrganizationId(auth),auth.userId,body)}
  @Post("memory/:id/transition") @RequireRoles("ADMIN","REVIEWER") @IdempotentCommand() transitionMemory(@CurrentAuth()auth:AuthContext,@Param("id")id:string,@Body()body:TransitionMemoryDto){return this.knowledge.transitionMemory(activeOrganizationId(auth),id,{...body,actorId:auth.userId})}
}
