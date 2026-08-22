import { JsonRpcProvider } from "ethers";
import { CREDITCOIN_TESTNET_CHAIN_ID } from "./attestcoin-adapter";
import { EvidenceAnchorManifest, parseAndValidateEvidenceAnchoredLog } from "./evidence-anchor-engine";

export const EVIDENCE_ANCHOR_RECEIPT_ADAPTER=Symbol("EVIDENCE_ANCHOR_RECEIPT_ADAPTER");
export type PreviousAnchorConfirmation={transactionHash:string;blockNumber:number;blockHash:string};
export type EvidenceAnchorConfirmationSnapshot={
  schemaVersion:"evidence.anchor.confirmation.v1";chainId:number;transactionHash:string;blockNumber:number;blockHash:string;
  from:string;to:string;status:1;confirmations:number;minimumConfirmations:number;observedAt:string;
  commitmentId:string;decisionKey:string;snapshotHash:string;eventVerified:true;calldataVerified:true;zeroValueVerified:true;
  signerCustody:false;broadcastCapability:false;assetExecutionAuthorized:false;
};
export interface EvidenceAnchorReceiptAdapter{readonly mode:"mock"|"rpc-readonly";readonly provider:string;configuration():Record<string,unknown>;inspect(transactionHash:string,manifest:EvidenceAnchorManifest,previous?:PreviousAnchorConfirmation|null):Promise<EvidenceAnchorConfirmationSnapshot>}

export class MockEvidenceAnchorReceiptAdapter implements EvidenceAnchorReceiptAdapter{
  readonly mode="mock" as const;readonly provider="mock-evidence-anchor-receipt-v1";
  configuration(){return{mode:this.mode,provider:this.provider,readsOnly:true,configured:false,signerCustody:false,broadcastCapability:false,assetExecutionAuthorized:false,warning:"Mock adapter cannot confirm an on-chain Evidence Anchor"}}
  async inspect():Promise<EvidenceAnchorConfirmationSnapshot>{throw new Error("EVIDENCE_ANCHOR_RECEIPT_ADAPTER_NOT_CONFIGURED")}
}

export class RpcEvidenceAnchorReceiptAdapter implements EvidenceAnchorReceiptAdapter{
  readonly mode="rpc-readonly" as const;readonly provider="creditcoin-evidence-anchor-rpc-readonly-v1";private readonly rpc:JsonRpcProvider;
  constructor(rpcUrl:string,readonly minimumConfirmations=2){if(!rpcUrl||!Number.isSafeInteger(minimumConfirmations)||minimumConfirmations<1||minimumConfirmations>100)throw new Error("Valid Creditcoin RPC and confirmation policy are required");this.rpc=new JsonRpcProvider(rpcUrl,CREDITCOIN_TESTNET_CHAIN_ID,{staticNetwork:true})}
  configuration(){return{mode:this.mode,provider:this.provider,chainId:CREDITCOIN_TESTNET_CHAIN_ID,minimumConfirmations:this.minimumConfirmations,readsOnly:true,signerCustody:false,broadcastCapability:false,assetExecutionAuthorized:false}}
  async inspect(transactionHash:string,manifest:EvidenceAnchorManifest,previous?:PreviousAnchorConfirmation|null):Promise<EvidenceAnchorConfirmationSnapshot>{
    const txHash=transactionHash.toLowerCase();const [network,transaction,receipt,latest]=await Promise.all([this.rpc.getNetwork(),this.rpc.getTransaction(txHash),this.rpc.getTransactionReceipt(txHash),this.rpc.getBlockNumber()]);
    if(Number(network.chainId)!==CREDITCOIN_TESTNET_CHAIN_ID)throw new Error("EVIDENCE_ANCHOR_CHAIN_MISMATCH");
    if(!transaction||!receipt){if(previous)throw new Error("EVIDENCE_ANCHOR_REORG_DETECTED");throw new Error("EVIDENCE_ANCHOR_TRANSACTION_NOT_FINALIZED")}
    if(receipt.status!==1)throw new Error("EVIDENCE_ANCHOR_RECEIPT_FAILED");
    if(transaction.hash.toLowerCase()!==txHash||receipt.hash.toLowerCase()!==txHash)throw new Error("EVIDENCE_ANCHOR_TRANSACTION_HASH_MISMATCH");
    if(transaction.from.toLowerCase()!==manifest.requester||transaction.to?.toLowerCase()!==manifest.ascAddress||transaction.data.toLowerCase()!==manifest.transaction.data.toLowerCase()||transaction.value!==0n)throw new Error("EVIDENCE_ANCHOR_TRANSACTION_MISMATCH");
    if(receipt.from.toLowerCase()!==manifest.requester||receipt.to?.toLowerCase()!==manifest.ascAddress)throw new Error("EVIDENCE_ANCHOR_RECEIPT_IDENTITY_MISMATCH");
    const confirmations=latest-receipt.blockNumber+1;if(confirmations<this.minimumConfirmations)throw new Error("EVIDENCE_ANCHOR_NOT_FINAL");
    const block=await this.rpc.getBlock(receipt.blockNumber);if(!block?.hash||block.hash.toLowerCase()!==receipt.blockHash.toLowerCase())throw new Error(previous?"EVIDENCE_ANCHOR_REORG_DETECTED":"EVIDENCE_ANCHOR_BLOCK_MISMATCH");
    if(previous&&(previous.transactionHash.toLowerCase()!==txHash||previous.blockNumber!==receipt.blockNumber||previous.blockHash.toLowerCase()!==receipt.blockHash.toLowerCase()))throw new Error("EVIDENCE_ANCHOR_REORG_DETECTED");
    let event=null;for(const log of receipt.logs){const parsed=parseAndValidateEvidenceAnchoredLog(log,manifest);if(parsed){if(event)throw new Error("EVIDENCE_ANCHOR_DUPLICATE_EVENT");event=parsed}}
    if(!event)throw new Error("EVIDENCE_ANCHOR_EVENT_MISSING");
    return{schemaVersion:"evidence.anchor.confirmation.v1",chainId:CREDITCOIN_TESTNET_CHAIN_ID,transactionHash:txHash,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash.toLowerCase(),from:transaction.from.toLowerCase(),to:manifest.ascAddress,status:1,confirmations,minimumConfirmations:this.minimumConfirmations,observedAt:new Date(block.timestamp*1000).toISOString(),commitmentId:manifest.commitmentId,decisionKey:manifest.decisionKey,snapshotHash:manifest.evidenceSnapshotHash,eventVerified:true,calldataVerified:true,zeroValueVerified:true,signerCustody:false,broadcastCapability:false,assetExecutionAuthorized:false};
  }
}
export function createEvidenceAnchorReceiptAdapterFromEnvironment():EvidenceAnchorReceiptAdapter{const mode=(process.env.EVIDENCE_ANCHOR_RECEIPT_ADAPTER??"mock").toLowerCase();if(mode==="mock")return new MockEvidenceAnchorReceiptAdapter();if(mode==="rpc-readonly")return new RpcEvidenceAnchorReceiptAdapter(process.env.CREDITCOIN_RPC_URL??"",Number(process.env.EVIDENCE_ANCHOR_MIN_CONFIRMATIONS??2));throw new Error(`Unsupported EVIDENCE_ANCHOR_RECEIPT_ADAPTER: ${mode}`)}
