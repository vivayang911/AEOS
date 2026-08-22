import { IsBoolean,IsIn,IsInt,IsOptional,IsString,Length,Max,Min } from "class-validator";
import { Transform,Type } from "class-transformer";
export class AlertQueryDto{@IsOptional() @IsIn(["MEDIUM","HIGH","CRITICAL"]) severity?:string;@IsOptional() @Transform(({value})=>value==="true"?true:value==="false"?false:value) @IsBoolean() acknowledged?:boolean;@IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=50}
export class AcknowledgeAlertDto{@IsOptional() @IsString() @Length(1,500) note?:string}
