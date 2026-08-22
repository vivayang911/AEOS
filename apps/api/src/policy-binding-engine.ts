import { getAddress } from "ethers";

export function verifyGuardPolicyBinding(input:{expectedRegistry:string;guardRegistry:string;guardPaused:boolean;guardPolicyHash:string;guardPolicyVersion:number;guardValidFrom:number;guardValidUntil:number;registryPolicyHash:string;registryPolicyVersion:number;registryValidFrom:number;registryValidUntil:number;observedTimestamp:number}){
  const hash=(value:string)=>value.toLowerCase();
  const checks=[
    {code:"REGISTRY_ADDRESS_MATCH",passed:getAddress(input.guardRegistry)===getAddress(input.expectedRegistry)},
    {code:"GUARD_PAUSED_FOR_CONFIGURATION",passed:input.guardPaused===true},
    {code:"POLICY_HASH_MATCH",passed:/^0x[0-9a-fA-F]{64}$/.test(input.guardPolicyHash)&&hash(input.guardPolicyHash)===hash(input.registryPolicyHash)},
    {code:"POLICY_VERSION_MATCH",passed:Number.isSafeInteger(input.guardPolicyVersion)&&input.guardPolicyVersion>0&&input.guardPolicyVersion===input.registryPolicyVersion},
    {code:"VALID_FROM_MATCH",passed:Number.isSafeInteger(input.guardValidFrom)&&input.guardValidFrom===input.registryValidFrom},
    {code:"VALID_UNTIL_MATCH",passed:Number.isSafeInteger(input.guardValidUntil)&&input.guardValidUntil===input.registryValidUntil&&input.guardValidFrom<input.guardValidUntil},
    {code:"POLICY_ACTIVE_AT_OBSERVATION",passed:Number.isSafeInteger(input.observedTimestamp)&&input.observedTimestamp>=input.guardValidFrom&&input.observedTimestamp<=input.guardValidUntil}
  ];
  return{schemaVersion:"treasury-guard.policy-binding-verification.v1",status:checks.every(check=>check.passed)?"VERIFIED":"REJECTED",checks,requiresDaoAtomicBatch:true,readsOnly:true,signed:false,submitted:false,assetExecutionAuthorized:false};
}
