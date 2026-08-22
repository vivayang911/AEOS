import { Type } from "class-transformer";
import { IsBoolean, IsEthereumAddress, IsIn, IsInt, IsISO8601, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";

export class MockGovernanceObservationDto {
  @IsIn(["REVIEW","PUBLISHED","PENDING","ACTIVE","CANCELED","SUCCEEDED","DEFEATED","QUEUED","EXECUTED","EXPIRED"]) state!: "REVIEW"|"PUBLISHED"|"PENDING"|"ACTIVE"|"CANCELED"|"SUCCEEDED"|"DEFEATED"|"QUEUED"|"EXECUTED"|"EXPIRED";
  @Type(() => Number) @IsInt() @IsIn([11155111,102031]) chainId!: number;
  @IsEthereumAddress() governor!: string;
  @IsString() @Length(1,200) externalProposalId!: string;
  @Type(() => Number) @IsInt() @Min(0) blockNumber!: number;
  @Matches(/^0x[0-9a-fA-F]{64}$/) blockHash!: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(10000) confirmations!: number;
  @IsISO8601() observedAt!: string;
  @IsOptional() @IsBoolean() isReorg?: boolean;
  @IsOptional() @IsString() reorgOfObservationId?: string;
  @IsOptional() @Matches(/^[0-9]{1,78}$/) currentTimepoint?: string;
  @IsOptional() @Matches(/^[0-9]{1,78}$/) voteStart?: string;
  @IsOptional() @Matches(/^[0-9]{1,78}$/) voteEnd?: string;
  @IsOptional() @Matches(/^[0-9]{1,78}$/) quorum?: string;
  @IsOptional() @Matches(/^[0-9]{1,78}$/) againstVotes?: string;
  @IsOptional() @Matches(/^[0-9]{1,78}$/) forVotes?: string;
  @IsOptional() @Matches(/^[0-9]{1,78}$/) abstainVotes?: string;
  @IsOptional() @IsString() @Length(1,200) clockMode?: string;
}
