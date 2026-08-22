import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";

export class CreateExecutionPreflightDto {
  @IsOptional() @IsString() @Length(1,200) actorId!: string;
  @Type(() => Number) @IsInt() @Min(60) @Max(3600) validForSeconds = 300;
}
