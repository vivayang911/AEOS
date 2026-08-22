import { Interface, getAddress, keccak256, toUtf8Bytes } from "ethers";

const registryInterface=new Interface(["function activatePolicy(bytes32 policyHash,uint64 version,uint64 validFrom,uint64 validUntil)"]);
const guardInterface=new Interface(["function configurePolicy(bytes32 policyHash,uint64 policyVersion,uint64 validFrom,uint64 validUntil,uint256 maxNativeValue)","function setTargetAllowed(address target,bool allowed)","function setSelectorAllowed(bytes4 selector,bool allowed)"]);
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`:JSON.stringify(value);

export type PolicyActivationBatchInput={chainId:number;governance:string;policyRegistry:string;treasuryGuard:string;guardPaused:boolean;registryLatestVersion:number;guardPolicyVersion:number;policyHash:string;policyVersion:number;validFrom:number;validUntil:number;maxNativeValue:string;allowedTargets:string[];allowedSelectors:string[]};

export function buildPolicyActivationBatch(input:PolicyActivationBatchInput){
  if(input.chainId!==102031)throw new Error("POLICY_BATCH_CHAIN_INVALID");
  const governance=getAddress(input.governance).toLowerCase(),policyRegistry=getAddress(input.policyRegistry).toLowerCase(),treasuryGuard=getAddress(input.treasuryGuard).toLowerCase();
  if(new Set([governance,policyRegistry,treasuryGuard]).size!==3)throw new Error("POLICY_BATCH_CONTROL_ADDRESSES_INVALID");
  if(input.guardPaused!==true)throw new Error("POLICY_BATCH_GUARD_NOT_PAUSED");
  if(!/^0x[0-9a-fA-F]{64}$/.test(input.policyHash)||/^0x0{64}$/i.test(input.policyHash))throw new Error("POLICY_BATCH_HASH_INVALID");
  if(!Number.isSafeInteger(input.policyVersion)||input.policyVersion!==input.registryLatestVersion+1||input.policyVersion!==input.guardPolicyVersion+1)throw new Error("POLICY_BATCH_VERSION_INVALID");
  if(!Number.isSafeInteger(input.validFrom)||!Number.isSafeInteger(input.validUntil)||input.validFrom<0||input.validFrom>=input.validUntil)throw new Error("POLICY_BATCH_WINDOW_INVALID");
  if(!/^\d+$/.test(input.maxNativeValue))throw new Error("POLICY_BATCH_VALUE_INVALID");
  const targets=[...new Set(input.allowedTargets.map(value=>getAddress(value).toLowerCase()))].sort();
  const selectors=[...new Set(input.allowedSelectors.map(value=>value.toLowerCase()))].sort();
  if(targets.length===0||targets.length!==input.allowedTargets.length||targets.some(value=>value===governance||value===policyRegistry||value===treasuryGuard))throw new Error("POLICY_BATCH_TARGETS_INVALID");
  if(selectors.length===0||selectors.length!==input.allowedSelectors.length||selectors.some(value=>!/^0x[0-9a-f]{8}$/.test(value)||value==="0x00000000"))throw new Error("POLICY_BATCH_SELECTORS_INVALID");
  const calls=[
    {order:1,purpose:"ACTIVATE_REGISTRY_POLICY",to:policyRegistry,value:"0",data:registryInterface.encodeFunctionData("activatePolicy",[input.policyHash,input.policyVersion,input.validFrom,input.validUntil])},
    {order:2,purpose:"CONFIGURE_PAUSED_GUARD",to:treasuryGuard,value:"0",data:guardInterface.encodeFunctionData("configurePolicy",[input.policyHash,input.policyVersion,input.validFrom,input.validUntil,input.maxNativeValue])},
    ...targets.map((target,index)=>({order:3+index,purpose:"ALLOW_TARGET",to:treasuryGuard,value:"0",data:guardInterface.encodeFunctionData("setTargetAllowed",[target,true])})),
    ...selectors.map((selector,index)=>({order:3+targets.length+index,purpose:"ALLOW_SELECTOR",to:treasuryGuard,value:"0",data:guardInterface.encodeFunctionData("setSelectorAllowed",[selector,true])}))
  ];
  const frozen={schemaVersion:"treasury-policy.activation-batch.v1",chainId:input.chainId,governance,policyRegistry,treasuryGuard,preconditions:{guardPaused:true,registryLatestVersion:input.registryLatestVersion,guardPolicyVersion:input.guardPolicyVersion},policy:{policyHash:input.policyHash.toLowerCase(),version:input.policyVersion,validFrom:input.validFrom,validUntil:input.validUntil,maxNativeValue:input.maxNativeValue,allowedTargets:targets,allowedSelectors:selectors},calls,postConditions:{guardRemainsPaused:true,requiresSameBlockBindingVerification:true,unpauseIncluded:false},requiresDaoAtomicBatch:true,requiresUserWalletConfirmation:true,signed:false,submitted:false,aeosSigningCapability:false,aeosBroadcastCapability:false,assetExecutionAuthorized:false};
  return{...frozen,batchHash:keccak256(toUtf8Bytes(canonical(frozen)))};
}
