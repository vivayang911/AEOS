import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AttestcoinService } from "./attestcoin.service";
import { ConfirmEvidenceAnchorDto, CreateAttestcoinJobDto, PrepareEvidenceAnchorDto, SubmitAttestcoinVerificationDto } from "./attestcoin.dto";
import { AuthContext } from "./auth.service";
import { activeOrganizationId, CurrentAuth, ORGANIZATION_ROLES, RequireRoles, SessionGuard } from "./session.guard";
import { IdempotentCommand } from "./idempotency.interceptor";

@Controller("attestcoin")
@UseGuards(SessionGuard)
@RequireRoles(...ORGANIZATION_ROLES)
export class AttestcoinController {
  constructor(private readonly service: AttestcoinService) {}
  @Get("configuration") configuration() { return this.service.configuration(); }
  @Get("health") health(@CurrentAuth() auth:AuthContext) { return this.service.health(activeOrganizationId(auth)); }
  @Get("source-chains") sourceChains(@CurrentAuth() auth:AuthContext) { return this.service.sourceChains(activeOrganizationId(auth)); }
  @Get("proof-jobs") list(@CurrentAuth() auth:AuthContext) { return this.service.list(activeOrganizationId(auth)); }
  @Post("proof-jobs") @RequireRoles("ADMIN","REVIEWER","OPERATOR") @IdempotentCommand() create(@CurrentAuth() auth:AuthContext, @Body() body: CreateAttestcoinJobDto) { return this.service.create(activeOrganizationId(auth), {...body,requesterWallet:auth.walletAddress}); }
  @Get("proof-jobs/:id") get(@CurrentAuth() auth:AuthContext, @Param("id") id: string) { return this.service.get(activeOrganizationId(auth), id); }
  @Post("proof-jobs/:id/proof") @RequireRoles("ADMIN","REVIEWER","OPERATOR") @IdempotentCommand() proof(@CurrentAuth() auth:AuthContext, @Param("id") id: string) { return this.service.requestProof(activeOrganizationId(auth), id); }
  @Post("proof-jobs/:id/verification-request") @RequireRoles("ADMIN","REVIEWER","OPERATOR") @IdempotentCommand() prepare(@CurrentAuth() auth:AuthContext, @Param("id") id: string) { return this.service.prepareVerification(activeOrganizationId(auth), id); }
  @Post("proof-jobs/:id/evidence-anchor-request") @RequireRoles("ADMIN","REVIEWER","OPERATOR") @IdempotentCommand() prepareEvidenceAnchor(@CurrentAuth() auth:AuthContext, @Param("id") id: string, @Body() body:PrepareEvidenceAnchorDto) { return this.service.prepareEvidenceAnchor(activeOrganizationId(auth),id,body.decisionId); }
  @Post("evidence-anchor-handoffs/:id/confirmation") @RequireRoles("ADMIN","REVIEWER","OPERATOR") @IdempotentCommand() confirmEvidenceAnchor(@CurrentAuth() auth:AuthContext,@Param("id") id:string,@Body() body:ConfirmEvidenceAnchorDto){return this.service.confirmEvidenceAnchor(activeOrganizationId(auth),id,body.transactionHash)}
  @Post("proof-jobs/:id/verification-confirmation") @RequireRoles("ADMIN","REVIEWER","OPERATOR") @IdempotentCommand() confirm(@CurrentAuth() auth:AuthContext, @Param("id") id: string, @Body() body: SubmitAttestcoinVerificationDto) { return this.service.confirmVerification(activeOrganizationId(auth), id, body.verificationTransactionHash); }
}
