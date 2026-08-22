import{IsOptional,IsString,Length}from"class-validator";
export class CreateTreasuryOutcomeDto{@IsString()@Length(3,200)treasuryId!:string;@IsString()beforeAdaptivePidSnapshotId!:string;@IsString()afterAdaptivePidSnapshotId!:string;@IsOptional()@IsString()safeObservationId?:string;}
