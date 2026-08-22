import { Controller,Get,UseGuards } from "@nestjs/common";
import { OutboxDispatcherService } from "./outbox-publisher";
import { RequireRoles,SessionGuard } from "./session.guard";
@Controller("outbox-publisher") @UseGuards(SessionGuard) @RequireRoles("ADMIN","AUDITOR")
export class OutboxPublisherController{constructor(private readonly dispatcher:OutboxDispatcherService){}@Get()configuration(){return this.dispatcher.configuration()}}
