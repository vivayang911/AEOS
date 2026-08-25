import { keccak256 } from "ethers";

const allowedWriteMethods=new Set(["authorizeAction","configurePolicy","setPaused","setSelectorAllowed","setTargetAllowed"]);
const forbiddenOpcodes=new Map([[0xf0,"CREATE"],[0xf1,"CALL"],[0xf2,"CALLCODE"],[0xf4,"DELEGATECALL"],[0xf5,"CREATE2"],[0xfa,"STATICCALL"],[0xff,"SELFDESTRUCT"]]);

function executableBytes(bytecode:string){if(!/^0x[0-9a-fA-F]+$/.test(bytecode)||bytecode.length%2!==0)throw new Error("CONTRACT_RUNTIME_BYTECODE_INVALID");const bytes=Buffer.from(bytecode.slice(2),"hex");if(bytes.length<2)return bytes;const metadataLength=bytes.readUInt16BE(bytes.length-2);return metadataLength+2<=bytes.length?bytes.subarray(0,bytes.length-metadataLength-2):bytes}
function scanOpcodes(bytecode:string){const code=executableBytes(bytecode);const findings:string[]=[];for(let offset=0;offset<code.length;offset+=1){const opcode=code[offset];const forbidden=forbiddenOpcodes.get(opcode);if(forbidden)findings.push(`${forbidden}@${offset}`);if(opcode>=0x60&&opcode<=0x7f)offset+=opcode-0x5f}return findings}
function scanAnchorOpcodes(bytecode:string){return scanOpcodes(bytecode).filter(item=>!item.startsWith("STATICCALL@"))}

export function verifyTreasuryGuardArtifact(artifact:any){
  const abi=Array.isArray(artifact?.abi)?artifact.abi:[];const findings:string[]=[];
  const constructors=abi.filter((item:any)=>item.type==="constructor");if(constructors.length!==1||constructors[0].stateMutability!=="nonpayable"||constructors[0].inputs?.map((item:any)=>item.type).join(",")!=="address,address,address")findings.push("CONSTRUCTOR_SURFACE_MISMATCH");
  for(const item of abi){
    if(item.type==="fallback"||item.type==="receive")findings.push(`FORBIDDEN_${String(item.type).toUpperCase()}`);
    if(item.stateMutability==="payable")findings.push(`PAYABLE_SURFACE:${item.name??item.type}`);
    if(item.type==="function"&&item.stateMutability!=="view"&&item.stateMutability!=="pure"&&!allowedWriteMethods.has(item.name))findings.push(`UNKNOWN_WRITE_METHOD:${item.name}`);
  }
  const writes=abi.filter((item:any)=>item.type==="function"&&item.stateMutability!=="view"&&item.stateMutability!=="pure").map((item:any)=>item.name).sort();for(const expected of [...allowedWriteMethods].sort())if(!writes.includes(expected))findings.push(`MISSING_WRITE_METHOD:${expected}`);
  const runtime=artifact?.deployedBytecode?.object;let opcodeFindings:string[]=[];try{opcodeFindings=scanOpcodes(runtime)}catch(error){findings.push(error instanceof Error?error.message:"CONTRACT_RUNTIME_BYTECODE_INVALID")}
  findings.push(...opcodeFindings.map(item=>`FORBIDDEN_OPCODE:${item}`));
  return {schemaVersion:"treasury-guard.contract-surface.v1",contract:"TreasuryGuard",status:findings.length?"REJECTED":"VERIFIED",findings,writeMethods:writes,runtimeBytecodeHash:typeof runtime==="string"&&/^0x[0-9a-fA-F]+$/.test(runtime)?keccak256(runtime):null,noPayableSurface:!abi.some((item:any)=>item.stateMutability==="payable"),noExternalCallOpcodes:opcodeFindings.length===0,signerCapability:false,broadcastCapability:false,assetExecutionAuthorized:false};
}

