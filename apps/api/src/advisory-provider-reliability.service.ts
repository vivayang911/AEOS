import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "./database.service";
import { AdvisoryProviderRequestError, AdvisoryProviderTimeoutError } from "./advisory-provider";
import { hashValue } from "./decision-engine";
import { currentRequestId } from "./request-trace";

type CircuitState="CLOSED"|"OPEN"|"HALF_OPEN";
type Outcome="SUCCESS"|"TIMEOUT"|"REQUEST_FAILED"|"VALIDATION_FAILED"|"CIRCUIT_OPEN";
const makeId=()=>`advisorycall_${randomUUID().replaceAll("-","")}`;
const safeCode=(error:unknown)=>((error as any)?.code??(error instanceof Error?error.name:"UNKNOWN_ERROR")).toString().replace(/[^A-Z0-9_]/gi,"_").slice(0,80).toUpperCase();

@Injectable()
export class AdvisoryProviderReliabilityService {
  private readonly circuits=new Map<string,{state:CircuitState;failures:number;openUntil:number}>();
  constructor(private readonly db:DatabaseService){}
  configuration(){return{schemaVersion:"advisory.provider-reliability.v1",recommendedTimeoutMilliseconds:15_000,minimumTimeoutMilliseconds:1_000,maximumTimeoutMilliseconds:30_000,circuitFailureThreshold:3,circuitOpenMilliseconds:30_000,promptOrResponseStored:false,assetExecutionAuthorized:false}}
  async execute<T>(organizationId:string,provider:string,modelVersion:string,inputHash:string,timeoutMs:number,work:()=>Promise<T>):Promise<T>{
    if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1_000||timeoutMs>30_000)throw new Error("ADVISORY_TIMEOUT_OUT_OF_RANGE");
    const key=`${organizationId}:${provider}`;const circuit=this.current(key);const before=circuit.state;const started=Date.now();
    if(before==="OPEN"){await this.persist(organizationId,provider,modelVersion,"CIRCUIT_OPEN",before,"OPEN",inputHash,null,timeoutMs,started,"ADVISORY_CIRCUIT_OPEN");throw new ServiceUnavailableException({message:"Advisory Provider circuit is open",code:"ADVISORY_CIRCUIT_OPEN",retryable:true})}
    let timer:NodeJS.Timeout|undefined;
    try{
      const result=await Promise.race([work(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new AdvisoryProviderTimeoutError()),timeoutMs)})]);
      this.circuits.set(key,{state:"CLOSED",failures:0,openUntil:0});
      await this.persist(organizationId,provider,modelVersion,"SUCCESS",before,"CLOSED",inputHash,hashValue(result),timeoutMs,started,null);return result;
    }catch(error){
      const outcome:Outcome=error instanceof AdvisoryProviderTimeoutError?"TIMEOUT":error instanceof BadRequestException?"VALIDATION_FAILED":"REQUEST_FAILED";
      const retryable=outcome==="TIMEOUT"||error instanceof AdvisoryProviderRequestError;
      const failures=retryable?circuit.failures+1:circuit.failures;const opens=retryable&&failures>=3;
      const after:CircuitState=opens?"OPEN":before==="HALF_OPEN"&&retryable?"OPEN":"CLOSED";
      this.circuits.set(key,{state:after,failures,openUntil:after==="OPEN"?Date.now()+30_000:0});
      await this.persist(organizationId,provider,modelVersion,outcome,before,after,inputHash,null,timeoutMs,started,safeCode(error));throw error;
    }finally{if(timer)clearTimeout(timer)}
  }
  private current(key:string){const found=this.circuits.get(key)??{state:"CLOSED" as CircuitState,failures:0,openUntil:0};if(found.state==="OPEN"&&Date.now()>=found.openUntil){found.state="HALF_OPEN";this.circuits.set(key,found)}return found}
  private async persist(org:string,provider:string,model:string,outcome:Outcome,before:CircuitState,after:CircuitState,inputHash:string,outputHash:string|null,timeoutMs:number,started:number,errorCode:string|null){await this.db.query("INSERT INTO advisory_provider_observations(id,organization_id,provider,model_version,outcome,circuit_before,circuit_after,request_id,input_hash,output_hash,timeout_ms,duration_ms,error_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",[makeId(),org,provider,model,outcome,before,after,currentRequestId(),inputHash,outputHash,timeoutMs,Math.max(0,Date.now()-started),errorCode])}
}
