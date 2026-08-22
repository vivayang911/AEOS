import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ActivatePolicyDto, ComparePoliciesDto, CreateAdaptivePidSnapshotDto, CreateEvidenceBoundAdaptivePidSnapshotDto, CreatePolicyDto, SimulatePolicyDto } from "./policy.dto";
import { PolicyService } from "./policy.service";
import { AuthContext } from "./auth.service";
import { activeOrganizationId, CurrentAuth, ORGANIZATION_ROLES, RequireRoles, SessionGuard } from "./session.guard";
import { IdempotentCommand } from "./idempotency.interceptor";

@Controller("policies")
@UseGuards(SessionGuard)
@RequireRoles(...ORGANIZATION_ROLES)
export class PolicyController {
  constructor(private readonly service: PolicyService) {}
  @Get() list(@CurrentAuth()auth:AuthContext) { return this.service.list(activeOrganizationId(auth)); }
  @Post() @RequireRoles("ADMIN","TREASURY_COMMITTEE") @IdempotentCommand() create(@CurrentAuth()auth:AuthContext, @Body() body: CreatePolicyDto) { return this.service.createDraft(activeOrganizationId(auth), body); }
  @Get(":id") get(@CurrentAuth()auth:AuthContext, @Param("id") id: string) { return this.service.get(activeOrganizationId(auth), id); }
  @Post(":id/activate") @RequireRoles("ADMIN","TREASURY_COMMITTEE") @IdempotentCommand() activate(@CurrentAuth()auth:AuthContext, @Param("id") id: string, @Body() _body: ActivatePolicyDto) { return this.service.activate(activeOrganizationId(auth), id, auth.userId); }
  @Get(":id/simulations") simulations(@CurrentAuth()auth:AuthContext, @Param("id") id: string) { return this.service.listSimulations(activeOrganizationId(auth), id); }
  @Post(":id/simulations") @RequireRoles("ADMIN","TREASURY_COMMITTEE","REVIEWER") @IdempotentCommand() simulate(@CurrentAuth()auth:AuthContext, @Param("id") id: string, @Body() body: SimulatePolicyDto) { return this.service.simulate(activeOrganizationId(auth), id, body); }
  @Get(":id/adaptive-pid-snapshots") adaptivePidSnapshots(@CurrentAuth()auth:AuthContext,@Param("id")id:string){return this.service.listAdaptivePidSnapshots(activeOrganizationId(auth),id);}
  @Get(":id/adaptive-pid-snapshots/:snapshotId") adaptivePidSnapshotById(@CurrentAuth()auth:AuthContext,@Param("id")id:string,@Param("snapshotId")snapshotId:string){return this.service.getAdaptivePidSnapshot(activeOrganizationId(auth),id,snapshotId);}
  @Post(":id/adaptive-pid-snapshots") @RequireRoles("ADMIN","TREASURY_COMMITTEE","REVIEWER") @IdempotentCommand() adaptivePidSnapshot(@CurrentAuth()auth:AuthContext,@Param("id")id:string,@Body()body:CreateAdaptivePidSnapshotDto){return this.service.createAdaptivePidSnapshot(activeOrganizationId(auth),id,body,auth.userId);}
  @Post(":id/evidence-bound-adaptive-pid-snapshots") @RequireRoles("ADMIN","TREASURY_COMMITTEE","REVIEWER") @IdempotentCommand() evidenceBoundAdaptivePidSnapshot(@CurrentAuth()auth:AuthContext,@Param("id")id:string,@Body()body:CreateEvidenceBoundAdaptivePidSnapshotDto){return this.service.createEvidenceBoundAdaptivePidSnapshot(activeOrganizationId(auth),id,body,auth.userId);}
}

@Controller("policy-scenario-comparisons")
@UseGuards(SessionGuard)
@RequireRoles(...ORGANIZATION_ROLES)
export class PolicyScenarioComparisonController {
  constructor(private readonly service: PolicyService) {}
  @Get() list(@CurrentAuth() auth: AuthContext) { return this.service.listScenarioComparisons(activeOrganizationId(auth)); }
  @Post() @RequireRoles("ADMIN","TREASURY_COMMITTEE","REVIEWER") @IdempotentCommand() create(@CurrentAuth() auth: AuthContext, @Body() body: ComparePoliciesDto) { return this.service.compareScenarios(activeOrganizationId(auth), body.policyVersionIds, auth.userId); }
  @Get(":id") get(@CurrentAuth() auth: AuthContext, @Param("id") id: string) { return this.service.getScenarioComparison(activeOrganizationId(auth), id); }
}
