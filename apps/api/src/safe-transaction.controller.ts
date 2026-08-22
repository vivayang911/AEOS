import { Body,Controller,Get,Param,Post,UseGuards } from "@nestjs/common";
import { ObserveSafeTransactionDto } from "./safe-transaction.dto";
import { SafeTransactionService } from "./safe-transaction.service";
import { AuthContext } from "./auth.service";
import { IdempotentCommand } from "./idempotency.interceptor";
import { activeOrganizationId, CurrentAuth, ORGANIZATION_ROLES, RequireRoles, SessionGuard } from "./session.guard";

@Controller()
@UseGuards(SessionGuard)
@RequireRoles(...ORGANIZATION_ROLES)
export class SafeTransactionController{
  constructor(private readonly service:SafeTransactionService){}
  @Get("safe-transaction-adapter")configuration(){return this.service.configuration()}
  @Post("execution-preflights/:id/safe-observations") @RequireRoles("ADMIN","OPERATOR") @IdempotentCommand() observe(@CurrentAuth()auth:AuthContext,@Param("id")id:string,@Body()body:ObserveSafeTransactionDto){return this.service.observe(activeOrganizationId(auth),id,body)}
  @Get("execution-preflights/:id/safe-observations")list(@CurrentAuth()auth:AuthContext,@Param("id")id:string){return this.service.list(activeOrganizationId(auth),id)}
  @Get("execution-preflights/:id/reconciliation-attempts")reconciliationAttempts(@CurrentAuth()auth:AuthContext,@Param("id")id:string){return this.service.reconciliationAttempts(activeOrganizationId(auth),id)}
  @Get("safe-observations/:id")get(@CurrentAuth()auth:AuthContext,@Param("id")id:string){return this.service.get(activeOrganizationId(auth),id)}
}
