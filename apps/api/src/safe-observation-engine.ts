export type SafeObservationState = "PENDING_SIGNATURES"|"READY_TO_EXECUTE"|"EXECUTED"|"FAILED";
export type SafeHandoff = { to:string;value:string;data:string;operation:number;safeTxGas:string };
export type SafeServiceTransaction = {
  safe:string;to:string;value:string;data:string|null;operation:number;safeTxGas:string|number;
  safeTxHash:string;isExecuted:boolean;isSuccessful:boolean|null;transactionHash:string|null;
  blockNumber:number|null;confirmationsRequired:number;confirmations?:unknown[];
};

const equalHex = (left:string|null|undefined,right:string|null|undefined) => typeof left === "string" && typeof right === "string" && left.toLowerCase() === right.toLowerCase();

export function normalizeSafeServiceTransaction(input:{transaction:SafeServiceTransaction;expectedSafe:string;expectedHash:string;handoff:SafeHandoff;onchainExecutionConfirmed:boolean;executionBlockHash?:string|null;executionObservedAt?:string|null}) {
  const tx=input.transaction;
  if(!equalHex(tx.safe,input.expectedSafe))throw new Error("SAFE_ADDRESS_MISMATCH");
  if(!equalHex(tx.safeTxHash,input.expectedHash))throw new Error("SAFE_TX_HASH_MISMATCH");
  if(!equalHex(tx.to,input.handoff.to)||tx.value!==input.handoff.value||!equalHex(tx.data,input.handoff.data)||tx.operation!==input.handoff.operation||String(tx.safeTxGas)!==input.handoff.safeTxGas)throw new Error("SAFE_HANDOFF_MISMATCH");
  if(!Number.isInteger(tx.confirmationsRequired)||tx.confirmationsRequired<1)throw new Error("SAFE_CONFIRMATION_POLICY_INVALID");
  const confirmations=Array.isArray(tx.confirmations)?tx.confirmations.length:0;
  let state:SafeObservationState;
  if(tx.isExecuted){
    if(tx.isSuccessful===false)state="FAILED";
    else if(tx.isSuccessful===true&&input.onchainExecutionConfirmed)state="EXECUTED";
    else throw new Error("SAFE_EXECUTION_NOT_CONFIRMED_ONCHAIN");
  } else state=confirmations>=tx.confirmationsRequired?"READY_TO_EXECUTE":"PENDING_SIGNATURES";
  return {schemaVersion:"safe.transaction.observation.v1",state,safeAddress:tx.safe.toLowerCase(),safeTxHash:tx.safeTxHash.toLowerCase(),confirmations,confirmationsRequired:tx.confirmationsRequired,executionTxHash:tx.transactionHash?.toLowerCase()??null,executionBlockNumber:tx.blockNumber??null,executionBlockHash:input.executionBlockHash?.toLowerCase()??null,onchainExecutionConfirmed:state==="EXECUTED",executionObservedAt:input.executionObservedAt??null,signaturesStored:false,assetExecutionAuthorized:false};
}

const rank:Record<SafeObservationState,number>={PENDING_SIGNATURES:0,READY_TO_EXECUTE:1,EXECUTED:2,FAILED:2};
export function validateSafeObservationTransition(previous:SafeObservationState|undefined,next:SafeObservationState){
  if(!previous)return;
  if(previous==="EXECUTED"||previous==="FAILED")throw new Error("SAFE_OBSERVATION_TERMINAL");
  if(rank[next]<rank[previous])throw new Error("SAFE_OBSERVATION_REGRESSION");
}

export function reconcileTerminalSafeObservation(previous:any,next:any){
  if(previous?.state!=="EXECUTED")return {reusePrevious:false};
  const sameExecution=next?.state==="EXECUTED"&&previous.execution_tx_hash===next.executionTxHash&&Number(previous.execution_block_number)===next.executionBlockNumber&&previous.execution_block_hash===next.executionBlockHash;
  if(!sameExecution)throw new Error("SAFE_EXECUTION_REORG_DETECTED");
  return {reusePrevious:true};
}
