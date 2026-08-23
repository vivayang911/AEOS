import { createHash } from "node:crypto";
import { AbiCoder, keccak256 } from "ethers";
import { BLOCK_PROVER_ADDRESS, CREDITCOIN_TESTNET_CHAIN_ID, ETHEREUM_SEPOLIA_CHAIN_KEY, SEPOLIA_CHAIN_ID, SourceTransactionSnapshot, UscProofSnapshot, VerificationReceiptSnapshot, WalletTransactionRequest, buildUscVerificationRequest } from "./attestcoin-adapter";

export const canonicalLiveValue=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonicalLiveValue).join(",")}]`:value&&typeof value==="object"?`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonicalLiveValue(item)}`).join(",")}}`:JSON.stringify(value);
export const hashLiveValue=(value:unknown)=>`0x${createHash("sha256").update(canonicalLiveValue(value)).digest("hex")}`;
export const organizationCommitmentFor=(organizationId:string)=>keccak256(AbiCoder.defaultAbiCoder().encode(["string","string"],["aeos.organization.v1",organizationId]));

export type LiveArtifactBundle={step1:any;step4:any;step5:any;step6:any;step7:any};
export type ValidatedLiveReconciliation={organizationId:string;organizationCommitment:string;treasuryCommitment:string;provider:string;source:SourceTransactionSnapshot;proof:UscProofSnapshot;request:WalletTransactionRequest;receipt:VerificationReceiptSnapshot;sourceSnapshotHash:string;proofSnapshotHash:string;verificationRequestHash:string;verificationReceiptHash:string;verificationTransactionHash:string};

const equal=(left:unknown,right:unknown)=>canonicalLiveValue(left)===canonicalLiveValue(right);
const requireValue=(condition:unknown,code:string)=>{if(!condition)throw new Error(code)};

