import { IsISO8601,IsOptional,IsString,Length } from "class-validator";
export class CreateAuditExportDto{@IsOptional() @IsString() @Length(1,120) eventType?:string;@IsOptional() @IsISO8601() from?:string;@IsOptional() @IsISO8601() to?:string}
