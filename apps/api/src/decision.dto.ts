import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";
export class CreateDecisionDto {
  @IsOptional() @IsString() organizationId!: string;
  @IsString() @Length(3,2000) objective!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsString({each:true}) evidenceIds!: string[];
  @IsOptional() @IsString() policyVersionId?: string;
}

export class ReviewDecisionDto {
  @IsOptional() @IsString() organizationId!: string;
  @IsOptional() @IsString() @Length(1,200) actorId!: string;
  @IsString() @Length(3,2000) rationale!: string;
  @IsString() @IsIn(["APPROVED","REJECTED"]) outcome!: "APPROVED"|"REJECTED";
}

export class RetryDecisionJobDto {
  @IsOptional() @IsString() organizationId!: string;
  @IsOptional() @IsString() @Length(1,200) actorId!: string;
}

export class DecisionQueryDto {
  @IsOptional() @IsIn(["REVIEW_REQUIRED","APPROVED","REJECTED"]) status?: "REVIEW_REQUIRED"|"APPROVED"|"REJECTED";
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() cursor?: string;
}