export function validateLiveAttestcoinReconciliation(organizationId:string,bundle:LiveArtifactBundle):ValidatedLiveReconciliation{
  requireValue(/^org_[A-Za-z0-9_-]{3,120}$/.test(organizationId),"LIVE_RECONCILIATION_ORGANIZATION_INVALID");
  const {step1,step4,step5,step6,step7}=bundle;
  requireValue(step1?.schemaVersion==="aeos.live-attestcoin-step.v1"&&step1.step===1&&step1.status==="PREPARED_UNSIGNED","LIVE_RECONCILIATION_STEP_1_INVALID");
  requireValue(step4?.schemaVersion==="aeos.live-attestcoin-step.v1"&&step4.step===4&&step4.status==="PROOF_VERIFIED","LIVE_RECONCILIATION_STEP_4_INVALID");
  requireValue(step5?.schemaVersion==="aeos.live-attestcoin-step.v1"&&step5.step===5&&step5.status==="VERIFICATION_PREPARED","LIVE_RECONCILIATION_STEP_5_INVALID");
  requireValue(step6?.schemaVersion==="aeos.live-attestcoin-step.v1"&&step6.step===6&&step6.status==="WALLET_SUBMITTED","LIVE_RECONCILIATION_STEP_6_INVALID");
  requireValue(step7?.schemaVersion==="aeos.live-attestcoin-step.v1"&&step7.step===7&&step7.status==="TRANSACTION_VERIFIED","LIVE_RECONCILIATION_STEP_7_INVALID");
  const organizationCommitment=organizationCommitmentFor(organizationId).toLowerCase();
  const commit=step1.commitRequest;
  requireValue(step1.tenantBinding==="SERVER_SELECTED_ORGANIZATION_COMMITMENT"&&step1.rawTenantIdentifiersDisclosed===false,"LIVE_RECONCILIATION_TENANT_BOUNDARY_INVALID");
  requireValue(commit?.observation?.organizationCommitment?.toLowerCase()===organizationCommitment,"LIVE_RECONCILIATION_ORGANIZATION_COMMITMENT_MISMATCH");
  requireValue(commit.chainId===SEPOLIA_CHAIN_ID&&commit.reporter===commit.unsignedTransaction.from&&commit.sourceContract===commit.unsignedTransaction.to&&commit.unsignedTransaction.value==="0","LIVE_RECONCILIATION_SOURCE_REQUEST_INVALID");
  requireValue(commit.signed===false&&commit.submitted===false&&commit.containsPrivateKey===false&&commit.aeosSigningCapability===false&&commit.aeosBroadcastCapability===false&&commit.assetExecutionAuthorized===false,"LIVE_RECONCILIATION_SOURCE_AUTHORITY_INVALID");
  const source=step4.source as SourceTransactionSnapshot,proof=step4.proof as UscProofSnapshot,request=step5.verificationRequest as WalletTransactionRequest,receipt=step7.receipt as VerificationReceiptSnapshot;
  requireValue(source.chainId===SEPOLIA_CHAIN_ID&&source.chainKey===ETHEREUM_SEPOLIA_CHAIN_KEY&&source.status===1&&source.from===commit.reporter&&source.to===commit.sourceContract&&source.value==="0"&&source.data===commit.unsignedTransaction.data,"LIVE_RECONCILIATION_SOURCE_SNAPSHOT_MISMATCH");
  requireValue(proof.chainKey===source.chainKey&&proof.headerNumber===source.blockNumber&&proof.txIndex===step5.expectedCall.transactionIndex&&proof.txHash===source.transactionHash,"LIVE_RECONCILIATION_PROOF_SOURCE_MISMATCH");
  requireValue(step4.verification?.proofSourceMatched===true&&step4.verification?.staticNativeVerificationPassed===true&&step4.verification?.signerCustody===false&&step4.verification?.broadcastCapability===false&&step4.verification?.assetExecutionAuthorized===false,"LIVE_RECONCILIATION_PROOF_BOUNDARY_INVALID");
  const expectedRequest=buildUscVerificationRequest(proof,commit.reporter);
  requireValue(equal(request,expectedRequest)&&request.chainId===CREDITCOIN_TESTNET_CHAIN_ID&&request.to===BLOCK_PROVER_ADDRESS.toLowerCase()&&request.value==="0x0","LIVE_RECONCILIATION_VERIFICATION_REQUEST_MISMATCH");
  const proofSnapshotHash=hashLiveValue(proof),verificationRequestHash=hashLiveValue(request);
  requireValue(step5.proofSnapshotHash===proofSnapshotHash&&step5.verificationRequestHash===verificationRequestHash,"LIVE_RECONCILIATION_FROZEN_HASH_MISMATCH");
  requireValue(step6.verificationRequestHash===verificationRequestHash&&step6.chainId===request.chainId&&step6.from===request.from&&step6.to===request.to&&step6.value===request.value,"LIVE_RECONCILIATION_WALLET_SUBMISSION_MISMATCH");
  requireValue(step6.walletConfirmed===true&&step6.signerCustody===false&&step6.broadcastCapability===false&&step6.assetExecutionAuthorized===false,"LIVE_RECONCILIATION_WALLET_BOUNDARY_INVALID");
  requireValue(step7.verificationRequestHash===verificationRequestHash&&step7.transactionHash===step6.transactionHash&&receipt.transactionHash===step6.transactionHash&&receipt.chainId===CREDITCOIN_TESTNET_CHAIN_ID&&receipt.status===1&&receipt.confirmations>=2,"LIVE_RECONCILIATION_RECEIPT_IDENTITY_MISMATCH");
  requireValue(receipt.canonicalBlockVerified===true&&receipt.calldataVerified===true&&receipt.zeroValueVerified===true&&receipt.transactionVerifiedEvent===true,"LIVE_RECONCILIATION_RECEIPT_GUARDRAILS_INVALID");
  requireValue(receipt.transactionVerified.chainKey===proof.chainKey&&receipt.transactionVerified.height===proof.headerNumber&&receipt.transactionVerified.transactionIndex===proof.txIndex,"LIVE_RECONCILIATION_EVENT_MISMATCH");
  requireValue(step7.controls?.immutableEvidenceCreated===false&&step7.controls?.signerCustody===false&&step7.controls?.broadcastCapability===false&&step7.controls?.assetExecutionAuthorized===false&&step7.truthBoundary?.verifiedClaim==="SOURCE_TRANSACTION_INCLUSION"&&step7.truthBoundary?.payloadEconomicTruthVerified===false,"LIVE_RECONCILIATION_TRUTH_BOUNDARY_INVALID");
  return{organizationId,organizationCommitment,treasuryCommitment:commit.observation.treasuryCommitment.toLowerCase(),provider:step4.provider,source,proof,request,receipt,sourceSnapshotHash:hashLiveValue(source),proofSnapshotHash,verificationRequestHash,verificationReceiptHash:hashLiveValue(receipt),verificationTransactionHash:receipt.transactionHash};
}

export function assertLiveReceiptMatchesFrozen(frozen:VerificationReceiptSnapshot,observed:VerificationReceiptSnapshot){
  const identity=(value:VerificationReceiptSnapshot)=>({chainId:value.chainId,transactionHash:value.transactionHash,blockNumber:value.blockNumber,blockHash:value.blockHash,from:value.from,to:value.to,status:value.status,canonicalBlockVerified:value.canonicalBlockVerified,calldataVerified:value.calldataVerified,zeroValueVerified:value.zeroValueVerified,transactionVerifiedEvent:value.transactionVerifiedEvent,transactionVerified:value.transactionVerified});
  requireValue(equal(identity(frozen),identity(observed))&&observed.confirmations>=frozen.confirmations,"LIVE_RECONCILIATION_CANONICAL_RECEIPT_MISMATCH");
}
