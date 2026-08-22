import { createHash, randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { PoolClient } from "pg";
import { DatabaseService } from "./database.service";
import { GOVERNANCE_ADAPTER, GovernanceObservationAdapter } from "./governance-adapter";
import { MockGovernanceObservationDto } from "./governance.dto";
import { GovernanceState, validateGovernanceTransition } from "./governance-engine";

const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}` : JSON.stringify(value);
const hash = (value: unknown) => `0x${createHash("sha256").update(canonical(value)).digest("hex")}`;
const makeId = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;

@Injectable()
export class GovernanceService {
  constructor(private readonly db: DatabaseService, @Inject(GOVERNANCE_ADAPTER) private readonly adapter: GovernanceObservationAdapter) {}
  configuration() { return this.adapter.configuration(); }

  async observeMock(org: string, proposalId: string, input: MockGovernanceObservationDto) {
    if (this.adapter.mode !== "mock") throw new BadRequestException("Mock observations are disabled for the active governance adapter");
    return this.persist(org, proposalId, this.adapter.normalize(input) as any, false);
  }

  async sync(org: string, proposalId: string) {
    if (!this.adapter.readProposal) throw new ServiceUnavailableException("Read-only Governor adapter is not configured");
    const proposal = await this.db.query("SELECT content FROM proposals WHERE organization_id=$1 AND id=$2", [org, proposalId]);
    if (!proposal.rowCount) throw new NotFoundException("Proposal not found");
    let normalized;
    try { normalized = await this.adapter.readProposal(proposal.rows[0].content); }
    catch (error) { throw new ServiceUnavailableException({ message: "Governor state read failed", code: error instanceof Error ? error.message : "GOVERNOR_READ_FAILED" }); }
    return this.persist(org, proposalId, normalized as any, true);
  }

  private async persist(org: string, proposalId: string, initial: any, allowOnchainBootstrap: boolean) {
    return this.db.transaction(async (client) => {
      const proposal = await client.query("SELECT * FROM proposals WHERE organization_id=$1 AND id=$2 FOR UPDATE", [org, proposalId]);
      if (!proposal.rowCount) throw new NotFoundException("Proposal not found");
      const latestResult = await client.query("SELECT * FROM proposal_state_observations WHERE organization_id=$1 AND proposal_id=$2 ORDER BY ordinal DESC LIMIT 1", [org, proposalId]);
      const latest = latestResult.rows[0] ?? null;
      const ordinal = latest ? latest.ordinal + 1 : 1;
      let normalized = { ...initial };
      if (allowOnchainBootstrap && (!normalized.votingMetadata || !["AVAILABLE","PENDING_SNAPSHOT"].includes(normalized.votingMetadata.availability))) throw new BadRequestException("Confirmed Governor sync requires voting-period and quorum metadata");
      if (latest && (latest.chain_id !== normalized.chainId || latest.governor !== normalized.governor || latest.external_proposal_id !== normalized.externalProposalId)) throw new BadRequestException("Governance observation identity cannot change");
      let transition;
      try { transition = validateGovernanceTransition((latest?.state ?? "DRAFT") as GovernanceState, normalized.state, { isReorg: normalized.isReorg, reorgReferencesLatest: Boolean(normalized.isReorg && latest && normalized.reorgOfObservationId === latest.id), allowOnchainBootstrap }); }
      catch (error) {
        if (!allowOnchainBootstrap || !latest || normalized.isReorg) throw new BadRequestException(error instanceof Error ? error.message : "INVALID_GOVERNANCE_TRANSITION");
        normalized = { ...normalized, isReorg: true, reorgOfObservationId: latest.id };
        try { transition = validateGovernanceTransition(latest.state as GovernanceState, normalized.state, { isReorg: true, reorgReferencesLatest: true, allowOnchainBootstrap }); }
        catch { throw new BadRequestException(error instanceof Error ? error.message : "INVALID_GOVERNANCE_TRANSITION"); }
      }
      if (latest && !normalized.isReorg && normalized.blockNumber < Number(latest.block_number)) throw new BadRequestException("Governance block number cannot decrease without a referenced reorg");
      if (latest && !normalized.isReorg && normalized.blockNumber === Number(latest.block_number) && normalized.confirmations < latest.confirmations) throw new BadRequestException("Confirmations cannot decrease without a referenced reorg");
      const payloadHash = hash({ schemaVersion: "governance.observation.v2", proposalId, proposalContentHash: proposal.rows[0].content_hash, ...normalized });
      const duplicate = await client.query("SELECT * FROM proposal_state_observations WHERE organization_id=$1 AND proposal_id=$2 AND payload_hash=$3", [org, proposalId, payloadHash]);
      if (duplicate.rowCount) return this.map(duplicate.rows[0]);
      const payload = { schemaVersion: "governance.observation.v2", proposalId, proposalContentHash: proposal.rows[0].content_hash, previousObservationId: latest?.id ?? null, transition: transition.transition, ...normalized };
      const saved = await client.query("INSERT INTO proposal_state_observations(id,organization_id,proposal_id,ordinal,previous_observation_id,adapter,state,chain_id,governor,external_proposal_id,block_number,block_hash,confirmations,is_reorg,reorg_of_observation_id,observed_at,voting_metadata,payload,payload_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) ON CONFLICT(organization_id,proposal_id,payload_hash) DO NOTHING RETURNING *", [makeId("govobs"), org, proposalId, ordinal, latest?.id ?? null, this.adapter.provider, normalized.state, normalized.chainId, normalized.governor, normalized.externalProposalId, normalized.blockNumber, normalized.blockHash, normalized.confirmations, normalized.isReorg, normalized.reorgOfObservationId, normalized.observedAt, normalized.votingMetadata, payload, payloadHash]);
      const row = saved.rowCount ? saved.rows[0] : (await client.query("SELECT * FROM proposal_state_observations WHERE organization_id=$1 AND proposal_id=$2 AND payload_hash=$3", [org, proposalId, payloadHash])).rows[0];
      if (saved.rowCount) await this.audit(client, org, proposalId, row.id, { chainId:row.chain_id,governorAddress:row.governor,blockNumber:Number(row.block_number),blockHash:row.block_hash,state: row.state, transition: transition.transition, votingMetadata: normalized.votingMetadata, payloadHash, mockOnly: normalized.mockOnly, onchainFinalityVerified: normalized.onchainFinalityVerified, assetExecutionAuthorized: false });
      return this.map(row);
    });
  }

  async list(org: string, proposalId: string) { const proposal = await this.db.query("SELECT 1 FROM proposals WHERE organization_id=$1 AND id=$2", [org, proposalId]); if (!proposal.rowCount) throw new NotFoundException("Proposal not found"); const result = await this.db.query("SELECT * FROM proposal_state_observations WHERE organization_id=$1 AND proposal_id=$2 ORDER BY ordinal", [org, proposalId]); const latest = result.rows.at(-1); return { items: result.rows.map((row) => this.map(row)), effectiveState: latest?.state ?? "DRAFT", latestVotingMetadata: latest?.voting_metadata ?? null, onchainFinalityVerified: latest?.payload?.onchainFinalityVerified === true, assetExecutionAuthorized: false }; }
  private async audit(client: PoolClient, org: string, proposalId: string, observationId: string, data: unknown) { const payload = { eventType: "proposal.state_observed", organizationId: org, objectType: "proposal", objectId: proposalId, data }; await client.query("INSERT INTO audit_events(id,organization_id,event_type,actor,action,object_type,object_id,data,payload_hash) VALUES($1,$2,'proposal.state_observed',$3,'proposal.state_observed','proposal',$4,$5,$6)", [makeId("audit"), org, { type: "adapter", id: this.adapter.provider }, proposalId, { observationId, ...data as object }, hash(payload)]); }
  private map(row: any) { return { id: row.id, organizationId: row.organization_id, proposalId: row.proposal_id, ordinal: row.ordinal, previousObservationId: row.previous_observation_id, adapter: row.adapter, state: row.state, chainId: row.chain_id, governor: row.governor, externalProposalId: row.external_proposal_id, blockNumber: Number(row.block_number), blockHash: row.block_hash, confirmations: row.confirmations, isReorg: row.is_reorg, reorgOfObservationId: row.reorg_of_observation_id, observedAt: new Date(row.observed_at).toISOString(), votingMetadata: row.voting_metadata, payload: row.payload, payloadHash: row.payload_hash, onchainFinalityVerified: row.payload?.onchainFinalityVerified === true, assetExecutionAuthorized: false, createdAt: new Date(row.created_at).toISOString() }; }
}
