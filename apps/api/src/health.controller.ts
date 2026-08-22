import { Controller,Get,Header,Headers,ServiceUnavailableException,UnauthorizedException } from "@nestjs/common";
import { OperationalHealthService } from "./operational-health.service";

@Controller()
export class HealthController{
  constructor(private readonly healthService:OperationalHealthService){}
  @Get("health")health(){return this.healthService.liveness()}
  @Get("health/live")live(){return this.healthService.liveness()}
  @Get("health/ready")async ready(){const result=await this.healthService.readiness();if(result.status!=="ready")throw new ServiceUnavailableException({message:"Service dependencies are not ready",code:"SERVICE_NOT_READY",checks:result.checks});return result}
  @Get("metrics")@Header("Content-Type","text/plain; version=0.0.4; charset=utf-8")async metrics(@Headers("authorization")authorization?:string){const token=process.env.METRICS_TOKEN;if(!token)throw new ServiceUnavailableException({message:"Metrics endpoint is disabled",code:"METRICS_DISABLED"});if(authorization!==`Bearer ${token}`)throw new UnauthorizedException("Metrics authorization failed");try{return this.healthService.renderPrometheus(await this.healthService.metrics())}catch{throw new ServiceUnavailableException({message:"Metrics collection failed",code:"METRICS_COLLECTION_FAILED"})}}
}
