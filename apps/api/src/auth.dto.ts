import { Type } from "class-transformer";
import { IsEthereumAddress, IsInt, IsString, Length, Max, Min } from "class-validator";

export class CreateAuthChallengeDto {
  @IsEthereumAddress() walletAddress!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) chainId!: number;
}
export class VerifyAuthChallengeDto {
  @IsString() @Length(1,100) challengeId!: string;
  @IsString() @Length(1,4000) message!: string;
  @IsString() @Length(132,132) signature!: string;
}
export class SelectOrganizationDto { @IsString() @Length(1,100) organizationId!: string; }