export function verifyEvidenceAnchorArtifact(artifact:any){
  const abi=Array.isArray(artifact?.abi)?artifact.abi:[];const findings:string[]=[];
  const constructors=abi.filter((item:any)=>item.type==="constructor");if(constructors.length!==1||constructors[0].stateMutability!=="nonpayable"||constructors[0].inputs?.map((item:any)=>item.type).join(",")!=="address,uint64")findings.push("CONSTRUCTOR_SURFACE_MISMATCH");
  for(const item of abi){if(item.type==="fallback"||item.type==="receive")findings.push(`FORBIDDEN_${String(item.type).toUpperCase()}`);if(item.stateMutability==="payable")findings.push(`PAYABLE_SURFACE:${item.name??item.type}`);if(item.type==="function"&&item.stateMutability!=="view"&&item.stateMutability!=="pure"&&item.name!=="verifyAndAnchor")findings.push(`UNKNOWN_WRITE_METHOD:${item.name}`)}
  const writes=abi.filter((item:any)=>item.type==="function"&&item.stateMutability!=="view"&&item.stateMutability!=="pure").map((item:any)=>item.name).sort();if(writes.join(",")!=="verifyAndAnchor")findings.push("WRITE_SURFACE_MISMATCH");
  const runtime=artifact?.deployedBytecode?.object;let opcodeFindings:string[]=[];try{opcodeFindings=scanAnchorOpcodes(runtime)}catch(error){findings.push(error instanceof Error?error.message:"CONTRACT_RUNTIME_BYTECODE_INVALID")}findings.push(...opcodeFindings.map(item=>`FORBIDDEN_OPCODE:${item}`));
  return{schemaVersion:"evidence-anchor-asc.contract-surface.v1",contract:"EvidenceAnchorASC",status:findings.length?"REJECTED":"VERIFIED",findings,writeMethods:writes,runtimeBytecodeHash:typeof runtime==="string"&&/^0x[0-9a-fA-F]+$/.test(runtime)?keccak256(runtime):null,noPayableSurface:!abi.some((item:any)=>item.stateMutability==="payable"),onlyReadOnlyPrecompileCall:opcodeFindings.length===0,signerCapability:false,broadcastCapability:false,assetExecutionAuthorized:false};
}

export function verifyPolicyRegistryArtifact(artifact:any){
  const abi=Array.isArray(artifact?.abi)?artifact.abi:[];const findings:string[]=[];
  const constructors=abi.filter((item:any)=>item.type==="constructor");if(constructors.length!==1||constructors[0].stateMutability!=="nonpayable"||constructors[0].inputs?.map((item:any)=>item.type).join(",")!=="address")findings.push("CONSTRUCTOR_SURFACE_MISMATCH");
  for(const item of abi){if(item.type==="fallback"||item.type==="receive")findings.push(`FORBIDDEN_${String(item.type).toUpperCase()}`);if(item.stateMutability==="payable")findings.push(`PAYABLE_SURFACE:${item.name??item.type}`);if(item.type==="function"&&item.stateMutability!=="view"&&item.stateMutability!=="pure"&&item.name!=="activatePolicy")findings.push(`UNKNOWN_WRITE_METHOD:${item.name}`)}
  const writes=abi.filter((item:any)=>item.type==="function"&&item.stateMutability!=="view"&&item.stateMutability!=="pure").map((item:any)=>item.name).sort();if(writes.join(",")!=="activatePolicy")findings.push("WRITE_SURFACE_MISMATCH");
  const runtime=artifact?.deployedBytecode?.object;let opcodeFindings:string[]=[];try{opcodeFindings=scanOpcodes(runtime)}catch(error){findings.push(error instanceof Error?error.message:"CONTRACT_RUNTIME_BYTECODE_INVALID")}findings.push(...opcodeFindings.map(item=>`FORBIDDEN_OPCODE:${item}`));
  return{schemaVersion:"policy-registry.contract-surface.v1",contract:"PolicyRegistry",status:findings.length?"REJECTED":"VERIFIED",findings,writeMethods:writes,runtimeBytecodeHash:typeof runtime==="string"&&/^0x[0-9a-fA-F]+$/.test(runtime)?keccak256(runtime):null,noPayableSurface:!abi.some((item:any)=>item.stateMutability==="payable"),noExternalCallOpcodes:opcodeFindings.length===0,upgradeable:false,signerCapability:false,broadcastCapability:false,assetExecutionAuthorized:false};
}

