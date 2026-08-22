import{Body,Controller,Get,Param,Post,UseGuards}from"@nestjs/common";
import{AuthContext}from"./auth.service";
import{IdempotentCommand}from"./idempotency.interceptor";
import{ConfirmOutcomeMemoryDaoDto,CreateOutcomeMemoryCandidateDto,PromoteOutcomeMemoryCandidateDto,ReviewOutcomeMemoryCandidateDto,SupersedeOutcomeMemoryCandidateDto}from"./outcome-memory-candidate.dto";
import{OutcomeMemoryCandidateService}from"./outcome-memory-candidate.service";
import{activeOrganizationId,CurrentAuth,ORGANIZATION_ROLES,RequireRoles,SessionGuard}from"./session.guard";

@Controller("outcome-memory-candidates")@UseGuards(SessionGuard)@RequireRoles(...ORGANIZATION_ROLES)
export class OutcomeMemoryCandidateController{
 constructor(private readonly service:OutcomeMemoryCandidateService){}
 @Post()@RequireRoles("ADMIN","TREASURY_COMMITTEE","REVIEWER")@IdempotentCommand()create(@CurrentAuth()auth:AuthContext,@Body()body:CreateOutcomeMemoryCandidateDto){return this.service.create(activeOrganizationId(auth),auth.userId,body)}
 @Get()list(@CurrentAuth()auth:AuthContext){return this.service.list(activeOrganizationId(auth))}
 @Post("reconcile-expired")@RequireRoles("ADMIN")@IdempotentCommand()reconcileExpired(@CurrentAuth()auth:AuthContext){return this.service.reconcileExpired(activeOrganizationId(auth),auth.userId)}
 @Get(":id")get(@CurrentAuth()auth:AuthContext,@Param("id")id:string){return this.service.get(activeOrganizationId(auth),id)}
 @Post(":id/reviews")@RequireRoles("TREASURY_COMMITTEE","REVIEWER")@IdempotentCommand()review(@CurrentAuth()auth:AuthContext,@Param("id")id:string,@Body()body:ReviewOutcomeMemoryCandidateDto){return this.service.review(activeOrganizationId(auth),id,auth.userId,auth.role!,body.outcome,body.rationale)}
 @Post(":id/dao-confirmation")@RequireRoles("ADMIN","REVIEWER")@IdempotentCommand()confirmDao(@CurrentAuth()auth:AuthContext,@Param("id")id:string,@Body()body:ConfirmOutcomeMemoryDaoDto){return this.service.confirmDao(activeOrganizationId(auth),id,auth.userId,body)}
 @Post(":id/promote")@RequireRoles("ADMIN")@IdempotentCommand()promote(@CurrentAuth()auth:AuthContext,@Param("id")id:string,@Body()body:PromoteOutcomeMemoryCandidateDto){return this.service.promote(activeOrganizationId(auth),id,auth.userId,body)}
 @Post(":id/supersede")@RequireRoles("ADMIN")@IdempotentCommand()supersede(@CurrentAuth()auth:AuthContext,@Param("id")id:string,@Body()body:SupersedeOutcomeMemoryCandidateDto){return this.service.supersede(activeOrganizationId(auth),id,auth.userId,body)}
}
