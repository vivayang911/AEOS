import { ArrayMaxSize,ArrayMinSize,IsArray,IsIn,IsObject,IsString,Length } from "class-validator";
import { GovernedSkillRule } from "./governed-skill-engine";

const AGENT_ROLES=["Governor","Research","Strategy","Quant","Risk","Compliance","Portfolio","Treasury"] as const;
export class CreateGovernedSkillDto{
  @IsString() @Length(1,120) skillKey!:string;
  @IsString() @Length(3,200) name!:string;
  @IsString() @Length(10,2000) description!:string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsString({each:true}) sourceMemoryIds!:string[];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(8) @IsIn(AGENT_ROLES,{each:true}) applicableAgentRoles!:string[];
  @IsObject() rule!:GovernedSkillRule;
}
export class GovernedSkillTransitionDto{@IsString() @Length(3,1000) rationale!:string}
