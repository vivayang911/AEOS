import { ArrayMaxSize,ArrayMinSize,IsArray,IsIn,IsISO8601,IsOptional,IsString,Length } from "class-validator";

export type OutcomeMemoryReviewMode="HUMAN_COMMITTEE"|"HUMAN_COMMITTEE_AND_DAO";
export type OutcomeMemoryReviewOutcome="APPROVE"|"REJECT";

export class CreateOutcomeMemoryCandidateDto{
  @IsString() treasuryOutcomeId!:string;
  @IsString() counterfactualAssessmentId!:string;
  @IsIn(["HUMAN_COMMITTEE","HUMAN_COMMITTEE_AND_DAO"]) reviewMode!:OutcomeMemoryReviewMode;
  @IsString() @Length(10,5000) lesson!:string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsString({each:true}) invalidationConditions!:string[];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(6) @IsIn(["ADMIN","TREASURY_COMMITTEE","REVIEWER","OPERATOR","AUDITOR","GUARDIAN"],{each:true}) aclRoles!:string[];
  @IsOptional() @IsISO8601() validUntil?:string;
}

export class ReviewOutcomeMemoryCandidateDto{
  @IsIn(["APPROVE","REJECT"]) outcome!:OutcomeMemoryReviewOutcome;
  @IsString() @Length(3,2000) rationale!:string;
}

export class ConfirmOutcomeMemoryDaoDto{@IsString() proposalId!:string}
export class PromoteOutcomeMemoryCandidateDto{@IsString() @Length(3,2000) rationale!:string}
export class SupersedeOutcomeMemoryCandidateDto{
  @IsString() replacementCandidateId!:string;
  @IsString() @Length(3,2000) rationale!:string;
}
