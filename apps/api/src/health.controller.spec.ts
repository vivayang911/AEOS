import { ServiceUnavailableException,UnauthorizedException } from "@nestjs/common";
import { HealthController } from "./health.controller";

describe("HealthController",()=>{
  const oldToken=process.env.METRICS_TOKEN;afterEach(()=>{if(oldToken===undefined)delete process.env.METRICS_TOKEN;else process.env.METRICS_TOKEN=oldToken});
  it("returns liveness without checking dependencies",()=>{const service={liveness:()=>({status:"live"})} as any;expect(new HealthController(service).live()).toEqual({status:"live"})});
  it("returns 503 for failed readiness",async()=>{const service={readiness:async()=>({status:"not_ready",checks:{database:false}})} as any;await expect(new HealthController(service).ready()).rejects.toBeInstanceOf(ServiceUnavailableException)});
  it("keeps metrics disabled unless a token is configured",async()=>{delete process.env.METRICS_TOKEN;await expect(new HealthController({} as any).metrics()).rejects.toBeInstanceOf(ServiceUnavailableException)});
  it("requires the exact bearer token",async()=>{process.env.METRICS_TOKEN="metrics-secret";await expect(new HealthController({} as any).metrics("Bearer wrong")).rejects.toBeInstanceOf(UnauthorizedException)});
});
