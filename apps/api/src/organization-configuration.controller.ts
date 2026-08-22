import { Body,Controller,Get,Param,Post,UseGuards } from "@nestjs/common";
import { AuthContext } from "./auth.service";
import { ActivateOrganizationConfigurationDto,PrepareOrganizationConfigurationDto } from "./organization-configuration.dto";
import { OrganizationConfigurationService } from "./organization-configuration.service";
import { CurrentAuth,RequireRoles,SessionGuard } from "./session.guard";
import { IdempotentCommand } from "./idempotency.interceptor";

@Controller("organization-configuration")
@UseGuards(SessionGuard)
@RequireRoles("ADMIN")
export class OrganizationConfigurationController{
  constructor(private readonly service:OrganizationConfigurationService){}
  @Get("adapter")adapter(){return this.service.configuration()}
  @Get()list(@CurrentAuth()auth:AuthContext){return this.service.list(auth)}
  @Get("current")current(@CurrentAuth()auth:AuthContext){return this.service.current(auth)}
  @Post("prepare") @IdempotentCommand() prepare(@CurrentAuth()auth:AuthContext,@Body()body:PrepareOrganizationConfigurationDto){return this.service.prepare(auth,body)}
  @Post("requests/:id/activate") @IdempotentCommand() activate(@CurrentAuth()auth:AuthContext,@Param("id")id:string,@Body()body:ActivateOrganizationConfigurationDto){return this.service.activate(auth,id,body.message,body.signature)}
}
