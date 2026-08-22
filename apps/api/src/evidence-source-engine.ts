import { AbiCoder,Interface,getAddress,keccak256,toUtf8Bytes } from "ethers";
import { createHash } from "node:crypto";
import { AEOS_EVIDENCE_SOURCE_CHAIN_ID } from "./deployment-engine";

const sourceInterface=new Interface(["function commitObservation(bytes32 observationId,bytes32 organizationCommitment,bytes32 treasuryCommitment,bytes32 evidencePayloadHash,uint64 observedAt) returns(bytes32)"]);
const digestPattern=/^0x[0-9a-fA-F]{64}$/;
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`:JSON.stringify(value);
const sha256=(value:unknown)=>`0x${createHash("sha256").update(canonical(value)).digest("hex")}`;
const bounded=(value:string,code:string)=>{const normalized=value.trim();if(!normalized||normalized.length>128)throw new Error(code);return normalized};

export function buildTreasuryObservationCommitRequest(input:{chainId:number;sourceContract:string;reporter:string;organizationId:string;treasuryId:string;observationKey:string;evidencePayloadHash:string;observedAt:number}){
  if(input.chainId!==AEOS_EVIDENCE_SOURCE_CHAIN_ID)throw new Error("AEOS_EVIDENCE_SOURCE_CHAIN_INVALID");
  const sourceContract=getAddress(input.sourceContract).toLowerCase();const reporter=getAddress(input.reporter).toLowerCase();
  if(sourceContract==="0x0000000000000000000000000000000000000000"||reporter==="0x0000000000000000000000000000000000000000")throw new Error("AEOS_EVIDENCE_SOURCE_ADDRESS_INVALID");
  const organizationId=bounded(input.organizationId,"ORGANIZATION_ID_INVALID"),treasuryId=bounded(input.treasuryId,"TREASURY_ID_INVALID"),observationKey=bounded(input.observationKey,"OBSERVATION_KEY_INVALID");
  if(!digestPattern.test(input.evidencePayloadHash))throw new Error("EVIDENCE_PAYLOAD_HASH_INVALID");
  if(!Number.isSafeInteger(input.observedAt)||input.observedAt<=0)throw new Error("OBSERVED_AT_INVALID");
  const coder=AbiCoder.defaultAbiCoder();
  const organizationCommitment=keccak256(coder.encode(["string","string"],["aeos.organization.v1",organizationId]));
  const treasuryCommitment=keccak256(coder.encode(["string","bytes32","string"],["aeos.treasury.v1",organizationCommitment,treasuryId]));
  const observationId=keccak256(coder.encode(["string","bytes32","string"],["aeos.observation.v1",treasuryCommitment,observationKey]));
  const evidencePayloadHash=input.evidencePayloadHash.toLowerCase();
  const data=sourceInterface.encodeFunctionData("commitObservation",[observationId,organizationCommitment,treasuryCommitment,evidencePayloadHash,input.observedAt]);
  const frozen={schemaVersion:"aeos-evidence-source.commit-request.v1",chainId:input.chainId,sourceContract,reporter,observation:{observationId,organizationCommitment,treasuryCommitment,evidencePayloadHash,observedAt:input.observedAt},unsignedTransaction:{from:reporter,to:sourceContract,value:"0",data,dataHash:keccak256(data)},requiresUserWalletConfirmation:true,signed:false,submitted:false,containsPrivateKey:false,aeosSigningCapability:false,aeosBroadcastCapability:false,assetExecutionAuthorized:false};
  return{...frozen,requestHash:sha256(frozen)};
}
