import { HttpException, HttpStatus } from "@nestjs/common";
import { DatabaseService } from "./database.service";
import { hashSecret } from "./auth-engine";

export async function consumeDatabaseRateLimit(db:DatabaseService,subject:string,action:string,limit:number,windowSeconds:number){
  const windowMs=windowSeconds*1000;const bucketStart=new Date(Math.floor(Date.now()/windowMs)*windowMs);const expiresAt=new Date(bucketStart.getTime()+windowMs*2);const keyHash=hashSecret(`${action}:${subject}`);
  const result=await db.query<{count:number}>("WITH expired AS (DELETE FROM request_rate_limits WHERE expires_at<=now()), consumed AS (INSERT INTO request_rate_limits(key_hash,bucket_start,count,expires_at) VALUES($1,$2,1,$3) ON CONFLICT(key_hash,bucket_start) DO UPDATE SET count=request_rate_limits.count+1 RETURNING count) SELECT count FROM consumed",[keyHash,bucketStart,expiresAt]);
  const count=Number(result.rows[0].count);if(count>limit)throw new HttpException({message:"Request rate limit exceeded",code:"RATE_LIMITED",retryAfterSeconds:Math.max(1,Math.ceil((bucketStart.getTime()+windowMs-Date.now())/1000))},HttpStatus.TOO_MANY_REQUESTS);
  return {limit,remaining:Math.max(0,limit-count),windowSeconds};
}