export function verifyAEOSEvidenceSourceArtifact(artifact:any){
  const abi=Array.isArray(artifact?.abi)?artifact.abi:[];const findings:string[]=[];
  const constructors=abi.filter((item:any)=>item.type==="constructor");if(constructors.length!==1||constructors[0].stateMutability!=="nonpayable"||constructors[0].inputs?.map((item:any)=>item.type).join(",")!=="address")findings.push("CONSTRUCTOR_SURFACE_MISMATCH");
  for(const item of abi){if(item.type==="fallback"||item.type==="receive")findings.push(`FORBIDDEN_${String(item.type).toUpperCase()}`);if(item.stateMutability==="payable")findings.push(`PAYABLE_SURFACE:${item.name??item.type}`);if(item.type==="function"&&item.stateMutability!=="view"&&item.stateMutability!=="pure"&&item.name!=="commitObservation")findings.push(`UNKNOWN_WRITE_METHOD:${item.name}`)}
  const writes=abi.filter((item:any)=>item.type==="function"&&item.stateMutability!=="view"&&item.stateMutability!=="pure").map((item:any)=>item.name).sort();if(writes.join(",")!=="commitObservation")findings.push("WRITE_SURFACE_MISMATCH");
  const runtime=artifact?.deployedBytecode?.object;let opcodeFindings:string[]=[];try{opcodeFindings=scanOpcodes(runtime)}catch(error){findings.push(error instanceof Error?error.message:"CONTRACT_RUNTIME_BYTECODE_INVALID")}findings.push(...opcodeFindings.map(item=>`FORBIDDEN_OPCODE:${item}`));
  return{schemaVersion:"aeos-evidence-source.contract-surface.v1",contract:"AEOSTreasuryEvidenceSource",status:findings.length?"REJECTED":"VERIFIED",findings,writeMethods:writes,runtimeBytecodeHash:typeof runtime==="string"&&/^0x[0-9a-fA-F]+$/.test(runtime)?keccak256(runtime):null,noPayableSurface:!abi.some((item:any)=>item.stateMutability==="payable"),noExternalCallOpcodes:opcodeFindings.length===0,upgradeable:false,signerCapability:false,broadcastCapability:false,assetExecutionAuthorized:false};
}

export function verifyBalanceObserverArtifact(artifact:any){
  const abi=Array.isArray(artifact?.abi)?artifact.abi:[];const findings:string[]=[];
  const constructors=abi.filter((item:any)=>item.type==="constructor");if(constructors.length!==1||constructors[0].stateMutability!=="nonpayable"||constructors[0].inputs?.map((item:any)=>item.type).join(",")!=="address")findings.push("CONSTRUCTOR_SURFACE_MISMATCH");
  for(const item of abi){if(item.type==="fallback"||item.type==="receive")findings.push(`FORBIDDEN_${String(item.type).toUpperCase()}`);if(item.stateMutability==="payable")findings.push(`PAYABLE_SURFACE:${item.name??item.type}`);if(item.type==="function"&&item.stateMutability!=="view"&&item.stateMutability!=="pure"&&item.name!=="observeBalance")findings.push(`UNKNOWN_WRITE_METHOD:${item.name}`)}
  const writes=abi.filter((item:any)=>item.type==="function"&&item.stateMutability!=="view"&&item.stateMutability!=="pure").map((item:any)=>item.name).sort();if(writes.join(",")!=="observeBalance")findings.push("WRITE_SURFACE_MISMATCH");
  const runtime=artifact?.deployedBytecode?.object;let opcodeFindings:string[]=[];try{opcodeFindings=scanAnchorOpcodes(runtime)}catch(error){findings.push(error instanceof Error?error.message:"CONTRACT_RUNTIME_BYTECODE_INVALID")}findings.push(...opcodeFindings.map(item=>`FORBIDDEN_OPCODE:${item}`));
  return{schemaVersion:"aeos-balance-observer.contract-surface.v1",contract:"AEOSBalanceObserver",status:findings.length?"REJECTED":"VERIFIED",findings,writeMethods:writes,runtimeBytecodeHash:typeof runtime==="string"&&/^0x[0-9a-fA-F]+$/.test(runtime)?keccak256(runtime):null,noPayableSurface:!abi.some((item:any)=>item.stateMutability==="payable"),onlyTokenStaticcall:opcodeFindings.length===0,upgradeable:false,signerCapability:false,broadcastCapability:false,assetExecutionAuthorized:false};
}
