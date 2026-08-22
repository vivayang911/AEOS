import { IsString, Length, Matches } from "class-validator";

export class CreateOrganizationDto {
  @IsString() @Length(3,120) @Matches(/^[^<>]+$/) name!: string;
}
