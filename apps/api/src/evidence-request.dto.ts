import { ArrayMaxSize,IsArray,IsEthereumAddress,IsIn,IsInt,IsOptional,IsString,Matches,Max,MaxLength,Min,MinLength,ValidateNested } from "class-validator";import{Type}from"class-transformer";
class EvidenceRequestBudgetDto{@IsInt()@Min(1)@Max(3)maxAttempts!:number;@IsInt()@Min(1)@Max(20)maxResults!:number}
export class CreateEvidenceRequestDto{
 @IsString()@MinLength(4)@MaxLength(100)agentRunId!:string;
 @Matches(/^[A-Z][A-Z0-9_]{2,63}$/)gapCode!:string;@IsIn(["BALANCE","TRANSACTION","EVENT"])gapType!:any;@Type(()=>Number)@IsInt()@IsIn([11155111,80002])sourceChainId!:number;@IsEthereumAddress()subject!:string;
 @IsOptional()@Matches(/^0x[0-9a-fA-F]{64}$/)transactionHash?:string;@IsOptional()@IsIn(["ERC20_TRANSFER","SAFE_EXECUTION","GOVERNOR_VOTE","GUARD_PAUSE"])eventType?:any;@IsOptional()@Type(()=>Number)@IsInt()@Min(0)fromBlock?:number;@IsOptional()@Type(()=>Number)@IsInt()@Min(0)toBlock?:number;
 @IsArray()@ArrayMaxSize(12)@IsString({each:true})requiredFields!:string[];@Type(()=>Number)@IsInt()@Min(1)@Max(128)requiredConfirmations!:number;@Type(()=>Number)@IsInt()@Min(60)@Max(86400)maxFreshnessSeconds!:number;@IsIn(["LOW","MEDIUM","HIGH"])priority!:any;
 @IsString()@MinLength(8)@MaxLength(500)rationale!:string;@IsArray()@ArrayMaxSize(20)@IsString({each:true})supportingEvidenceIds!:string[];@ValidateNested()@Type(()=>EvidenceRequestBudgetDto)budget!:EvidenceRequestBudgetDto;
}

export class ScopeCommitteeEvidenceGapDto{
 @IsIn(["BALANCE"])gapType!:"BALANCE";
 @Type(()=>Number)@IsInt()@IsIn([11155111,80002])sourceChainId!:number;
 @IsEthereumAddress()subject!:string;
 @IsString()@MinLength(12)@MaxLength(500)scopeRationale!:string;
}

