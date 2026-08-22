import { normalizeSafeServiceTransaction,reconcileTerminalSafeObservation,validateSafeObservationTransition } from "./safe-observation-engine";

const hash=`0x${"11".repeat(32)}`;const safe="0x1111111111111111111111111111111111111111";const guard="0x2222222222222222222222222222222222222222";const data="0x1234";
const transaction=(overrides:Record<string,unknown>={})=>({safe,to:guard,value:"0",data,operation:0,safeTxGas:"0",safeTxHash:hash,isExecuted:false,isSuccessful:null,transactionHash:null,blockNumber:null,confirmationsRequired:2,confirmations:[{}],...overrides} as any);
const normalize=(overrides:Record<string,unknown>={},confirmed=false)=>normalizeSafeServiceTransaction({transaction:transaction(overrides),expectedSafe:safe,expectedHash:hash,handoff:{to:guard,value:"0",data,operation:0,safeTxGas:"0"},onchainExecutionConfirmed:confirmed});

describe("Safe observation guardrails",()=>{
  it("keeps insufficient confirmations pending without signatures",()=>expect(normalize()).toEqual(expect.objectContaining({state:"PENDING_SIGNATURES",confirmations:1,signaturesStored:false,assetExecutionAuthorized:false})));
  it("marks the exact handoff ready at the Safe threshold",()=>expect(normalize({confirmations:[{},{}]}).state).toBe("READY_TO_EXECUTE"));
  it("requires independent on-chain proof for executed service records",()=>expect(()=>normalize({isExecuted:true,isSuccessful:true,transactionHash:hash,blockNumber:7})).toThrow("SAFE_EXECUTION_NOT_CONFIRMED_ONCHAIN"));
  it("records a proven authorization without claiming asset authority",()=>expect(normalize({isExecuted:true,isSuccessful:true,transactionHash:hash,blockNumber:7},true)).toEqual(expect.objectContaining({state:"EXECUTED",onchainExecutionConfirmed:true,assetExecutionAuthorized:false})));
  it("rejects any mutation of the frozen handoff",()=>expect(()=>normalize({value:"1"})).toThrow("SAFE_HANDOFF_MISMATCH"));
  it("prevents state regression and changes after terminal state",()=>{expect(()=>validateSafeObservationTransition("READY_TO_EXECUTE","PENDING_SIGNATURES")).toThrow("SAFE_OBSERVATION_REGRESSION");expect(()=>validateSafeObservationTransition("EXECUTED","EXECUTED")).toThrow("SAFE_OBSERVATION_TERMINAL")});
  it("reuses an identical terminal receipt but detects a reorged block",()=>{const previous={state:"EXECUTED",execution_tx_hash:hash,execution_block_number:7,execution_block_hash:`0x${"77".repeat(32)}`};expect(reconcileTerminalSafeObservation(previous,{state:"EXECUTED",executionTxHash:hash,executionBlockNumber:7,executionBlockHash:`0x${"77".repeat(32)}`})).toEqual({reusePrevious:true});expect(()=>reconcileTerminalSafeObservation(previous,{state:"EXECUTED",executionTxHash:hash,executionBlockNumber:8,executionBlockHash:`0x${"88".repeat(32)}`})).toThrow("SAFE_EXECUTION_REORG_DETECTED")});
});
