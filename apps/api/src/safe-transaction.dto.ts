import { Matches } from "class-validator";

export class ObserveSafeTransactionDto {
  @Matches(/^0x[0-9a-fA-F]{64}$/) safeTxHash!: string;
}
