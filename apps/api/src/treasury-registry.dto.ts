import{Transform,Type}from"class-transformer";import{IsEthereumAddress,IsInt,IsOptional,IsString,Length,Matches,Max,Min}from"class-validator";
const lower=({value}:{value:unknown})=>typeof value==="string"?value.toLowerCase():value;
export class TreasuryRegistryConfigDto{
 @Matches(/^trs_[a-z0-9][a-z0-9_-]{2,62}$/)treasuryId!:string;
 @IsString()@Length(2,80)displayName!:string;
 @Type(()=>Number)@IsInt()@Min(1)@Max(2147483647)chainId!:number;
 @Transform(lower)@IsEthereumAddress()treasuryAddress!:string;
 @Transform(lower)@IsEthereumAddress()governorAddress!:string;
 @Transform(lower)@IsEthereumAddress()timelockAddress!:string;
 @Transform(lower)@IsEthereumAddress()safeAddress!:string;
 @Transform(lower)@IsEthereumAddress()treasuryGuardAddress!:string;
 @Transform(lower)@IsEthereumAddress()policyRegistryAddress!:string;
 @IsOptional()@IsString()@Length(3,200)policyVersionId?:string;
 @IsString()@Length(3,240)changeReason!:string;
}
export class RetireTreasuryDto{@IsString()@Length(3,240)changeReason!:string}
