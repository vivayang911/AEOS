import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, Length } from "class-validator";
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
