import { AbiCoder,concat,getAddress,keccak256 } from "ethers";
import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";

const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`:JSON.stringify(value);
const sha256=(value:unknown)=>`0x${createHash("sha256").update(canonical(value)).digest("hex")}`;

export type TreasuryGuardDeploymentInput={chainId:number;governance:string;guardian:string;policyRegistry:string;creationBytecode:string;runtimeBytecode:string;artifactCompiler:string;artifactSource:string};
export type TreasuryGuardDeploymentPlan=ReturnType<typeof buildTreasuryGuardDeploymentPlan>;
export const EVIDENCE_ANCHOR_CHAIN_ID=102031;
export const EVIDENCE_ANCHOR_NATIVE_QUERY_VERIFIER="0x0000000000000000000000000000000000000fd2";
export const EVIDENCE_ANCHOR_SOURCE_CHAIN_KEY=1;
export const AEOS_EVIDENCE_SOURCE_CHAIN_ID=11155111;
export const POLICY_REGISTRY_CHAIN_ID=102031;
export const TREASURY_GUARD_CHAIN_ID=102031;

export function buildAEOSEvidenceSourceDeploymentPlan(input:{chainId:number;reporter:string;creationBytecode:string;runtimeBytecode:string;artifactCompiler:string;artifactSource:string}){
  if(input.chainId!==AEOS_EVIDENCE_SOURCE_CHAIN_ID)throw new Error("AEOS_EVIDENCE_SOURCE_DEPLOYMENT_CHAIN_INVALID");
  const reporter=getAddress(input.reporter).toLowerCase();if(reporter==="0x0000000000000000000000000000000000000000")throw new Error("AEOS_EVIDENCE_SOURCE_REPORTER_INVALID");
  for(const bytecode of[input.creationBytecode,input.runtimeBytecode])if(!/^0x[0-9a-fA-F]+$/.test(bytecode)||bytecode.length<4||bytecode.length%2!==0)throw new Error("AEOS_EVIDENCE_SOURCE_BYTECODE_INVALID");
  const constructorArgs=AbiCoder.defaultAbiCoder().encode(["address"],[reporter]);const data=concat([input.creationBytecode,constructorArgs]);
  const frozen={schemaVersion:"aeos-evidence-source.deployment-plan.v1",chainId:input.chainId,contract:"AEOSTreasuryEvidenceSource",artifact:{source:input.artifactSource,compiler:input.artifactCompiler,creationBytecodeHash:keccak256(input.creationBytecode),runtimeBytecodeTemplateHash:keccak256(input.runtimeBytecode)},constructor:{reporter},unsignedTransaction:{to:null,value:"0",data,initCodeHash:keccak256(data)},expectedReadback:{reporter},requiresUserWalletConfirmation:true,signed:false,submitted:false,containsPrivateKey:false,aeosSigningCapability:false,aeosBroadcastCapability:false,assetExecutionAuthorized:false};
  return{...frozen,planHash:sha256(frozen)};
}

export function verifyAEOSEvidenceSourceReadback(input:{expectedChainId:number;actualChainId:number;expectedReporter:string;actualReporter:string;expectedInitCodeHash:string;deploymentTransactionData:string;deploymentTransactionTo:string|null;deploymentTransactionValue:string;address:string;code:string;deploymentTransactionHash:string;receiptStatus:number|null;receiptTo:string|null;receiptContractAddress:string|null;receiptBlockNumber:number;latestBlockNumber:number;minimumConfirmations:number}){
  const address=getAddress(input.address).toLowerCase();const confirmations=input.latestBlockNumber-input.receiptBlockNumber+1;
  const transactionDataValid=/^0x[0-9a-fA-F]+$/.test(input.deploymentTransactionData)&&input.deploymentTransactionData.length%2===0;
  const checks=[
    {code:"CHAIN_ID_MATCH",passed:input.expectedChainId===AEOS_EVIDENCE_SOURCE_CHAIN_ID&&input.actualChainId===input.expectedChainId},
    {code:"CONTRACT_CODE_PRESENT",passed:/^0x[0-9a-fA-F]{2,}$/.test(input.code)&&input.code!=="0x"},
    {code:"REPORTER_MATCH",passed:getAddress(input.actualReporter)===getAddress(input.expectedReporter)},
    {code:"DEPLOYMENT_TRANSACTION_HASH_VALID",passed:/^0x[0-9a-fA-F]{64}$/.test(input.deploymentTransactionHash)},
    {code:"DEPLOYMENT_INIT_CODE_MATCH",passed:transactionDataValid&&/^0x[0-9a-fA-F]{64}$/.test(input.expectedInitCodeHash)&&keccak256(input.deploymentTransactionData)===input.expectedInitCodeHash.toLowerCase()},
    {code:"DEPLOYMENT_TRANSACTION_IS_CONTRACT_CREATION",passed:input.deploymentTransactionTo===null},
    {code:"DEPLOYMENT_TRANSACTION_VALUE_ZERO",passed:input.deploymentTransactionValue==="0"},
    {code:"DEPLOYMENT_RECEIPT_SUCCESS",passed:input.receiptStatus===1},
    {code:"CONTRACT_CREATION_RECEIPT",passed:input.receiptTo===null&&input.receiptContractAddress!==null&&getAddress(input.receiptContractAddress??address).toLowerCase()===address},
    {code:"DEPLOYMENT_FINAL",passed:Number.isSafeInteger(input.minimumConfirmations)&&input.minimumConfirmations>=1&&confirmations>=input.minimumConfirmations}
  ];
  return{schemaVersion:"aeos-evidence-source.deployment-verification.v1",address,deploymentTransactionHash:input.deploymentTransactionHash.toLowerCase(),confirmations,minimumConfirmations:input.minimumConfirmations,status:checks.every(check=>check.passed)?"VERIFIED":"REJECTED",checks,readsOnly:true,signed:false,submitted:false,containsPrivateKey:false,aeosSigningCapability:false,aeosBroadcastCapability:false,assetExecutionAuthorized:false};
}

export function buildPolicyRegistryDeploymentPlan(input:{chainId:number;governance:string;creationBytecode:string;runtimeBytecode:string;artifactCompiler:string;artifactSource:string}){
  if(input.chainId!==POLICY_REGISTRY_CHAIN_ID)throw new Error("POLICY_REGISTRY_DEPLOYMENT_CHAIN_INVALID");
  const governance=getAddress(input.governance).toLowerCase();if(governance==="0x0000000000000000000000000000000000000000")throw new Error("POLICY_REGISTRY_GOVERNANCE_INVALID");
  for(const bytecode of[input.creationBytecode,input.runtimeBytecode])if(!/^0x[0-9a-fA-F]+$/.test(bytecode)||bytecode.length<4||bytecode.length%2!==0)throw new Error("POLICY_REGISTRY_BYTECODE_INVALID");
  const constructorArgs=AbiCoder.defaultAbiCoder().encode(["address"],[governance]);const data=concat([input.creationBytecode,constructorArgs]);
  const frozen={schemaVersion:"policy-registry.deployment-plan.v1",chainId:input.chainId,contract:"PolicyRegistry",artifact:{source:input.artifactSource,compiler:input.artifactCompiler,creationBytecodeHash:keccak256(input.creationBytecode),runtimeBytecodeHash:keccak256(input.runtimeBytecode)},constructor:{governance},unsignedTransaction:{to:null,value:"0",data,initCodeHash:keccak256(data)},expectedReadback:{governance,latestVersion:0,runtimeBytecodeHash:keccak256(input.runtimeBytecode)},requiresUserWalletConfirmation:true,signed:false,submitted:false,containsPrivateKey:false,aeosSigningCapability:false,aeosBroadcastCapability:false,assetExecutionAuthorized:false};
  return{...frozen,planHash:sha256(frozen)};
}

export function verifyPolicyRegistryReadback(input:{expectedChainId:number;actualChainId:number;expectedGovernance:string;actualGovernance:string;expectedLatestVersion:number;actualLatestVersion:number;expectedRuntimeBytecodeHash:string;expectedInitCodeHash:string;deploymentTransactionData:string;deploymentTransactionTo:string|null;deploymentTransactionValue:string;address:string;code:string;deploymentTransactionHash:string;receiptStatus:number|null;receiptTo:string|null;receiptContractAddress:string|null;receiptBlockNumber:number;latestBlockNumber:number;minimumConfirmations:number}){
  const address=getAddress(input.address).toLowerCase();const confirmations=input.latestBlockNumber-input.receiptBlockNumber+1;
  const transactionDataValid=/^0x[0-9a-fA-F]+$/.test(input.deploymentTransactionData)&&input.deploymentTransactionData.length%2===0;
  const codeValid=/^0x[0-9a-fA-F]+$/.test(input.code)&&input.code.length>=4&&input.code.length%2===0;
  const checks=[
    {code:"CHAIN_ID_MATCH",passed:input.expectedChainId===POLICY_REGISTRY_CHAIN_ID&&input.actualChainId===input.expectedChainId},
    {code:"CONTRACT_CODE_MATCH",passed:codeValid&&keccak256(input.code)===input.expectedRuntimeBytecodeHash.toLowerCase()},
    {code:"GOVERNANCE_MATCH",passed:getAddress(input.actualGovernance)===getAddress(input.expectedGovernance)},
    {code:"REGISTRY_STARTS_EMPTY",passed:input.expectedLatestVersion===0&&input.actualLatestVersion===0},
    {code:"DEPLOYMENT_TRANSACTION_HASH_VALID",passed:/^0x[0-9a-fA-F]{64}$/.test(input.deploymentTransactionHash)},
    {code:"DEPLOYMENT_INIT_CODE_MATCH",passed:transactionDataValid&&/^0x[0-9a-fA-F]{64}$/.test(input.expectedInitCodeHash)&&keccak256(input.deploymentTransactionData)===input.expectedInitCodeHash.toLowerCase()},
    {code:"DEPLOYMENT_TRANSACTION_IS_CONTRACT_CREATION",passed:input.deploymentTransactionTo===null},
    {code:"DEPLOYMENT_TRANSACTION_VALUE_ZERO",passed:input.deploymentTransactionValue==="0"},
    {code:"DEPLOYMENT_RECEIPT_SUCCESS",passed:input.receiptStatus===1},
    {code:"CONTRACT_CREATION_RECEIPT",passed:input.receiptTo===null&&input.receiptContractAddress!==null&&getAddress(input.receiptContractAddress??address).toLowerCase()===address},
    {code:"DEPLOYMENT_FINAL",passed:Number.isSafeInteger(input.minimumConfirmations)&&input.minimumConfirmations>=1&&confirmations>=input.minimumConfirmations}
  ];
  return{schemaVersion:"policy-registry.deployment-verification.v1",address,deploymentTransactionHash:input.deploymentTransactionHash.toLowerCase(),confirmations,minimumConfirmations:input.minimumConfirmations,status:checks.every(check=>check.passed)?"VERIFIED":"REJECTED",checks,readsOnly:true,signed:false,submitted:false,containsPrivateKey:false,aeosSigningCapability:false,aeosBroadcastCapability:false,assetExecutionAuthorized:false};
}

export function buildTreasuryGuardDeploymentPlan(input:TreasuryGuardDeploymentInput){
  if(input.chainId!==TREASURY_GUARD_CHAIN_ID)throw new Error("TREASURY_GUARD_DEPLOYMENT_CHAIN_INVALID");
  const governance=getAddress(input.governance).toLowerCase();const guardian=getAddress(input.guardian).toLowerCase();const policyRegistry=getAddress(input.policyRegistry).toLowerCase();
  if(new Set([governance,guardian,policyRegistry]).size!==3)throw new Error("DEPLOYMENT_ROLES_MUST_BE_SEPARATE");
  for(const bytecode of[input.creationBytecode,input.runtimeBytecode])if(!/^0x[0-9a-fA-F]+$/.test(bytecode)||bytecode.length<4||bytecode.length%2!==0)throw new Error("DEPLOYMENT_BYTECODE_INVALID");
  const constructorArgs=AbiCoder.defaultAbiCoder().encode(["address","address","address"],[governance,guardian,policyRegistry]);const data=concat([input.creationBytecode,constructorArgs]);
  const frozen={schemaVersion:"treasury-guard.deployment-plan.v3",chainId:input.chainId,contract:"TreasuryGuard",artifact:{source:input.artifactSource,compiler:input.artifactCompiler,creationBytecodeHash:keccak256(input.creationBytecode),runtimeBytecodeHash:keccak256(input.runtimeBytecode)},constructor:{governance,guardian,policyRegistry,rolesSeparated:true},unsignedTransaction:{to:null,value:"0",data,initCodeHash:keccak256(data)},expectedReadback:{governance,guardian,policyRegistry,paused:true,runtimeBytecodeHash:keccak256(input.runtimeBytecode)},requiresUserWalletConfirmation:true,signed:false,submitted:false,containsPrivateKey:false,aeosSigningCapability:false,aeosBroadcastCapability:false,assetExecutionAuthorized:false};
  return {...frozen,planHash:sha256(frozen)};
}

export function buildTreasuryGuardDeploymentManifest(plan:TreasuryGuardDeploymentPlan){
  const {planHash,...frozenPlan}=plan;
  if(sha256(frozenPlan)!==planHash)throw new Error("DEPLOYMENT_PLAN_HASH_MISMATCH");
  if(plan.signed!==false||plan.submitted!==false||plan.containsPrivateKey!==false||plan.assetExecutionAuthorized!==false)throw new Error("DEPLOYMENT_PLAN_AUTHORITY_INVALID");
  const frozen={schemaVersion:"treasury-guard.deployment-manifest.v1",planHash,chainId:plan.chainId,contract:plan.contract,artifact:plan.artifact,constructor:plan.constructor,unsignedTransaction:{to:plan.unsignedTransaction.to,value:plan.unsignedTransaction.value,initCodeHash:plan.unsignedTransaction.initCodeHash,dataHash:keccak256(plan.unsignedTransaction.data)},authority:{requiresUserWalletConfirmation:true,aeosSigningCapability:false,aeosBroadcastCapability:false,signed:false,submitted:false,containsPrivateKey:false,assetExecutionAuthorized:false}};
  const manifest={...frozen,manifestHash:sha256(frozen)};
  const signingPayload=Buffer.from(canonical(manifest),"utf8");
  const signingRequest={schemaVersion:"treasury-guard.deployment-signing-request.v1",algorithm:"Ed25519",payloadFormat:"AEOS_CANONICAL_JSON_UTF8",manifestHash:manifest.manifestHash,payloadBase64:signingPayload.toString("base64"),acceptsOnlyExternalSignature:true,aeosSigningCapability:false,aeosBroadcastCapability:false,assetExecutionAuthorized:false};
  return {manifest,signingRequest};
}

export function verifyTreasuryGuardDeploymentManifestSignature(input:{manifest:ReturnType<typeof buildTreasuryGuardDeploymentManifest>["manifest"];signerId:string;publicKeySpkiBase64:string;signatureBase64:string}){
  const {manifestHash,...frozen}=input.manifest;
  if(!input.signerId.trim())throw new Error("DEPLOYMENT_MANIFEST_SIGNER_ID_REQUIRED");
  if(sha256(frozen)!==manifestHash)throw new Error("DEPLOYMENT_MANIFEST_HASH_MISMATCH");
  if(frozen.authority.aeosSigningCapability!==false||frozen.authority.aeosBroadcastCapability!==false||frozen.authority.signed!==false||frozen.authority.submitted!==false||frozen.authority.containsPrivateKey!==false||frozen.authority.assetExecutionAuthorized!==false)throw new Error("DEPLOYMENT_MANIFEST_AUTHORITY_INVALID");
  let publicKey:ReturnType<typeof createPublicKey>;let signature:Buffer;
  try{publicKey=createPublicKey({key:Buffer.from(input.publicKeySpkiBase64,"base64"),format:"der",type:"spki"});signature=Buffer.from(input.signatureBase64,"base64")}catch{throw new Error("DEPLOYMENT_MANIFEST_SIGNATURE_INPUT_INVALID")}
  if(publicKey.asymmetricKeyType!=="ed25519")throw new Error("DEPLOYMENT_MANIFEST_SIGNATURE_ALGORITHM_INVALID");
  if(signature.length!==64)throw new Error("DEPLOYMENT_MANIFEST_SIGNATURE_INPUT_INVALID");
  const payload=Buffer.from(canonical(input.manifest),"utf8");const verified=verifySignature(null,payload,publicKey,signature);const publicDer=publicKey.export({format:"der",type:"spki"});
  return {schemaVersion:"treasury-guard.deployment-signature-verification.v1",status:verified?"VERIFIED":"REJECTED",manifestHash,signerId:input.signerId,algorithm:"Ed25519",keyFingerprint:`sha256:${createHash("sha256").update(publicDer).digest("hex")}`,signatureHash:`sha256:${createHash("sha256").update(signature).digest("hex")}`,externalSignatureVerified:verified,manifestSignedExternally:verified,aeosSigned:false,aeosSigningCapability:false,aeosBroadcastCapability:false,submitted:false,assetExecutionAuthorized:false};
}

export function verifyTreasuryGuardReadback(input:{expectedChainId:number;actualChainId:number;expectedGovernance:string;actualGovernance:string;expectedGuardian:string;actualGuardian:string;expectedPolicyRegistry:string;actualPolicyRegistry:string;expectedRuntimeBytecodeHash:string;expectedInitCodeHash:string;deploymentTransactionData:string;deploymentTransactionTo:string|null;deploymentTransactionValue:string;deploymentTransactionHash:string;receiptStatus:number|null;receiptTo:string|null;receiptContractAddress:string|null;receiptBlockNumber:number;latestBlockNumber:number;minimumConfirmations:number;address:string;code:string;paused:boolean}){
  const address=getAddress(input.address).toLowerCase();const confirmations=input.latestBlockNumber-input.receiptBlockNumber+1;
  const codeValid=/^0x[0-9a-fA-F]+$/.test(input.code)&&input.code.length>=4&&input.code.length%2===0;const txDataValid=/^0x[0-9a-fA-F]+$/.test(input.deploymentTransactionData)&&input.deploymentTransactionData.length%2===0;
  const checks=[
    {code:"CHAIN_ID_MATCH",passed:input.expectedChainId===TREASURY_GUARD_CHAIN_ID&&input.actualChainId===input.expectedChainId},
    {code:"CONTRACT_CODE_MATCH",passed:codeValid&&keccak256(input.code)===input.expectedRuntimeBytecodeHash.toLowerCase()},
    {code:"GOVERNANCE_MATCH",passed:getAddress(input.actualGovernance)===getAddress(input.expectedGovernance)},
    {code:"GUARDIAN_MATCH",passed:getAddress(input.actualGuardian)===getAddress(input.expectedGuardian)},
    {code:"POLICY_REGISTRY_MATCH",passed:getAddress(input.actualPolicyRegistry)===getAddress(input.expectedPolicyRegistry)},
    {code:"ROLES_SEPARATED",passed:new Set([getAddress(input.actualGovernance),getAddress(input.actualGuardian),getAddress(input.actualPolicyRegistry)]).size===3},
    {code:"STARTS_PAUSED",passed:input.paused===true},
    {code:"DEPLOYMENT_TRANSACTION_HASH_VALID",passed:/^0x[0-9a-fA-F]{64}$/.test(input.deploymentTransactionHash)},
    {code:"DEPLOYMENT_INIT_CODE_MATCH",passed:txDataValid&&keccak256(input.deploymentTransactionData)===input.expectedInitCodeHash.toLowerCase()},
    {code:"DEPLOYMENT_TRANSACTION_IS_CONTRACT_CREATION",passed:input.deploymentTransactionTo===null},
    {code:"DEPLOYMENT_TRANSACTION_VALUE_ZERO",passed:input.deploymentTransactionValue==="0"},
    {code:"DEPLOYMENT_RECEIPT_SUCCESS",passed:input.receiptStatus===1},
    {code:"CONTRACT_CREATION_RECEIPT",passed:input.receiptTo===null&&input.receiptContractAddress!==null&&getAddress(input.receiptContractAddress??address).toLowerCase()===address},
    {code:"DEPLOYMENT_FINAL",passed:Number.isSafeInteger(input.minimumConfirmations)&&input.minimumConfirmations>=1&&confirmations>=input.minimumConfirmations}
  ];
  return {schemaVersion:"treasury-guard.deployment-verification.v2",address,deploymentTransactionHash:input.deploymentTransactionHash.toLowerCase(),confirmations,minimumConfirmations:input.minimumConfirmations,status:checks.every(check=>check.passed)?"VERIFIED":"REJECTED",checks,readsOnly:true,signed:false,submitted:false,containsPrivateKey:false,aeosSigningCapability:false,aeosBroadcastCapability:false,assetExecutionAuthorized:false};
}

export function buildEvidenceAnchorDeploymentPlan(input:{chainId:number;nativeQueryVerifier:string;sourceChainKey:number;creationBytecode:string;runtimeBytecode:string;artifactCompiler:string;artifactSource:string}){
  if(input.chainId!==EVIDENCE_ANCHOR_CHAIN_ID)throw new Error("EVIDENCE_ANCHOR_DEPLOYMENT_CHAIN_INVALID");
  const verifier=getAddress(input.nativeQueryVerifier).toLowerCase();if(verifier!==EVIDENCE_ANCHOR_NATIVE_QUERY_VERIFIER)throw new Error("EVIDENCE_ANCHOR_VERIFIER_INVALID");
  if(input.sourceChainKey!==EVIDENCE_ANCHOR_SOURCE_CHAIN_KEY)throw new Error("EVIDENCE_ANCHOR_SOURCE_CHAIN_KEY_INVALID");
  for(const bytecode of[input.creationBytecode,input.runtimeBytecode])if(!/^0x[0-9a-fA-F]+$/.test(bytecode)||bytecode.length<4||bytecode.length%2!==0)throw new Error("EVIDENCE_ANCHOR_BYTECODE_INVALID");
  const constructorArgs=AbiCoder.defaultAbiCoder().encode(["address","uint64"],[verifier,input.sourceChainKey]);const data=concat([input.creationBytecode,constructorArgs]);
  const frozen={schemaVersion:"evidence-anchor.deployment-plan.v1",chainId:input.chainId,contract:"EvidenceAnchorASC",artifact:{source:input.artifactSource,compiler:input.artifactCompiler,creationBytecodeHash:keccak256(input.creationBytecode),runtimeBytecodeTemplateHash:keccak256(input.runtimeBytecode)},constructor:{nativeQueryVerifier:verifier,allowedSourceChainKey:input.sourceChainKey},unsignedTransaction:{to:null,value:"0",data,initCodeHash:keccak256(data)},expectedReadback:{nativeQueryVerifier:verifier,allowedSourceChainKey:input.sourceChainKey},requiresUserWalletConfirmation:true,signed:false,submitted:false,containsPrivateKey:false,aeosSigningCapability:false,aeosBroadcastCapability:false,assetExecutionAuthorized:false};
  return{...frozen,planHash:sha256(frozen)};
}

export function verifyEvidenceAnchorReadback(input:{expectedChainId:number;actualChainId:number;expectedNativeQueryVerifier:string;actualNativeQueryVerifier:string;expectedSourceChainKey:number;actualSourceChainKey:number;expectedInitCodeHash:string;deploymentTransactionData:string;deploymentTransactionTo:string|null;deploymentTransactionValue:string;address:string;code:string;deploymentTransactionHash:string;receiptStatus:number|null;receiptTo:string|null;receiptContractAddress:string|null;receiptBlockNumber:number;latestBlockNumber:number;minimumConfirmations:number}){
  const address=getAddress(input.address).toLowerCase();const confirmations=input.latestBlockNumber-input.receiptBlockNumber+1;
  const transactionDataValid=/^0x[0-9a-fA-F]+$/.test(input.deploymentTransactionData)&&input.deploymentTransactionData.length%2===0;
  const checks=[
    {code:"CHAIN_ID_MATCH",passed:input.expectedChainId===EVIDENCE_ANCHOR_CHAIN_ID&&input.actualChainId===input.expectedChainId},
    {code:"CONTRACT_CODE_PRESENT",passed:/^0x[0-9a-fA-F]{2,}$/.test(input.code)&&input.code!=="0x"},
    {code:"NATIVE_QUERY_VERIFIER_MATCH",passed:getAddress(input.expectedNativeQueryVerifier).toLowerCase()===EVIDENCE_ANCHOR_NATIVE_QUERY_VERIFIER&&getAddress(input.actualNativeQueryVerifier).toLowerCase()===EVIDENCE_ANCHOR_NATIVE_QUERY_VERIFIER},
    {code:"SOURCE_CHAIN_KEY_MATCH",passed:input.expectedSourceChainKey===EVIDENCE_ANCHOR_SOURCE_CHAIN_KEY&&input.actualSourceChainKey===EVIDENCE_ANCHOR_SOURCE_CHAIN_KEY},
    {code:"DEPLOYMENT_TRANSACTION_HASH_VALID",passed:/^0x[0-9a-fA-F]{64}$/.test(input.deploymentTransactionHash)},
    {code:"DEPLOYMENT_INIT_CODE_MATCH",passed:transactionDataValid&&/^0x[0-9a-fA-F]{64}$/.test(input.expectedInitCodeHash)&&keccak256(input.deploymentTransactionData)===input.expectedInitCodeHash.toLowerCase()},
    {code:"DEPLOYMENT_TRANSACTION_IS_CONTRACT_CREATION",passed:input.deploymentTransactionTo===null},
    {code:"DEPLOYMENT_TRANSACTION_VALUE_ZERO",passed:input.deploymentTransactionValue==="0"},
    {code:"DEPLOYMENT_RECEIPT_SUCCESS",passed:input.receiptStatus===1},
    {code:"CONTRACT_CREATION_RECEIPT",passed:input.receiptTo===null&&input.receiptContractAddress!==null&&getAddress(input.receiptContractAddress??address).toLowerCase()===address},
    {code:"DEPLOYMENT_FINAL",passed:Number.isSafeInteger(input.minimumConfirmations)&&input.minimumConfirmations>=1&&confirmations>=input.minimumConfirmations}
  ];
  return{schemaVersion:"evidence-anchor.deployment-verification.v1",address,deploymentTransactionHash:input.deploymentTransactionHash.toLowerCase(),confirmations,minimumConfirmations:input.minimumConfirmations,status:checks.every(check=>check.passed)?"VERIFIED":"REJECTED",checks,readsOnly:true,signed:false,submitted:false,containsPrivateKey:false,aeosSigningCapability:false,aeosBroadcastCapability:false,assetExecutionAuthorized:false};
}
