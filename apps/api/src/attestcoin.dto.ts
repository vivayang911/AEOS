import { IsEthereumAddress, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class CreateAttestcoinJobDto {
  @Matches(/^0x[0-9a-fA-F]{64}$/) sourceTransactionHash!: string;
  @IsOptional() @IsEthereumAddress() requesterWallet!: string;
}

export class SubmitAttestcoinVerificationDto {
  @Matches(/^0x[0-9a-fA-F]{64}$/) verificationTransactionHash!: string;
}

export class PrepareEvidenceAnchorDto {
  @IsString() @MinLength(1) @MaxLength(160) decisionId!: string;
}

export class ConfirmEvidenceAnchorDto {
  @Matches(/^0x[0-9a-fA-F]{64}$/) transactionHash!: string;
}
