import { ArrayMaxSize,ArrayMinSize,IsArray,IsIn,IsISO8601,IsInt,IsOptional,IsString,Length,Max,Min } from "class-validator";
import { Type } from "class-transformer";
export class CreateKnowledgeSourceDto{
  @IsOptional() @IsString() organizationId!:string;
  @IsString() @Length(1,200) sourceKey!:string;
  @IsIn(["VERIFIED_EVIDENCE","GOVERNANCE","PROTOCOL","DECISION_MEMORY"]) partition!:"VERIFIED_EVIDENCE"|"GOVERNANCE"|"PROTOCOL"|"DECISION_MEMORY";
  @IsString() @Length(1,300) title!:string;
  @IsString() @Length(1,100000) content!:string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(6) @IsIn(["ADMIN","TREASURY_COMMITTEE","REVIEWER","OPERATOR","AUDITOR","GUARDIAN"],{each:true}) aclRoles!:string[];
  @IsOptional() @IsISO8601() validFrom?:string;
  @IsOptional() @IsISO8601() validUntil?:string;
  @IsOptional() @IsString() supersedesSourceId?:string;
  @IsOptional() @IsString() conflictGroupId?:string;
}
export class ApproveKnowledgeSourceDto{@IsOptional() @IsString() actorId!:string;@IsString() @Length(3,1000) rationale!:string}
export class TransitionKnowledgeSourceDto{@IsOptional() @IsString() actorId!:string;@IsIn(["RETIRED","DELETION_REQUESTED","DELETED"]) status!:"RETIRED"|"DELETION_REQUESTED"|"DELETED";@IsString() @Length(3,1000) rationale!:string}
export class SearchKnowledgeDto{@IsOptional() @IsString() organizationId!:string;@IsString() @Length(1,2000) query!:string;@IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(20) limit=8}
export class CreateMemoryCandidateDto{
  @IsOptional() @IsString() organizationId!:string;
  @IsIn(["WORKING","EVENT","ENTERPRISE"]) memoryType!:"WORKING"|"EVENT"|"ENTERPRISE";
  @IsString() @Length(1,10000) content!:string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsString({each:true}) sourceRefs!:string[];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(6) @IsIn(["ADMIN","TREASURY_COMMITTEE","REVIEWER","OPERATOR","AUDITOR","GUARDIAN"],{each:true}) aclRoles!:string[];
  @IsOptional() @IsISO8601() validUntil?:string;
  @IsOptional() @IsString() supersedesMemoryId?:string;
}
export class TransitionMemoryDto{@IsOptional() @IsString() actorId!:string;@IsIn(["APPROVED","REJECTED","EXPIRED","SUPERSEDED","DELETION_REQUESTED","DELETED"]) status!:string;@IsString() @Length(3,1000) rationale!:string}
