import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { ADVISORY_PROVIDER, AdvisoryProvider } from "./advisory-provider";
import { ORGANIZATION_ROLES, RequireRoles, SessionGuard } from "./session.guard";

@Controller("advisory-provider")
@UseGuards(SessionGuard)
@RequireRoles(...ORGANIZATION_ROLES)
export class AdvisoryProviderController {
  constructor(@Inject(ADVISORY_PROVIDER) private readonly provider:AdvisoryProvider){}
  @Get() info(){return {providerId:this.provider.providerId,modelVersion:this.provider.modelVersion,kind:this.provider.kind,configured:true,credentialsRequired:this.provider.credentialsRequired===true,networkAccess:this.provider.networkAccess===true,allowedTools:["evidence.read","workflow.coordinate","opportunity.discover","policy.read","calculator.deterministic","risk.evaluate","compliance.check","committee.read","simulation.read"],assetExecutionTools:[]}}
}
