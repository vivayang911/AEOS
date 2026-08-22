import { getAddress } from "ethers";
import { DecisionRole,decisionRoles,hashValue } from "./decision-engine";

export const evidenceGapTypes=["BALANCE","TRANSACTION","EVENT"] as const;
export const evidenceRequestPriorities=["LOW","MEDIUM","HIGH"] as const;
export const evidenceRequestEvents=["PROPOSED","VALIDATED","QUEUED","DISCOVERING","NORMALIZED","INDEXED","SATISFIED","UNSATISFIED","REJECTED","QUARANTINED","FAILED"] as const;
export const allowedEvidenceEvents=["ERC20_TRANSFER","SAFE_EXECUTION","GOVERNOR_VOTE","GUARD_PAUSE"] as const;
export const evidenceRequestSchemaVersion="evidence.request.v1" as const;
export const evidenceBrokerVersion="deterministic-mock-evidence-broker-v1" as const;
const injection=/ignore\s+(all\s+)?(previous|prior)|system\s+prompt|developer\s+message|private\s+key|execute\s+(this\s+)?(instruction|command)|arbitrary\s+(url|rpc)|bypass\s+(the\s+)?(policy|guardrail)/i;

export type EvidenceRequestInput={decisionId:string;agentRunId:string;requestingRole:DecisionRole;gapCode:string;gapType:typeof evidenceGapTypes[number];sourceChainId:number;subject:string;transactionHash?:string;eventType?:typeof allowedEvidenceEvents[number];fromBlock?:number;toBlock?:number;requiredFields:string[];requiredConfirmations:number;maxFreshnessSeconds:number;priority:typeof evidenceRequestPriorities[number];rationale:string;supportingEvidenceIds:string[];budget:{maxAttempts:number;maxResults:number}};
export type FrozenEvidenceRequest=EvidenceRequestInput&{schemaVersion:typeof evidenceRequestSchemaVersion;requestHash:string;brokerVersion:typeof evidenceBrokerVersion;assetExecutionAuthorized:false};

const roleDomains:Record<DecisionRole,ReadonlyArray<typeof evidenceGapTypes[number]>>={Governor:["TRANSACTION","EVENT"],Research:["BALANCE","TRANSACTION","EVENT"],Strategy:["BALANCE","EVENT"],Quant:["BALANCE","EVENT"],Risk:["BALANCE","TRANSACTION","EVENT"],Compliance:["TRANSACTION","EVENT"],Portfolio:["BALANCE","EVENT"],Treasury:["BALANCE","TRANSACTION","EVENT"]};

