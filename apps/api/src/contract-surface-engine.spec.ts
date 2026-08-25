import { verifyAEOSEvidenceSourceArtifact,verifyBalanceObserverArtifact,verifyEvidenceAnchorArtifact,verifyPolicyRegistryArtifact,verifyTreasuryGuardArtifact } from "./contract-surface-engine";

const writes=["authorizeAction","configurePolicy","setPaused","setSelectorAllowed","setTargetAllowed"];
const artifact=(runtime="0x60006000",extra:any[]=[]):any=>({abi:[{type:"constructor",stateMutability:"nonpayable",inputs:[{type:"address"},{type:"address"},{type:"address"}]},...writes.map(name=>({type:"function",name,stateMutability:"nonpayable",inputs:[],outputs:[]})),...extra],deployedBytecode:{object:runtime}});
describe("TreasuryGuard compiled surface gate",()=>{
  it("accepts only the bounded nonpayable write surface",()=>expect(verifyTreasuryGuardArtifact(artifact())).toEqual(expect.objectContaining({status:"VERIFIED",noPayableSurface:true,noExternalCallOpcodes:true,signerCapability:false,broadcastCapability:false,assetExecutionAuthorized:false})));
  it("rejects delegatecall and other external-call opcodes",()=>expect(verifyTreasuryGuardArtifact(artifact("0x6000f4")).findings).toContain("FORBIDDEN_OPCODE:DELEGATECALL@2"));
  it("rejects unknown write and payable entrypoints",()=>{const result=verifyTreasuryGuardArtifact(artifact("0x6000",[{type:"function",name:"withdraw",stateMutability:"payable",inputs:[],outputs:[]}]));expect(result.status).toBe("REJECTED");expect(result.findings).toEqual(expect.arrayContaining(["PAYABLE_SURFACE:withdraw","UNKNOWN_WRITE_METHOD:withdraw"]))});
});
describe("PolicyRegistry compiled surface gate",()=>{
  const registry=(runtime="0x60006000",extra:any[]=[]):any=>({abi:[{type:"constructor",stateMutability:"nonpayable",inputs:[{type:"address"}]},{type:"function",name:"activatePolicy",stateMutability:"nonpayable",inputs:[],outputs:[]},...extra],deployedBytecode:{object:runtime}});
  it("allows only governance policy activation with no asset or external-call surface",()=>expect(verifyPolicyRegistryArtifact(registry())).toEqual(expect.objectContaining({status:"VERIFIED",writeMethods:["activatePolicy"],noPayableSurface:true,noExternalCallOpcodes:true,upgradeable:false,assetExecutionAuthorized:false})));
  it("rejects external calls, payable entrypoints, and unknown writes",()=>{const result=verifyPolicyRegistryArtifact(registry("0x6000f1",[{type:"function",name:"withdraw",stateMutability:"payable",inputs:[],outputs:[]}]));expect(result.status).toBe("REJECTED");expect(result.findings).toEqual(expect.arrayContaining(["FORBIDDEN_OPCODE:CALL@2","PAYABLE_SURFACE:withdraw","UNKNOWN_WRITE_METHOD:withdraw"]))});
});
describe("EvidenceAnchorASC compiled surface gate",()=>{
  const anchor=(runtime="0x6000fa"):any=>({abi:[{type:"constructor",stateMutability:"nonpayable",inputs:[{type:"address"},{type:"uint64"}]},{type:"function",name:"verifyAndAnchor",stateMutability:"nonpayable",inputs:[],outputs:[]}],deployedBytecode:{object:runtime}});
  it("allows only the nonpayable anchor and read-only precompile call",()=>expect(verifyEvidenceAnchorArtifact(anchor())).toEqual(expect.objectContaining({status:"VERIFIED",writeMethods:["verifyAndAnchor"],onlyReadOnlyPrecompileCall:true,assetExecutionAuthorized:false})));
  it("rejects asset-moving CALL and unknown writes",()=>{const result=verifyEvidenceAnchorArtifact({...anchor("0x6000f1"),abi:[...anchor().abi,{type:"function",name:"withdraw",stateMutability:"nonpayable",inputs:[],outputs:[]}]});expect(result.status).toBe("REJECTED");expect(result.findings).toEqual(expect.arrayContaining(["FORBIDDEN_OPCODE:CALL@2","UNKNOWN_WRITE_METHOD:withdraw"]))});
});
describe("AEOSTreasuryEvidenceSource compiled surface gate",()=>{
  const source=(runtime="0x60006000",extra:any[]=[]):any=>({abi:[{type:"constructor",stateMutability:"nonpayable",inputs:[{type:"address"}]},{type:"function",name:"commitObservation",stateMutability:"nonpayable",inputs:[],outputs:[]},...extra],deployedBytecode:{object:runtime}});
  it("allows only hash observation commits with no asset or external-call surface",()=>expect(verifyAEOSEvidenceSourceArtifact(source())).toEqual(expect.objectContaining({status:"VERIFIED",writeMethods:["commitObservation"],noPayableSurface:true,noExternalCallOpcodes:true,upgradeable:false,assetExecutionAuthorized:false})));
  it("rejects external calls, payable entrypoints, and unknown writes",()=>{const result=verifyAEOSEvidenceSourceArtifact(source("0x6000f1",[{type:"function",name:"withdraw",stateMutability:"payable",inputs:[],outputs:[]}]));expect(result.status).toBe("REJECTED");expect(result.findings).toEqual(expect.arrayContaining(["FORBIDDEN_OPCODE:CALL@2","PAYABLE_SURFACE:withdraw","UNKNOWN_WRITE_METHOD:withdraw"]))});
});
describe("AEOSBalanceObserver compiled surface gate",()=>{
  const observer=(runtime="0x6000fa",extra:any[]=[]):any=>({abi:[{type:"constructor",stateMutability:"nonpayable",inputs:[{type:"address"}]},{type:"function",name:"observeBalance",stateMutability:"nonpayable",inputs:[],outputs:[]},...extra],deployedBytecode:{object:runtime}});
  it("allows only the balance observation write and token STATICCALL",()=>expect(verifyBalanceObserverArtifact(observer())).toEqual(expect.objectContaining({status:"VERIFIED",writeMethods:["observeBalance"],onlyTokenStaticcall:true,noPayableSurface:true,assetExecutionAuthorized:false})));
  it("rejects asset-moving calls, payable entrypoints and unknown writes",()=>{const result=verifyBalanceObserverArtifact(observer("0x6000f1",[{type:"function",name:"withdraw",stateMutability:"payable",inputs:[],outputs:[]}]));expect(result.status).toBe("REJECTED");expect(result.findings).toEqual(expect.arrayContaining(["FORBIDDEN_OPCODE:CALL@2","PAYABLE_SURFACE:withdraw","UNKNOWN_WRITE_METHOD:withdraw"]))});
});
