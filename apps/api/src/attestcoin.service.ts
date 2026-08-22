import { createHash, randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { PoolClient } from "pg";
import { ATTESTCOIN_ADAPTER, AttestcoinAdapter, CREDITCOIN_TESTNET_CHAIN_ID, SEPOLIA_CHAIN_ID, SourceTransactionSnapshot, UscProofSnapshot, WalletTransactionRequest } from "./attestcoin-adapter";
import { CreateAttestcoinJobDto } from "./attestcoin.dto";
import { DatabaseService } from "./database.service";
import { AttestcoinReliabilityService } from "./attestcoin-reliability.service";
import { persistEvidenceClassification } from "./evidence-classification";
import { buildEvidenceAnchorManifest } from "./evidence-anchor-engine";
import { EVIDENCE_ANCHOR_RECEIPT_ADAPTER, EvidenceAnchorReceiptAdapter } from "./evidence-anchor-adapter";

const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}` : JSON.stringify(value);
const hash = (value: unknown) => `0x${createHash("sha256").update(canonical(value)).digest("hex")}`;
const makeId = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;
const safeCode = (error: unknown) => (error instanceof Error ? error.message : "UNKNOWN_ERROR").split(":", 1)[0].replace(/[^A-Z0-9_]/gi, "_").slice(0, 80).toUpperCase();

@Injectable()
export class AttestcoinService {
  constructor(private readonly db: DatabaseService, @Inject(ATTESTCOIN_ADAPTER) private readonly adapter: AttestcoinAdapter, private readonly reliability: AttestcoinReliabilityService,@Inject(EVIDENCE_ANCHOR_RECEIPT_ADAPTER) private readonly anchorReceipt:EvidenceAnchorReceiptAdapter) {}

  configuration() { return this.adapter.configuration(); }
  async health(org: string) { return { adapter: await this.adapter.health(), reliability: await this.reliability.health(org, this.adapter.provider), assetExecutionAuthorized: false }; }
  async sourceChains(org: string) { return this.adapter.mode === "usc" ? this.reliability.execute(org, this.adapter.provider, "readSourceChains", () => this.adapter.sourceChainStatus()) : this.adapter.sourceChainStatus(); }

  async create(org: string, input: CreateAttestcoinJobDto) {
    const txHash = input.sourceTransactionHash.toLowerCase();
    const existing = await this.findBySource(org, txHash);
    if (existing) {
      if (existing.requester_wallet !== input.requesterWallet.toLowerCase()) throw new ConflictException("Source transaction is already bound to a different requester wallet");
      return this.map(existing);
    }
    const source = await this.reliability.execute(org, this.adapter.provider, "inspectSourceTransaction", () => this.adapter.inspectSourceTransaction(txHash));
    if (source.chainId !== SEPOLIA_CHAIN_ID || source.transactionHash !== txHash || source.status !== 1) throw new BadRequestException("Source transaction failed deterministic validation");
    return this.db.transaction(async (client) => {
      await client.query("INSERT INTO organizations(id,name) VALUES($1,$2) ON CONFLICT(id) DO NOTHING", [org, "AEOS DAO"]);
      const jobId = makeId("uscjob");
      const saved = await client.query("INSERT INTO attestcoin_proof_jobs(id,organization_id,adapter,source_chain_id,source_chain_key,source_tx_hash,requester_wallet,status,source_snapshot,source_snapshot_hash) VALUES($1,$2,$3,$4,$5,$6,$7,'RECEIPT_VERIFIED',$8,$9) ON CONFLICT(organization_id,source_chain_id,source_tx_hash) DO NOTHING RETURNING *", [jobId, org, this.adapter.provider, source.chainId, source.chainKey, txHash, input.requesterWallet.toLowerCase(), source, hash(source)]);
      const row = saved.rowCount ? saved.rows[0] : (await client.query("SELECT * FROM attestcoin_proof_jobs WHERE organization_id=$1 AND source_chain_id=$2 AND source_tx_hash=$3", [org, SEPOLIA_CHAIN_ID, txHash])).rows[0];
      if (saved.rowCount) await this.audit(client, org, "attestcoin.source_receipt_verified", row.id, { chainId:source.chainId,sourceTransactionHash: txHash,blockNumber:source.blockNumber,blockHash:source.blockHash,from:source.from,to:source.to,sourceSnapshotHash: row.source_snapshot_hash });
      return this.map(row);
    });
  }

  async get(org: string, jobId: string) { return this.map(await this.requireJob(org, jobId)); }
  async list(org: string) { const result = await this.db.query("SELECT * FROM attestcoin_proof_jobs WHERE organization_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100", [org]); return { items: result.rows.map((row) => this.map(row)) }; }

  async requestProof(org: string, jobId: string) {
    const job = await this.requireJob(org, jobId);
    if (job.proof_snapshot) return this.map(job);
    let proof: UscProofSnapshot;
    try { proof = await this.reliability.execute(org, this.adapter.provider, "fetchAndVerifyProof", () => this.adapter.fetchAndVerifyProof(job.source_snapshot as SourceTransactionSnapshot)); }
    catch (error) {
      if (error instanceof ServiceUnavailableException) { const response = error.getResponse() as any; const code = safeCode(response?.code ?? error); await this.db.query("UPDATE attestcoin_proof_jobs SET status='ATTESTATION_PENDING',last_error_code=$3,updated_at=now() WHERE organization_id=$1 AND id=$2 AND proof_snapshot IS NULL", [org, jobId, code]); throw error; }
      const code = safeCode(error);
      if (code === "PROOF_NOT_READY") {
        await this.db.query("UPDATE attestcoin_proof_jobs SET status='ATTESTATION_PENDING',last_error_code=$3,updated_at=now() WHERE organization_id=$1 AND id=$2 AND proof_snapshot IS NULL", [org, jobId, code]);
        throw new ServiceUnavailableException({ message: "Attestation or proof is not ready", code, retryable: true });
      }
      await this.quarantineInvalidProof(org, job, code);
      throw new BadRequestException({ message: "Proof failed deterministic validation and was quarantined", code, retryable: false });
    }
    const proofHash = hash(proof);
    return this.db.transaction(async (client) => {
      const saved = await client.query("UPDATE attestcoin_proof_jobs SET proof_snapshot=$3,proof_snapshot_hash=$4,status='PROOF_READY',last_error_code=NULL,updated_at=now() WHERE organization_id=$1 AND id=$2 AND proof_snapshot IS NULL RETURNING *", [org, jobId, proof, proofHash]);
      const row = saved.rowCount ? saved.rows[0] : (await client.query("SELECT * FROM attestcoin_proof_jobs WHERE organization_id=$1 AND id=$2", [org, jobId])).rows[0];
      if (saved.rowCount) await this.audit(client, org, "attestcoin.proof_verified", jobId, { proofSnapshotHash: proofHash, sourceTransactionHash: job.source_tx_hash });
      return this.map(row);
    });
  }

  async prepareVerification(org: string, jobId: string) {
    const job = await this.requireJob(org, jobId);
    if (!job.proof_snapshot) throw new BadRequestException("Proof must be ready before preparing verification");
    if (job.verification_request) return this.map(job);
    const request = this.adapter.buildVerificationRequest(job.proof_snapshot as UscProofSnapshot, job.requester_wallet);
    const requestHash = hash(request);
    return this.db.transaction(async (client) => {
      const saved = await client.query("UPDATE attestcoin_proof_jobs SET verification_request=$3,verification_request_hash=$4,status='VERIFICATION_PREPARED',updated_at=now() WHERE organization_id=$1 AND id=$2 AND verification_request IS NULL RETURNING *", [org, jobId, request, requestHash]);
      const row = saved.rowCount ? saved.rows[0] : (await client.query("SELECT * FROM attestcoin_proof_jobs WHERE organization_id=$1 AND id=$2", [org, jobId])).rows[0];
      if (saved.rowCount) await this.audit(client, org, "attestcoin.wallet_transaction_prepared", jobId, { verificationRequestHash: requestHash, signerCustody: false, assetExecutionAuthorized: false });
      return this.map(row);
    });
  }

  async prepareEvidenceAnchor(org:string,jobId:string,decisionId:string){
    const job=await this.requireJob(org,jobId);
    if(!job.proof_snapshot)throw new BadRequestException("Proof must be ready before preparing an Evidence Anchor");
    const ascAddress=process.env.EVIDENCE_ANCHOR_ASC_ADDRESS;
    if(!ascAddress)throw new ServiceUnavailableException({message:"Evidence Anchor ASC is not configured",code:"EVIDENCE_ANCHOR_ASC_NOT_CONFIGURED"});
    const decision=await this.db.query("SELECT d.id,d.output_hash,d.evidence_snapshot_id,s.manifest_hash FROM decisions d JOIN evidence_snapshots s ON s.id=d.evidence_snapshot_id AND s.organization_id=d.organization_id WHERE d.organization_id=$1 AND d.id=$2",[org,decisionId]);
    if(!decision.rowCount)throw new NotFoundException("Decision not found");
    let manifest;
    try{manifest=buildEvidenceAnchorManifest({ascAddress,requester:job.requester_wallet,decisionId:decision.rows[0].id,decisionOutputHash:decision.rows[0].output_hash,evidenceSnapshotId:decision.rows[0].evidence_snapshot_id,evidenceSnapshotHash:decision.rows[0].manifest_hash,proof:job.proof_snapshot as UscProofSnapshot})}
    catch(error){throw new BadRequestException(error instanceof Error?error.message:"INVALID_EVIDENCE_ANCHOR_HANDOFF")}
    const manifestHash=hash(manifest);
    return this.db.transaction(async(client)=>{
      const saved=await client.query("INSERT INTO evidence_anchor_handoffs(id,organization_id,attestcoin_proof_job_id,decision_id,evidence_snapshot_id,requester_wallet,asc_address,commitment_id,manifest,manifest_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(organization_id,attestcoin_proof_job_id,decision_id) DO NOTHING RETURNING *",[makeId("anchorhandoff"),org,job.id,manifest.decisionId,manifest.evidenceSnapshotId,manifest.requester,manifest.ascAddress,manifest.commitmentId,manifest,manifestHash]);
      const row=saved.rowCount?saved.rows[0]:(await client.query("SELECT * FROM evidence_anchor_handoffs WHERE organization_id=$1 AND attestcoin_proof_job_id=$2 AND decision_id=$3",[org,job.id,decisionId])).rows[0];
      if(!row||row.manifest_hash!==manifestHash)throw new ConflictException("Evidence Anchor handoff already exists with different frozen input");
      if(saved.rowCount)await this.audit(client,org,"attestcoin.evidence_anchor_handoff_prepared",row.id,{jobId:job.id,decisionId,commitmentId:manifest.commitmentId,manifestHash,chainId:manifest.transaction.chainId,ascAddress:manifest.ascAddress,requester:manifest.requester,signed:false,submitted:false,assetExecutionAuthorized:false});
      return this.mapEvidenceAnchorHandoff(row);
    });
  }

  async confirmEvidenceAnchor(org:string,handoffId:string,transactionHash:string){
    const txHash=transactionHash.toLowerCase();const handoffResult=await this.db.query("SELECT * FROM evidence_anchor_handoffs WHERE organization_id=$1 AND id=$2",[org,handoffId]);if(!handoffResult.rowCount)throw new NotFoundException("Evidence Anchor handoff not found");const handoff=handoffResult.rows[0];
    const confirmed=await this.db.query("SELECT * FROM evidence_anchor_confirmations WHERE organization_id=$1 AND handoff_id=$2",[org,handoffId]);const previous=confirmed.rows[0]??null;
    if(previous&&previous.transaction_hash!==txHash){await this.recordAnchorAttempt(org,handoff,txHash,"REJECTED","EVIDENCE_ANCHOR_TRANSACTION_IDENTITY_CANNOT_CHANGE",null);throw new ConflictException("EVIDENCE_ANCHOR_TRANSACTION_IDENTITY_CANNOT_CHANGE")}
    let snapshot;try{snapshot=await this.reliability.execute(org,this.anchorReceipt.provider,"inspectEvidenceAnchorTransaction",()=>this.anchorReceipt.inspect(txHash,handoff.manifest,previous?{transactionHash:previous.transaction_hash,blockNumber:Number(previous.block_number),blockHash:previous.block_hash}:null))}
    catch(error){const code=safeCode(error);await this.recordAnchorAttempt(org,handoff,txHash,code.includes("NOT_FINAL")||code.includes("NOT_CONFIGURED")||code.includes("TIMEOUT")?"RETRYABLE":"REJECTED",code,null);if(code.includes("NOT_FINAL")||code.includes("NOT_CONFIGURED")||code.includes("TIMEOUT"))throw new ServiceUnavailableException({message:"Evidence Anchor confirmation is not ready",code,retryable:true});throw new BadRequestException({message:"Evidence Anchor confirmation failed closed",code,retryable:false})}
    return this.db.transaction(async(client)=>{await client.query("SELECT 1 FROM evidence_anchor_handoffs WHERE organization_id=$1 AND id=$2 FOR UPDATE",[org,handoffId]);const existing=await client.query("SELECT * FROM evidence_anchor_confirmations WHERE organization_id=$1 AND handoff_id=$2",[org,handoffId]);let row;if(existing.rowCount){row=existing.rows[0];if(row.transaction_hash!==snapshot.transactionHash||Number(row.block_number)!==snapshot.blockNumber||row.block_hash!==snapshot.blockHash)throw new ConflictException("EVIDENCE_ANCHOR_REORG_DETECTED")}else{const snapshotHash=hash(snapshot);const saved=await client.query("INSERT INTO evidence_anchor_confirmations(id,organization_id,handoff_id,attestcoin_proof_job_id,decision_id,evidence_snapshot_id,commitment_id,transaction_hash,block_number,block_hash,snapshot,snapshot_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *",[makeId("anchorconfirm"),org,handoffId,handoff.attestcoin_proof_job_id,handoff.decision_id,handoff.evidence_snapshot_id,handoff.commitment_id,snapshot.transactionHash,snapshot.blockNumber,snapshot.blockHash,snapshot,snapshotHash]);row=saved.rows[0];await this.audit(client,org,"attestcoin.evidence_anchor_confirmed",row.id,{handoffId,decisionId:row.decision_id,evidenceSnapshotId:row.evidence_snapshot_id,commitmentId:row.commitment_id,chainId:snapshot.chainId,transactionHash:row.transaction_hash,blockNumber:Number(row.block_number),blockHash:row.block_hash,eventVerified:true,calldataVerified:true,zeroValueVerified:true,assetExecutionAuthorized:false})}const attempt=await this.insertAnchorAttempt(client,org,handoff,txHash,"CONFIRMED",null,row.id);return{...this.mapEvidenceAnchorConfirmation(row),attempt:this.mapAnchorAttempt(attempt)}})
  }

  private async recordAnchorAttempt(org:string,handoff:any,txHash:string,outcome:string,errorCode:string|null,confirmationId:string|null){return this.db.transaction(client=>this.insertAnchorAttempt(client,org,handoff,txHash,outcome,errorCode,confirmationId))}
  private async insertAnchorAttempt(client:PoolClient,org:string,handoff:any,txHash:string,outcome:string,errorCode:string|null,confirmationId:string|null){const latest=await client.query("SELECT ordinal FROM evidence_anchor_confirmation_attempts WHERE organization_id=$1 AND handoff_id=$2 ORDER BY ordinal DESC LIMIT 1",[org,handoff.id]);const ordinal=latest.rowCount?Number(latest.rows[0].ordinal)+1:1;const payload={schemaVersion:"evidence.anchor.confirmation-attempt.v1",handoffId:handoff.id,decisionId:handoff.decision_id,commitmentId:handoff.commitment_id,transactionHash:txHash,ordinal,outcome,errorCode,confirmationId,adapter:this.anchorReceipt.provider,readOnly:true,automaticSubmission:false,assetExecutionAuthorized:false};const saved=await client.query("INSERT INTO evidence_anchor_confirmation_attempts(id,organization_id,handoff_id,ordinal,transaction_hash,adapter,outcome,error_code,confirmation_id,payload,payload_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *",[makeId("anchorattempt"),org,handoff.id,ordinal,txHash,this.anchorReceipt.provider,outcome,errorCode,confirmationId,payload,hash(payload)]);await this.audit(client,org,"attestcoin.evidence_anchor_confirmation_attempted",saved.rows[0].id,{handoffId:handoff.id,ordinal,outcome,errorCode,confirmationId,transactionHash:txHash,readOnly:true,automaticSubmission:false,assetExecutionAuthorized:false});return saved.rows[0]}

  async confirmVerification(org: string, jobId: string, verificationTxHash: string) {
    const job = await this.requireJob(org, jobId);
    if (job.status === "VERIFIED") return this.map(job);
    if (!job.verification_request) throw new BadRequestException("Verification transaction must be prepared first");
    const receipt = await this.reliability.execute(org, this.adapter.provider, "inspectVerificationTransaction", () => this.adapter.inspectVerificationTransaction(verificationTxHash.toLowerCase(), job.verification_request as WalletTransactionRequest));
    return this.persistVerifiedEvidence(org, job, receipt);
  }

  private async persistVerifiedEvidence(org: string, job: any, receipt: unknown) {
    return this.db.transaction(async (client) => {
      const locked = await client.query("SELECT * FROM attestcoin_proof_jobs WHERE organization_id=$1 AND id=$2 FOR UPDATE", [org, job.id]);
      if (!locked.rowCount) throw new NotFoundException("Attestcoin proof job not found");
      if (locked.rows[0].status === "VERIFIED") return this.map(locked.rows[0]);
      const source = locked.rows[0].source_snapshot as SourceTransactionSnapshot;
      const rawPayload = { source, proofSnapshotHash: locked.rows[0].proof_snapshot_hash, verificationReceipt: receipt };
      const rawHash = hash(rawPayload);
      const rawId = makeId("raw");
      const raw = await client.query("INSERT INTO raw_attestations(id,organization_id,provider,chain_id,payload,content_hash) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(organization_id,content_hash) DO UPDATE SET content_hash=EXCLUDED.content_hash RETURNING id", [rawId, org, this.adapter.provider, source.chainId, rawPayload, rawHash]);
      const fact = { subject: { type: "transaction", id: `eip155:${source.chainId}:${source.transactionHash}` }, predicate: "blockchain.transaction.included", value: { transactionHash: source.transactionHash, from: source.from, to: source.to, value: source.value }, chain: { id: source.chainId, blockNumber: source.blockNumber, blockHash: source.blockHash }, source: { provider: this.adapter.provider, reference: raw.rows[0].id, proofSnapshotHash: locked.rows[0].proof_snapshot_hash, verificationRequestHash: locked.rows[0].verification_request_hash }, verificationStatus: "VERIFIED", observedAt: source.observedAt };
      const factHash = hash(fact);
      const expiresAt = new Date(new Date(source.observedAt).getTime() + 24 * 60 * 60 * 1000);
      const freshness = expiresAt.getTime() > Date.now() ? "FRESH" : "STALE";
      const quality = { proofStrength: 35, sourceReliability: 20, freshness: freshness === "FRESH" ? 20 : 0, completeness: 15, consistency: 10 };
      const evidenceId = makeId("ev");
      const evidence = await client.query("INSERT INTO evidence(id,organization_id,raw_attestation_id,subject,predicate,value,chain,source,verification_status,freshness_status,freshness_expires_at,quality_score,quality_components,observed_at,content_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'VERIFIED',$9,$10,$11,$12,$13,$14) ON CONFLICT(organization_id,content_hash) DO UPDATE SET content_hash=EXCLUDED.content_hash RETURNING id", [evidenceId, org, raw.rows[0].id, fact.subject, fact.predicate, fact.value, fact.chain, fact.source, freshness, expiresAt.toISOString(), Object.values(quality).reduce((sum, value) => sum + value, 0), quality, source.observedAt, factHash]);
      const classification=await persistEvidenceClassification(client,org,{id:evidence.rows[0].id,contentHash:factHash,subject:fact.subject,predicate:fact.predicate,value:fact.value,source:fact.source,verificationStatus:"VERIFIED"});
      const receiptHash = hash(receipt);
      const updated = await client.query("UPDATE attestcoin_proof_jobs SET verification_receipt=$3,verification_receipt_hash=$4,verification_tx_hash=$5,evidence_id=$6,status='VERIFIED',last_error_code=NULL,updated_at=now() WHERE organization_id=$1 AND id=$2 RETURNING *", [org, job.id, receipt, receiptHash, (receipt as any).transactionHash, evidence.rows[0].id]);
      await this.audit(client, org, "attestcoin.evidence_verified", job.id, { chainId:CREDITCOIN_TESTNET_CHAIN_ID,verificationTransactionHash:(receipt as any).transactionHash,blockNumber:(receipt as any).blockNumber,blockHash:(receipt as any).blockHash,from:(receipt as any).from,to:(receipt as any).to,evidenceId: evidence.rows[0].id, verificationReceiptHash: receiptHash, contentHash: factHash,classificationHash:classification.classificationHash,classificationLabels:classification.labels,classificationRoutes:classification.routes });
      return this.map(updated.rows[0]);
    });
  }

  private async findBySource(org: string, txHash: string) { const result = await this.db.query("SELECT * FROM attestcoin_proof_jobs WHERE organization_id=$1 AND source_chain_id=$2 AND source_tx_hash=$3", [org, SEPOLIA_CHAIN_ID, txHash]); return result.rows[0] ?? null; }
  private async quarantineInvalidProof(org: string, job: any, code: string) {
    await this.db.transaction(async (client) => {
      const payload = { sourceSnapshot: job.source_snapshot, reasonCode: code, adapter: this.adapter.provider };
      const payloadHash = hash(payload);
      const raw = await client.query("INSERT INTO raw_attestations(id,organization_id,provider,chain_id,payload,content_hash,verification_error) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(organization_id,content_hash) DO UPDATE SET content_hash=EXCLUDED.content_hash RETURNING id", [makeId("raw"), org, this.adapter.provider, SEPOLIA_CHAIN_ID, payload, payloadHash, code]);
      const quarantineId = makeId("quarantine");
      await client.query("INSERT INTO evidence_quarantine(id,organization_id,raw_attestation_id,reason_code,details,payload_hash) VALUES($1,$2,$3,$4,$5,$6)", [quarantineId, org, raw.rows[0].id, code, { adapter: this.adapter.provider, jobId: job.id }, payloadHash]);
      await client.query("UPDATE attestcoin_proof_jobs SET status='REJECTED',last_error_code=$3,updated_at=now() WHERE organization_id=$1 AND id=$2 AND proof_snapshot IS NULL", [org, job.id, code]);
      await this.audit(client, org, "attestcoin.proof_rejected", job.id, { quarantineId, reasonCode: code, payloadHash });
    });
  }
  private async requireJob(org: string, jobId: string) { const result = await this.db.query("SELECT * FROM attestcoin_proof_jobs WHERE organization_id=$1 AND id=$2", [org, jobId]); if (!result.rowCount) throw new NotFoundException("Attestcoin proof job not found"); return result.rows[0]; }
  private async audit(client: PoolClient, org: string, eventType: string, objectId: string, data: unknown) { const payload = { eventType, organizationId: org, objectType: "attestcoin_proof_job", objectId, data }; await client.query("INSERT INTO audit_events(id,organization_id,event_type,actor,action,object_type,object_id,data,payload_hash) VALUES($1,$2,$3,$4,$5,'attestcoin_proof_job',$6,$7,$8)", [makeId("audit"), org, eventType, { type: "adapter", id: this.adapter.provider }, eventType, objectId, data, hash(payload)]); }
  private map(row: any) { return { id: row.id, organizationId: row.organization_id, adapter: row.adapter, sourceChainId: row.source_chain_id, sourceChainKey: row.source_chain_key, sourceTransactionHash: row.source_tx_hash, requesterWallet: row.requester_wallet, status: row.status, sourceSnapshot: row.source_snapshot, sourceSnapshotHash: row.source_snapshot_hash, proofSnapshotHash: row.proof_snapshot_hash, verificationRequest: row.verification_request, verificationRequestHash: row.verification_request_hash, verificationTransactionHash: row.verification_tx_hash, verificationReceiptHash: row.verification_receipt_hash, evidenceId: row.evidence_id, lastErrorCode: row.last_error_code, createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined, updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined }; }
  private mapEvidenceAnchorHandoff(row:any){return{id:row.id,organizationId:row.organization_id,attestcoinProofJobId:row.attestcoin_proof_job_id,decisionId:row.decision_id,evidenceSnapshotId:row.evidence_snapshot_id,requesterWallet:row.requester_wallet,ascAddress:row.asc_address,commitmentId:row.commitment_id,manifest:row.manifest,manifestHash:row.manifest_hash,createdAt:new Date(row.created_at).toISOString(),signerCustody:false,broadcastCapability:false,assetExecutionAuthorized:false}}
  private mapEvidenceAnchorConfirmation(row:any){return{id:row.id,organizationId:row.organization_id,handoffId:row.handoff_id,attestcoinProofJobId:row.attestcoin_proof_job_id,decisionId:row.decision_id,evidenceSnapshotId:row.evidence_snapshot_id,commitmentId:row.commitment_id,transactionHash:row.transaction_hash,blockNumber:Number(row.block_number),blockHash:row.block_hash,snapshot:row.snapshot,snapshotHash:row.snapshot_hash,createdAt:new Date(row.created_at).toISOString(),signerCustody:false,broadcastCapability:false,assetExecutionAuthorized:false}}
  private mapAnchorAttempt(row:any){return{id:row.id,organizationId:row.organization_id,handoffId:row.handoff_id,ordinal:Number(row.ordinal),transactionHash:row.transaction_hash,adapter:row.adapter,outcome:row.outcome,errorCode:row.error_code,confirmationId:row.confirmation_id,payload:row.payload,payloadHash:row.payload_hash,createdAt:new Date(row.created_at).toISOString(),automaticSubmission:false,assetExecutionAuthorized:false}}
}
