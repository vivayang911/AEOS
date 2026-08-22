import { Interface, JsonRpcProvider, TransactionReceipt, getAddress } from "ethers";
import { SafeHandoff, SafeServiceTransaction, normalizeSafeServiceTransaction } from "./safe-observation-engine";

export const SAFE_TRANSACTION_ADAPTER=Symbol("SAFE_TRANSACTION_ADAPTER");
export type SafeReadInput={safeTxHash:string;actionId:string;handoff:SafeHandoff;guardAddress:string;expiresAt:string};
export type SafeObservationSnapshot=ReturnType<typeof normalizeSafeServiceTransaction>;
export interface SafeTransactionReadAdapter{readonly mode:"mock"|"safe-service-readonly";readonly provider:string;configuration():Record<string,unknown>;read(input:SafeReadInput):Promise<SafeObservationSnapshot>}

export class MockSafeTransactionReadAdapter implements SafeTransactionReadAdapter{
  readonly mode="mock" as const;readonly provider="mock-safe-observation-v1";
  configuration(){return {mode:this.mode,provider:this.provider,readsOnly:true,httpMethods:["GET"],signsTransactions:false,submitsTransactions:false,storesSignatures:false,assetExecutionAuthorized:false,warning:"Mock adapter fails closed and cannot confirm Safe transactions"}}
  async read(_input:SafeReadInput):Promise<SafeObservationSnapshot>{throw new Error("SAFE_TRANSACTION_READ_ADAPTER_NOT_CONFIGURED")}
}

const safeInterface=new Interface(["event ExecutionSuccess(bytes32 txHash,uint256 payment)","event ExecutionFailure(bytes32 txHash,uint256 payment)"]);
const guardInterface=new Interface(["event ActionAuthorized(bytes32 indexed actionId,address indexed target,bytes4 indexed selector,bytes32 policyHash,uint64 policyVersion)"]);

