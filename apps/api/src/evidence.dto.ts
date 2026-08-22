import { ArrayMaxSize, ArrayMinSize, IsArray, IsEthereumAddress, IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
export class IngestMockDto {
  @IsOptional() @IsString() organizationId!: string;
  @IsOptional() @Type(() => Number) @IsInt() @IsIn([11155111, 80002]) chainId?: number;
  @IsOptional() @IsEthereumAddress() wallet?: string;
  @IsOptional() @IsIn(["valid", "invalid"]) proof?: "valid" | "invalid";
  @IsOptional() @IsISO8601() observedAt?: string;
  @IsOptional() @IsString() amount?: string;
}
export class SnapshotDto { @IsOptional() @IsString() organizationId!: string; @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsString({ each: true }) evidenceIds!: string[]; }
export class EvidenceQueryDto {
  @IsOptional() @IsIn(["VERIFIED", "REJECTED", "UNVERIFIED"]) status?: string;
  @IsOptional() @IsIn(["FRESH", "STALE", "ARCHIVED"]) freshness?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) chainId?: number;
  @IsOptional() @IsString() predicate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) minQuality?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() cursor?: string;
}
