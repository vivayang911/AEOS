import { Interface, getAddress, keccak256, toUtf8Bytes } from "ethers";
import { buildPolicyActivationBatch, PolicyActivationBatchInput } from "./policy-activation-batch-engine";

const guardInterface=new Interface(["function setPaused(bool value)"]);
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`:JSON.stringify(value);

export type PolicyActivationReadback={
  chainId:number; blockNumber:number; blockHash:string; confirmations:number; observedTimestamp:number;
  guardAddress:string; guardRegistry:string; guardPaused:boolean; guardPolicyHash:string; guardPolicyVersion:number;
  guardValidFrom:number; guardValidUntil:number; guardMaxNativeValue:string;
  registryAddress:string; registryLatestVersion:number; registryPolicyHash:string; registryPolicyVersion:number;
  registryValidFrom:number; registryValidUntil:number; allowedTargets:{target:string;allowed:boolean}[];
  allowedSelectors:{selector:string;allowed:boolean}[];
};

export function buildPolicyUnpauseHandoff(activationInput:PolicyActivationBatchInput,observed:PolicyActivationReadback){
  const activationBatch=buildPolicyActivationBatch(activationInput);
  const expectedTargets=activationBatch.policy.allowedTargets;
  const expectedSelectors=activationBatch.policy.allowedSelectors;
  const actualTargets=observed.allowedTargets.map(item=>({target:getAddress(item.target).toLowerCase(),allowed:item.allowed})).sort((a,b)=>a.target.localeCompare(b.target));
  const actualSelectors=observed.allowedSelectors.map(item=>({selector:item.selector.toLowerCase(),allowed:item.allowed})).sort((a,b)=>a.selector.localeCompare(b.selector));
  const checks=[
    {code:"CREDITCOIN_TESTNET_CHAIN",passed:observed.chainId===102031&&observed.chainId===activationBatch.chainId},
    {code:"CONFIRMED_CANONICAL_BLOCK",passed:Number.isSafeInteger(observed.blockNumber)&&observed.blockNumber>=0&&Number.isSafeInteger(observed.confirmations)&&observed.confirmations>=1&&/^0x[0-9a-fA-F]{64}$/.test(observed.blockHash)},
    {code:"GUARD_ADDRESS_MATCH",passed:getAddress(observed.guardAddress).toLowerCase()===activationBatch.treasuryGuard},
    {code:"REGISTRY_ADDRESS_MATCH",passed:getAddress(observed.registryAddress).toLowerCase()===activationBatch.policyRegistry&&getAddress(observed.guardRegistry).toLowerCase()===activationBatch.policyRegistry},
    {code:"GUARD_REMAINS_PAUSED",passed:observed.guardPaused===true},
    {code:"POLICY_HASH_MATCH",passed:observed.guardPolicyHash.toLowerCase()===activationBatch.policy.policyHash&&observed.registryPolicyHash.toLowerCase()===activationBatch.policy.policyHash},
    {code:"POLICY_VERSION_MATCH",passed:observed.guardPolicyVersion===activationBatch.policy.version&&observed.registryPolicyVersion===activationBatch.policy.version&&observed.registryLatestVersion===activationBatch.policy.version},
    {code:"POLICY_WINDOW_MATCH",passed:observed.guardValidFrom===activationBatch.policy.validFrom&&observed.registryValidFrom===activationBatch.policy.validFrom&&observed.guardValidUntil===activationBatch.policy.validUntil&&observed.registryValidUntil===activationBatch.policy.validUntil},
    {code:"POLICY_ACTIVE_AT_OBSERVATION",passed:Number.isSafeInteger(observed.observedTimestamp)&&observed.observedTimestamp>=activationBatch.policy.validFrom&&observed.observedTimestamp<=activationBatch.policy.validUntil},
    {code:"MAX_NATIVE_VALUE_MATCH",passed:/^\d+$/.test(observed.guardMaxNativeValue)&&observed.guardMaxNativeValue===activationBatch.policy.maxNativeValue},
    {code:"EXPECTED_TARGETS_ENABLED",passed:actualTargets.length===expectedTargets.length&&actualTargets.every((item,index)=>item.allowed===true&&item.target===expectedTargets[index])},
    {code:"EXPECTED_SELECTORS_ENABLED",passed:actualSelectors.length===expectedSelectors.length&&actualSelectors.every((item,index)=>item.allowed===true&&item.selector===expectedSelectors[index])}
  ];
  const status=checks.every(check=>check.passed)?"VERIFIED":"REJECTED";
  const verification={schemaVersion:"treasury-policy.activation-readback.v1",activationBatchHash:activationBatch.batchHash,chainId:observed.chainId,blockNumber:observed.blockNumber,blockHash:observed.blockHash.toLowerCase(),confirmations:observed.confirmations,observedTimestamp:observed.observedTimestamp,allowlistReadbackScope:"EXPECTED_BATCH_ENTRIES",checks,status,readsOnly:true};
  const unpauseHandoff=status==="VERIFIED"?{schemaVersion:"treasury-policy.unpause-handoff.v1",activationBatchHash:activationBatch.batchHash,verificationHash:keccak256(toUtf8Bytes(canonical(verification))),chainId:activationBatch.chainId,to:activationBatch.treasuryGuard,value:"0",data:guardInterface.encodeFunctionData("setPaused",[false]),purpose:"DAO_REVIEW_GUARD_UNPAUSE",requiresDaoApproval:true,requiresUserWalletConfirmation:true,signed:false,submitted:false,aeosSigningCapability:false,aeosBroadcastCapability:false,assetExecutionAuthorized:false}:null;
  return{...verification,unpauseHandoff,signed:false,submitted:false,aeosSigningCapability:false,aeosBroadcastCapability:false,assetExecutionAuthorized:false};
}
