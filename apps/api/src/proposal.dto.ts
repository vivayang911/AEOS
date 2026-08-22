import { IsEthereumAddress, IsIn, IsOptional, IsString, Length, Matches } from "class-validator";

export class CreateProposalDto {
  @IsString() decisionId!: string; @IsString() simulationId!: string;
  @IsString() @Length(3,200) title!: string; @IsString() @Length(3,2000) summary!: string; @IsString() @Length(3,4000) rationale!: string;
  @IsOptional() @IsString() @Length(1,200) createdBy!: string;
  @IsIn(["ERC20_TRANSFER"]) kind!: "ERC20_TRANSFER";
  @IsEthereumAddress() tokenContract!: string; @IsEthereumAddress() recipient!: string;
  @Matches(/^(0|[1-9][0-9]{0,77})$/) amountBaseUnits!: string;
  @Matches(/^(0|[1-9][0-9]{0,77})$/) amountUsd!: string;
}
