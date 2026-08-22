import { Type } from "class-transformer";
import { IsEthereumAddress, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";

export class PrepareOrganizationConfigurationDto {
  @IsString() @Length(2,80) networkName!:string;
  @Type(()=>Number) @IsInt() @Min(1) @Max(2147483647) chainId!:number;
  @IsEthereumAddress() governorAddress!:string;
  @IsEthereumAddress() timelockAddress!:string;
  @IsEthereumAddress() safeAddress!:string;
  @IsEthereumAddress() treasuryAddress!:string;
  @IsEthereumAddress() treasuryGuardAddress!:string;
  @IsOptional() @Matches(/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[^\s<>]*)?$/i) blockExplorerUrl?:string;
}
export class ActivateOrganizationConfigurationDto {
  @IsString() @Length(1,4000) message!:string;
  @IsString() @Length(132,132) signature!:string;
}