export class SafeTransactionServiceReadAdapter implements SafeTransactionReadAdapter{
  readonly mode="safe-service-readonly" as const;readonly provider="safe-transaction-service-readonly-v1";private readonly rpc:JsonRpcProvider;readonly safeAddress:string;readonly guardAddress:string;
  constructor(readonly serviceUrl:string,rpcUrl:string,readonly chainId:number,safeAddress:string,guardAddress:string,readonly minimumConfirmations=2,private readonly apiKey=""){
    if(!serviceUrl||!rpcUrl||!Number.isInteger(chainId)||chainId<=0||!Number.isInteger(minimumConfirmations)||minimumConfirmations<1)throw new Error("Valid Safe service, RPC, chain ID and confirmation policy are required");
    this.safeAddress=getAddress(safeAddress).toLowerCase();this.guardAddress=getAddress(guardAddress).toLowerCase();this.rpc=new JsonRpcProvider(rpcUrl,chainId,{staticNetwork:true});
  }
  configuration(){return {mode:this.mode,provider:this.provider,serviceUrl:this.serviceUrl,chainId:this.chainId,safeAddress:this.safeAddress,guardAddress:this.guardAddress,minimumConfirmations:this.minimumConfirmations,readsOnly:true,httpMethods:["GET"],signsTransactions:false,submitsTransactions:false,storesSignatures:false,assetExecutionAuthorized:false}}
  async read(input:SafeReadInput){
    const url=`${this.serviceUrl.replace(/\/$/,"").replace(/\/api\/v1$/,"")}/api/v1/multisig-transactions/${input.safeTxHash}/`;
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);
    let response:Response;try{response=await fetch(url,{method:"GET",headers:this.apiKey?{Authorization:`Bearer ${this.apiKey}`}:{},signal:controller.signal})}finally{clearTimeout(timeout)}
    if(!response.ok)throw new Error(`SAFE_TRANSACTION_SERVICE_${response.status}`);const transaction=await response.json() as SafeServiceTransaction;
    let confirmed=false,blockHash:string|null=null,observedAt:string|null=null;
    if(transaction.isExecuted&&transaction.isSuccessful===true){const verified=await this.verifyReceipt(transaction,input);confirmed=true;blockHash=verified.blockHash;observedAt=verified.observedAt}
    return normalizeSafeServiceTransaction({transaction,expectedSafe:this.safeAddress,expectedHash:input.safeTxHash,handoff:input.handoff,onchainExecutionConfirmed:confirmed,executionBlockHash:blockHash,executionObservedAt:observedAt});
  }
  private async verifyReceipt(transaction:SafeServiceTransaction,input:SafeReadInput){
    if(!transaction.transactionHash)throw new Error("SAFE_EXECUTION_TX_HASH_MISSING");
    const [network,receipt,latest]=await Promise.all([this.rpc.getNetwork(),this.rpc.getTransactionReceipt(transaction.transactionHash),this.rpc.getBlockNumber()]);
    if(Number(network.chainId)!==this.chainId)throw new Error("SAFE_CHAIN_MISMATCH");if(!receipt||receipt.status!==1)throw new Error("SAFE_EXECUTION_RECEIPT_FAILED");
    if(receipt.to?.toLowerCase()!==this.safeAddress)throw new Error("SAFE_EXECUTION_TARGET_MISMATCH");if(transaction.blockNumber!==null&&transaction.blockNumber!==receipt.blockNumber)throw new Error("SAFE_EXECUTION_REORG_DETECTED");if(latest-receipt.blockNumber+1<this.minimumConfirmations)throw new Error("SAFE_EXECUTION_NOT_FINAL");
    this.verifyLogs(receipt,input);const block=await this.rpc.getBlock(receipt.blockNumber);if(!block?.hash)throw new Error("SAFE_EXECUTION_BLOCK_MISSING");
    if(block.timestamp*1000>new Date(input.expiresAt).getTime())throw new Error("SAFE_EXECUTION_AFTER_PREFLIGHT_EXPIRY");
    return {blockHash:block.hash.toLowerCase(),observedAt:new Date(block.timestamp*1000).toISOString()};
  }
  private verifyLogs(receipt:TransactionReceipt,input:SafeReadInput){
    let success=false,authorized=false;
    for(const log of receipt.logs){
      if(log.address.toLowerCase()===this.safeAddress){try{const parsed=safeInterface.parseLog(log);if(parsed?.name==="ExecutionFailure"&&String(parsed.args.txHash).toLowerCase()===input.safeTxHash.toLowerCase())throw new Error("SAFE_EXECUTION_FAILURE_EVENT");if(parsed?.name==="ExecutionSuccess"&&String(parsed.args.txHash).toLowerCase()===input.safeTxHash.toLowerCase())success=true}catch(error){if(error instanceof Error&&error.message==="SAFE_EXECUTION_FAILURE_EVENT")throw error}}
      if(log.address.toLowerCase()===this.guardAddress){try{const parsed=guardInterface.parseLog(log);if(parsed?.name==="ActionAuthorized"&&String(parsed.args.actionId).toLowerCase()===input.actionId.toLowerCase())authorized=true}catch{/* unrelated Guard log */}}
    }
    if(!success)throw new Error("SAFE_EXECUTION_SUCCESS_EVENT_MISSING");if(!authorized)throw new Error("GUARD_AUTHORIZATION_EVENT_MISSING");
  }
}

export function createSafeTransactionAdapterFromEnvironment():SafeTransactionReadAdapter{
  const mode=(process.env.SAFE_TRANSACTION_ADAPTER??"mock").toLowerCase();if(mode==="mock")return new MockSafeTransactionReadAdapter();
  if(mode==="safe-service-readonly")return new SafeTransactionServiceReadAdapter(process.env.SAFE_TRANSACTION_SERVICE_URL??"",process.env.SAFE_RPC_URL??"",Number(process.env.SAFE_CHAIN_ID),process.env.SAFE_ADDRESS??"",process.env.TREASURY_GUARD_ADDRESS??"",Number(process.env.SAFE_CONFIRMATION_LAG??2),process.env.SAFE_TRANSACTION_SERVICE_API_KEY??"");
  throw new Error(`Unsupported SAFE_TRANSACTION_ADAPTER: ${mode}`);
}
