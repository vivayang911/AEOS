import { AbiCoder,Interface,getAddress,keccak256,toUtf8Bytes } from "ethers";
import { createHash } from "node:crypto";
import { AEOS_EVIDENCE_SOURCE_CHAIN_ID } from "./deployment-engine";

const sourceInterface=new Interface(["function commitObservation(bytes32 observationId,bytes32 organizationCommitment,bytes32 treasuryCommitment,bytes32 evidencePayloadHash,uint64 observedAt) returns(bytes32)"]);
const sourceEventInterface=new Interface(["event TreasuryObservationCommitted(bytes32 indexed observationId,bytes32 indexed organizationCommitment,bytes32 indexed treasuryCommitment,bytes32 evidencePayloadHash,uint64 observedAt,address reporter,uint256 sourceChainId,bytes32 commitment)"]);
const digestPattern=/^0x[0-9a-fA-F]{64}$/;
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`:JSON.stringify(value);
const sha256=(value:unknown)=>`0x${createHash("sha256").update(canonical(value)).digest("hex")}`;
const bounded=(value:string,code:string)=>{const normalized=value.trim();if(!normalized||normalized.length>128)throw new Error(code);return normalized};

type ProjectReportedControlObservationInput={
  chainId:number;
  sourceContract:string;
  reporter:string;
  organizationId:string;
  treasuryId:string;
  observationKey:string;
  observedAt:number;
};

function deriveObservationCommitments(input:{organizationId:string;treasuryId:string;observationKey:string}){
  const organizationId=bounded(input.organizationId,"ORGANIZATION_ID_INVALID"),treasuryId=bounded(input.treasuryId,"TREASURY_ID_INVALID"),observationKey=bounded(input.observationKey,"OBSERVATION_KEY_INVALID");
  const coder=AbiCoder.defaultAbiCoder();
  const organizationCommitment=keccak256(coder.encode(["string","string"],["aeos.organization.v1",organizationId]));
  const treasuryCommitment=keccak256(coder.encode(["string","bytes32","string"],["aeos.treasury.v1",organizationCommitment,treasuryId]));
  const observationId=keccak256(coder.encode(["string","bytes32","string"],["aeos.observation.v1",treasuryCommitment,observationKey]));
  return{organizationCommitment,treasuryCommitment,observationId};
}

export function buildTreasuryObservationCommitRequest(input:{chainId:number;sourceContract:string;reporter:string;organizationId:string;treasuryId:string;observationKey:string;evidencePayloadHash:string;observedAt:number}){
  if(input.chainId!==AEOS_EVIDENCE_SOURCE_CHAIN_ID)throw new Error("AEOS_EVIDENCE_SOURCE_CHAIN_INVALID");
  const sourceContract=getAddress(input.sourceContract).toLowerCase();const reporter=getAddress(input.reporter).toLowerCase();
  if(sourceContract==="0x0000000000000000000000000000000000000000"||reporter==="0x0000000000000000000000000000000000000000")throw new Error("AEOS_EVIDENCE_SOURCE_ADDRESS_INVALID");
  const commitments=deriveObservationCommitments(input);
  if(!digestPattern.test(input.evidencePayloadHash))throw new Error("EVIDENCE_PAYLOAD_HASH_INVALID");
  if(!Number.isSafeInteger(input.observedAt)||input.observedAt<=0)throw new Error("OBSERVED_AT_INVALID");
  const evidencePayloadHash=input.evidencePayloadHash.toLowerCase();
  const data=sourceInterface.encodeFunctionData("commitObservation",[commitments.observationId,commitments.organizationCommitment,commitments.treasuryCommitment,evidencePayloadHash,input.observedAt]);
  const frozen={schemaVersion:"aeos-evidence-source.commit-request.v1",chainId:input.chainId,sourceContract,reporter,observation:{...commitments,evidencePayloadHash,observedAt:input.observedAt},unsignedTransaction:{from:reporter,to:sourceContract,value:"0",data,dataHash:keccak256(data)},requiresUserWalletConfirmation:true,signed:false,submitted:false,containsPrivateKey:false,aeosSigningCapability:false,aeosBroadcastCapability:false,assetExecutionAuthorized:false};
  return{...frozen,requestHash:sha256(frozen)};
}

export function buildProjectReportedControlObservation(input:ProjectReportedControlObservationInput){
  const commitments=deriveObservationCommitments(input);
  const sourceContract=getAddress(input.sourceContract).toLowerCase(),reporter=getAddress(input.reporter).toLowerCase();
  if(input.chainId!==AEOS_EVIDENCE_SOURCE_CHAIN_ID)throw new Error("AEOS_EVIDENCE_SOURCE_CHAIN_INVALID");
  if(!Number.isSafeInteger(input.observedAt)||input.observedAt<=0)throw new Error("OBSERVED_AT_INVALID");
  const payload={schemaVersion:"aeos.project-reported-control-observation.v1",sourceKind:"PROJECT_REPORTED",verificationScope:"TRANSACTION_INCLUSION_ONLY",sourceChainId:input.chainId,sourceContract,reporter,observationId:commitments.observationId,organizationCommitment:commitments.organizationCommitment,treasuryCommitment:commitments.treasuryCommitment,observedAt:input.observedAt,treasuryRegistryStatus:"UNREGISTERED_LOGICAL_IDENTITY",controlState:{evidenceFirst:true,daoInControl:true,advisoryOnly:true,assetExecutionAuthorized:false},truthBoundary:{payloadEconomicTruthVerified:false,attestcoinRequestedToVerifyTransactionInclusion:true}} as const;
  const evidencePayloadHash=sha256(payload);
  return{payload,evidencePayloadHash,commitRequest:buildTreasuryObservationCommitRequest({...input,evidencePayloadHash})};
}

export function verifyTreasuryObservationReceipt(input:{expectedChainId:number;expectedTransactionHash:string;expectedNonce:number;minimumConfirmations:number;request:ReturnType<typeof buildTreasuryObservationCommitRequest>;transaction:{hash:string;from:string;to:string|null;data:string;value:string;nonce:number};receipt:{hash:string;status:number|null;from:string;to:string|null;blockNumber:number;blockHash:string;logs:{address:string;topics:readonly string[];data:string}[]};latestBlockNumber:number;canonicalBlockHash:string;blockTimestamp:number;storedCommitment:string}){
  const expected=input.request,txHash=input.expectedTransactionHash.toLowerCase(),target=expected.sourceContract,reporter=expected.reporter,observation=expected.observation;
  const confirmations=input.latestBlockNumber-input.receipt.blockNumber+1;
  const coder=AbiCoder.defaultAbiCoder();
  const expectedCommitment=keccak256(coder.encode(["uint256","address","bytes32","bytes32","bytes32","bytes32","uint64","address"],[input.expectedChainId,target,observation.observationId,observation.organizationCommitment,observation.treasuryCommitment,observation.evidencePayloadHash,observation.observedAt,reporter]));
  const parsed=input.receipt.logs.filter(log=>log.address.toLowerCase()===target).map(log=>{try{return sourceEventInterface.parseLog({topics:[...log.topics],data:log.data})}catch{return null}}).filter((value):value is NonNullable<typeof value>=>value?.name==="TreasuryObservationCommitted");
  const event=parsed.length===1?parsed[0]:null,args=event?.args;
  const checks=[
    {code:"CHAIN_ID",passed:input.expectedChainId===expected.chainId},
    {code:"TRANSACTION_HASH",passed:input.transaction.hash.toLowerCase()===txHash&&input.receipt.hash.toLowerCase()===txHash},
    {code:"TRANSACTION_ROUTE",passed:(input.transaction.to??"").toLowerCase()===target&&input.transaction.from.toLowerCase()===reporter},
    {code:"TRANSACTION_CALLDATA",passed:input.transaction.data.toLowerCase()===expected.unsignedTransaction.data.toLowerCase()&&keccak256(input.transaction.data)===expected.unsignedTransaction.dataHash},
    {code:"ZERO_VALUE",passed:input.transaction.value==="0"},
    {code:"NONCE",passed:input.transaction.nonce===input.expectedNonce},
    {code:"RECEIPT_SUCCESS",passed:input.receipt.status===1&&(input.receipt.to??"").toLowerCase()===target&&input.receipt.from.toLowerCase()===reporter},
    {code:"CANONICAL_BLOCK",passed:input.receipt.blockHash.toLowerCase()===input.canonicalBlockHash.toLowerCase()},
    {code:"FINALITY",passed:Number.isSafeInteger(input.minimumConfirmations)&&input.minimumConfirmations>=1&&confirmations>=input.minimumConfirmations},
    {code:"EVENT_COUNT",passed:parsed.length===1},
    {code:"EVENT_FIELDS",passed:Boolean(args&&String(args.observationId).toLowerCase()===observation.observationId&&String(args.organizationCommitment).toLowerCase()===observation.organizationCommitment&&String(args.treasuryCommitment).toLowerCase()===observation.treasuryCommitment&&String(args.evidencePayloadHash).toLowerCase()===observation.evidencePayloadHash&&Number(args.observedAt)===observation.observedAt&&String(args.reporter).toLowerCase()===reporter&&Number(args.sourceChainId)===input.expectedChainId&&String(args.commitment).toLowerCase()===expectedCommitment)},
    {code:"STORAGE_READBACK",passed:input.storedCommitment.toLowerCase()===expectedCommitment}
  ];
  const status=checks.every(check=>check.passed)?"VERIFIED":"REJECTED";
  return{schemaVersion:"aeos-treasury-observation.receipt-verification.v1",status,chainId:input.expectedChainId,transactionHash:txHash,blockNumber:input.receipt.blockNumber,blockHash:input.receipt.blockHash.toLowerCase(),blockTimestamp:input.blockTimestamp,confirmations,minimumConfirmations:input.minimumConfirmations,observationId:observation.observationId,evidencePayloadHash:observation.evidencePayloadHash,commitment:expectedCommitment,checks,eventVerified:status==="VERIFIED",calldataVerified:status==="VERIFIED",zeroValueVerified:status==="VERIFIED",privateKeyReceived:false,aeosSigningCapability:false,aeosBroadcastCapability:false,assetExecutionAuthorized:false};
}
