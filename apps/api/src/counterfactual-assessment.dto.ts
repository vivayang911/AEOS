import { IsString } from "class-validator";

export class CreateCounterfactualAssessmentDto {
  @IsString() methodologyVersionId!: string;
  @IsString() transactionCostAssessmentId!: string;
  @IsString() evidenceSnapshotId!: string;
}
