import { Body,Controller,Get,Param,Post,Query,UseGuards } from "@nestjs/common";
import { EvidenceService } from "./evidence.service";
import { EvidenceQueryDto,IngestMockDto,SnapshotDto } from "./evidence.dto";
import { AuthContext } from "./auth.service";
import { activeOrganizationId, CurrentAuth, ORGANIZATION_ROLES, RequireRoles, SessionGuard } from "./session.guard";
import { IdempotentCommand } from "./idempotency.interceptor";
@Controller("evidence") @UseGuards(SessionGuard) @RequireRoles(...ORGANIZATION_ROLES)
export class EvidenceController{
  constructor(private readonly evidence:EvidenceService){}
  @Post("mock-ingest") @RequireRoles("ADMIN","REVIEWER","OPERATOR") @IdempotentCommand() ingest(@CurrentAuth()auth:AuthContext,@Body()body:IngestMockDto){return this.evidence.ingestMock({...body,organizationId:activeOrganizationId(auth)})}
  @Get()list(@CurrentAuth()auth:AuthContext,@Query()query:EvidenceQueryDto){return this.evidence.list(activeOrganizationId(auth),query)}
  @Get("quarantine")quarantine(@CurrentAuth()auth:AuthContext){return this.evidence.listQuarantine(activeOrganizationId(auth))}
  @Get(":id")get(@Param("id")evidenceId:string,@CurrentAuth()auth:AuthContext){return this.evidence.get(activeOrganizationId(auth),evidenceId)}
  @Post("snapshots/create") @RequireRoles("ADMIN","TREASURY_COMMITTEE","REVIEWER") @IdempotentCommand() snapshot(@CurrentAuth()auth:AuthContext,@Body()body:SnapshotDto){return this.evidence.snapshot(activeOrganizationId(auth),body.evidenceIds)}
}