export class EvidenceRequestValidationError extends Error{constructor(message:string){super(message);this.name="EvidenceRequestValidationError"}}
export function freezeEvidenceRequest(input:EvidenceRequestInput):FrozenEvidenceRequest{
  if(!decisionRoles.includes(input.requestingRole))throw new EvidenceRequestValidationError("Unknown requesting Agent role");
  if(!roleDomains[input.requestingRole].includes(input.gapType))throw new EvidenceRequestValidationError("Agent role is not allowed to request this Evidence domain");
  if(![11155111,80002].includes(input.sourceChainId))throw new EvidenceRequestValidationError("Unsupported source chain");
  if(!/^[A-Z][A-Z0-9_]{2,63}$/.test(input.gapCode))throw new EvidenceRequestValidationError("Invalid evidence gap code");
  if(injection.test(input.rationale)||injection.test(input.subject))throw new EvidenceRequestValidationError("Evidence request contains instruction-like content");
  let subject:string;try{subject=getAddress(input.subject).toLowerCase()}catch{throw new EvidenceRequestValidationError("Evidence request subject must be an EVM address")}
  const transactionHash=input.transactionHash?.toLowerCase();
  if(input.gapType==="TRANSACTION"&&!/^0x[0-9a-f]{64}$/.test(transactionHash??""))throw new EvidenceRequestValidationError("Transaction request requires a valid transaction hash");
  if(input.gapType!=="TRANSACTION"&&transactionHash)throw new EvidenceRequestValidationError("Transaction hash is not allowed for this request type");
  if(input.gapType==="EVENT"){
    if(!input.eventType||!allowedEvidenceEvents.includes(input.eventType))throw new EvidenceRequestValidationError("Event request requires an allowlisted event type");
    if(!Number.isSafeInteger(input.fromBlock)||!Number.isSafeInteger(input.toBlock)||input.fromBlock!<0||input.toBlock!<input.fromBlock!||input.toBlock!-input.fromBlock!>2000)throw new EvidenceRequestValidationError("Event block range must be ordered and at most 2000 blocks");
  }else if(input.eventType!==undefined||input.fromBlock!==undefined||input.toBlock!==undefined)throw new EvidenceRequestValidationError("Event fields are not allowed for this request type");
  if(!input.requiredFields.length||input.requiredFields.length>12||input.requiredFields.some(field=>!/^[a-z][a-zA-Z0-9.]{1,63}$/.test(field)))throw new EvidenceRequestValidationError("Required fields are invalid");
  if(input.requiredConfirmations<1||input.requiredConfirmations>128)throw new EvidenceRequestValidationError("Required confirmations exceed deterministic bounds");
  if(input.maxFreshnessSeconds<60||input.maxFreshnessSeconds>86400)throw new EvidenceRequestValidationError("Freshness requirement exceeds deterministic bounds");
  if(input.budget.maxAttempts<1||input.budget.maxAttempts>3||input.budget.maxResults<1||input.budget.maxResults>20)throw new EvidenceRequestValidationError("Evidence request budget exceeds deterministic bounds");
  const normalized={...input,subject,transactionHash,eventType:input.eventType,fromBlock:input.fromBlock,toBlock:input.toBlock,requiredFields:[...new Set(input.requiredFields)].sort(),supportingEvidenceIds:[...new Set(input.supportingEvidenceIds)].sort()};
  const basis={schemaVersion:evidenceRequestSchemaVersion,brokerVersion:evidenceBrokerVersion,...normalized,assetExecutionAuthorized:false as const};return {...basis,requestHash:hashValue(basis)};
}

export type BrokerResult={status:"SATISFIED";mockFact:{subject:{type:"wallet";id:string};predicate:"asset.balance";value:{amount:string;decimals:number;symbol:string};chain:{id:number;blockNumber:number};source:{provider:string;reference:string};verificationStatus:"VERIFIED";observedAt:string}}|{status:"UNSATISFIED";reasonCode:"MOCK_PROOF_NOT_AVAILABLE"|"MOCK_DISCOVERY_EMPTY"};
export class DeterministicMockEvidenceRequestBroker{
  readonly mode="mock-only";readonly networkAuthority=false;readonly signerCapability=false;readonly broadcastCapability=false;readonly assetExecutionAuthorized=false;
  run(request:FrozenEvidenceRequest):BrokerResult{
    if(request.gapType!=="BALANCE")return {status:"UNSATISFIED",reasonCode:request.gapType==="TRANSACTION"?"MOCK_PROOF_NOT_AVAILABLE":"MOCK_DISCOVERY_EMPTY"};
    const seed=BigInt(`0x${request.requestHash.slice(2,18)}`);const amount=(50_000_000n+seed%150_000_000n).toString();const observedAt="2026-08-12T00:00:00.000Z";
    return {status:"SATISFIED",mockFact:{subject:{type:"wallet",id:`eip155:${request.sourceChainId}:${request.subject}`},predicate:"asset.balance",value:{amount,decimals:6,symbol:"USDC"},chain:{id:request.sourceChainId,blockNumber:request.sourceChainId===11155111?6500000:25000000},source:{provider:"mock-attestcoin-demand-v1",reference:request.requestHash},verificationStatus:"VERIFIED",observedAt}};
  }
}

