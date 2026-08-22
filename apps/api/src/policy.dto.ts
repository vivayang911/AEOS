import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsObject, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { TreasuryPolicyConfig } from "./policy-engine";

export class CreatePolicyDto { @IsString() @Length(3,200) name!: string; @IsObject() config!: TreasuryPolicyConfig; }
export class ActivatePolicyDto { @IsOptional() @IsString() @Length(1,200) actorId!: string; }
export class ComparePoliciesDto { @IsArray() @ArrayMinSize(2) @ArrayMaxSize(5) @IsString({ each: true }) policyVersionIds!: string[]; }
export class SimulatePolicyDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(10000) observedAllocationBps!: number;
  @Type(() => Number) @IsInt() @Min(-10000) @Max(10000) previousErrorBps!: number;
  @Type(() => Number) @IsInt() @Min(-1000000) @Max(1000000) integralErrorBps!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(604800) deltaTimeSeconds!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(10000) requestedSlippageBps!: number;
  @IsString() liquidityUsd!: string; @IsString() dailyTurnoverUsd!: string;
  @IsString() targetContract!: string; @IsString() functionSelector!: string; @IsString() evidenceSnapshotId!: string;
  @Matches(/^(0|[1-9][0-9]{0,77})$/) estimatedGasUnits!: string; @Matches(/^(0|[1-9][0-9]{0,77})$/) maxFeePerGasWei!: string;
  @Matches(/^(0|[1-9][0-9]{0,77})$/) nativeBalanceBeforeWei!: string; @Matches(/^(0|[1-9][0-9]{0,77})$/) tokenBalanceBeforeBaseUnits!: string;
  @Matches(/^(0|[1-9][0-9]{0,77})$/) transferAmountBaseUnits!: string;
}

export class CreateAdaptivePidSnapshotDto {
  @IsString() @Length(3,200) treasuryId!: string;
  @IsString() evidenceSnapshotId!: string;
  @IsOptional() @IsString() decisionId?: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(10000) observedAllocationBps!: number;
  @Type(() => Number) @IsInt() @Min(-10000) @Max(10000) previousErrorBps!: number;
  @Type(() => Number) @IsInt() @Min(-1000000) @Max(1000000) integralErrorBps!: number;
  @Type(() => Number) @IsInt() @Min(-10000000) @Max(10000000) previousFilteredDerivativeBpsPerDay!: number;
  @Type(() => Number) @IsInt() @Min(-10000) @Max(10000) previousOutputBps!: number;
  @IsObject() previousGains!: {kpBps:number;kiBps:number;kdBps:number};
  @Type(() => Number) @IsInt() @Min(1) @Max(86400000) deltaTimeMs!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(100000) volatilityBps!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(10000) liquidityDropBps!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(10000) pegDeviationBps!: number;
  @IsBoolean() criticalIncident!: boolean;
}

export class CreateEvidenceBoundAdaptivePidSnapshotDto {
  @IsString() @Length(3,200) treasuryId!: string;
  @IsString() evidenceSnapshotId!: string;
  @IsOptional() @IsString() decisionId?: string;
  @IsOptional() @IsString() previousAdaptivePidSnapshotId?: string;
}
