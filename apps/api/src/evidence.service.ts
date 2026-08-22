import { createHash, randomUUID } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PoolClient } from "pg";
import { DatabaseService } from "./database.service";
import { EvidenceQueryDto, IngestMockDto } from "./evidence.dto";
import { persistEvidenceClassification } from "./evidence-classification";

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
};
const hash = (value: unknown) => `0x${createHash("sha256").update(canonical(value)).digest("hex")}`;
const id = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;
const FRESHNESS_MS = 60 * 60 * 1000;

@Injectable()
export class EvidenceService {
  constructor(private readonly db: DatabaseService) {}

  async ingestMock(input: IngestMockDto) {
    const chainId = input.chainId ?? 11155111;
    const wallet = (input.wallet ?? "0x1111111111111111111111111111111111111111").toLowerCase();
    const observedAt = input.observedAt ?? new Date(Math.floor(Date.now() / 60000) * 60000).toISOString();
    const payload = { chainId, blockNumber: chainId === 11155111 ? 6500000 : 25000000, wallet, amount: input.amount ?? (chainId === 11155111 ? "125000000" : "84000000"), symbol: "USDC", observedAt, proof: input.proof ?? "valid" };
    const rawHash = hash(payload);
    return this.db.transaction(async (client) => {
      await client.query("INSERT INTO organizations(id,name) VALUES($1,$2) ON CONFLICT(id) DO NOTHING", [input.organizationId, "AEOS Demo DAO"]);
      const raw = await client.query<{ id: string }>("INSERT INTO raw_attestations(id,organization_id,provider,chain_id,payload,content_hash,verification_error) VALUES($1,$2,'mock-attestcoin',$3,$4,$5,$6) ON CONFLICT(organization_id,content_hash) DO UPDATE SET content_hash=EXCLUDED.content_hash RETURNING id", [id("raw"), input.organizationId, chainId, payload, rawHash, payload.proof === "valid" ? null : "MOCK_INVALID_PROOF"]);
      if (payload.proof !== "valid") {
        const quarantineId = id("quarantine");
        await client.query("INSERT INTO evidence_quarantine(id,organization_id,raw_attestation_id,reason_code,details,payload_hash) VALUES($1,$2,$3,'INVALID_PROOF',$4,$5) ON CONFLICT DO NOTHING", [quarantineId, input.organizationId, raw.rows[0].id, { adapter: "mock-attestcoin" }, rawHash]);
        await this.audit(client, input.organizationId, "evidence.rejected", "quarantine", quarantineId, { reasonCode: "INVALID_PROOF", rawAttestationId: raw.rows[0].id });
        return { status: "REJECTED", quarantineId, reasonCode: "INVALID_PROOF", contentHash: rawHash };
      }
      const expiresAt = new Date(new Date(observedAt).getTime() + FRESHNESS_MS);
      const freshness = expiresAt.getTime() > Date.now() ? "FRESH" : "STALE";
      const quality = { proofStrength: 35, sourceReliability: 20, freshness: freshness === "FRESH" ? 20 : 0, completeness: 15, consistency: 10 };
      const fact = { subject: { type: "wallet", id: `eip155:${chainId}:${wallet}` }, predicate: "asset.balance", value: { amount: payload.amount, decimals: 6, symbol: payload.symbol }, chain: { id: chainId, blockNumber: payload.blockNumber }, source: { provider: "mock-attestcoin", reference: raw.rows[0].id }, verificationStatus: "VERIFIED", observedAt };
      const factHash = hash(fact);
      const conflict = await client.query<{ conflict_group_id: string | null; id: string }>("SELECT id,conflict_group_id FROM evidence WHERE organization_id=$1 AND subject=$2 AND predicate=$3 AND observed_at BETWEEN $4::timestamptz - interval '5 minutes' AND $4::timestamptz + interval '5 minutes' AND content_hash<>$5 LIMIT 1", [input.organizationId, fact.subject, fact.predicate, observedAt, factHash]);
      const conflictGroupId = conflict.rowCount ? (conflict.rows[0].conflict_group_id ?? id("conflict")) : null;
      if (conflict.rowCount && !conflict.rows[0].conflict_group_id) await client.query("UPDATE evidence SET conflict_group_id=$1 WHERE organization_id=$2 AND id=$3", [conflictGroupId, input.organizationId, conflict.rows[0].id]);
      const saved = await client.query("INSERT INTO evidence(id,organization_id,raw_attestation_id,subject,predicate,value,chain,source,verification_status,freshness_status,freshness_expires_at,quality_score,quality_components,conflict_group_id,observed_at,content_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'VERIFIED',$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(organization_id,content_hash) DO UPDATE SET content_hash=EXCLUDED.content_hash RETURNING *", [id("ev"), input.organizationId, raw.rows[0].id, fact.subject, fact.predicate, fact.value, fact.chain, fact.source, freshness, expiresAt.toISOString(), Object.values(quality).reduce((a, b) => a + b, 0), quality, conflictGroupId, observedAt, factHash]);
      const classification=await persistEvidenceClassification(client,input.organizationId,{id:saved.rows[0].id,contentHash:factHash,subject:fact.subject,predicate:fact.predicate,value:fact.value,source:fact.source,verificationStatus:"VERIFIED"});
      const evidence = this.map(saved.rows[0]);
      await this.audit(client, input.organizationId, "evidence.verified", "evidence", evidence.id, { contentHash: factHash, chainId, freshness });
      await this.audit(client,input.organizationId,"evidence.classified","evidence_classification",evidence.id,{classificationHash:classification.classificationHash,classifierVersion:classification.classifierVersion,labels:classification.labels,routes:classification.routes,verificationStatus:classification.verificationStatus,assetExecutionAuthorized:false});
      return {...evidence,classification};
    });
  }

  async list(org: string, query: EvidenceQueryDto) {
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;
    const result = await this.db.query("SELECT e.*,CASE WHEN e.freshness_expires_at<=now() AND e.freshness_status='FRESH' THEN 'STALE' ELSE e.freshness_status END AS effective_freshness,c.schema_version classification_schema_version,c.classifier_version,c.evidence_content_hash,c.verification_status classification_verification_status,c.labels classification_labels,c.routes classification_routes,c.reasons classification_reasons,c.classification_hash,c.asset_execution_authorized classification_asset_authority FROM evidence e LEFT JOIN evidence_classifications c ON c.organization_id=e.organization_id AND c.evidence_id=e.id AND c.classifier_version='deterministic-evidence-classifier-v1' WHERE e.organization_id=$1 AND ($2::text IS NULL OR e.verification_status=$2) AND ($3::text IS NULL OR (CASE WHEN e.freshness_expires_at<=now() AND e.freshness_status='FRESH' THEN 'STALE' ELSE e.freshness_status END)=$3) AND ($4::int IS NULL OR (e.chain->>'id')::int=$4) AND ($5::text IS NULL OR e.predicate=$5) AND ($6::int IS NULL OR e.quality_score>=$6) AND ($7::timestamptz IS NULL OR (e.observed_at,e.id)<($7::timestamptz,$8::text)) ORDER BY e.observed_at DESC,e.id DESC LIMIT $9", [org, query.status ?? null, query.freshness ?? null, query.chainId ?? null, query.predicate ?? null, query.minQuality ?? null, cursor?.observedAt ?? null, cursor?.id ?? null, query.limit + 1]);
    const hasMore = result.rows.length > query.limit;
    const rows = result.rows.slice(0, query.limit);
    const last = rows.at(-1);
    return { items: rows.map((row) => this.map(row)), nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ observedAt: new Date(last.observed_at).toISOString(), id: last.id })).toString("base64url") : null };
  }
  async get(org: string, evidenceId: string) { const result = await this.db.query("SELECT e.*,CASE WHEN e.freshness_expires_at<=now() AND e.freshness_status='FRESH' THEN 'STALE' ELSE e.freshness_status END AS effective_freshness,c.schema_version classification_schema_version,c.classifier_version,c.evidence_content_hash,c.verification_status classification_verification_status,c.labels classification_labels,c.routes classification_routes,c.reasons classification_reasons,c.classification_hash,c.asset_execution_authorized classification_asset_authority FROM evidence e LEFT JOIN evidence_classifications c ON c.organization_id=e.organization_id AND c.evidence_id=e.id AND c.classifier_version='deterministic-evidence-classifier-v1' WHERE e.organization_id=$1 AND e.id=$2", [org, evidenceId]); if (!result.rowCount) throw new NotFoundException("Evidence not found"); return this.map(result.rows[0]); }
  async snapshot(org: string, evidenceIds: string[]) {
    const found = await this.db.query<{ id: string; content_hash: string; verification_status: string; freshness_expires_at: Date }>("SELECT id,content_hash,verification_status,freshness_expires_at FROM evidence WHERE organization_id=$1 AND id=ANY($2::text[]) ORDER BY id", [org, evidenceIds]);
    if (found.rowCount !== new Set(evidenceIds).size) throw new NotFoundException("One or more evidence items were not found");
    if (found.rows.some((row) => row.verification_status !== "VERIFIED")) throw new BadRequestException("Only verified evidence can be snapshotted");
    const manifest = found.rows.map(({ id: evidenceId, content_hash: contentHash }) => ({ evidenceId, contentHash }));
    const manifestHash = hash(manifest);
    return this.db.transaction(async (client) => {
      const existing = await client.query("SELECT * FROM evidence_snapshots WHERE organization_id=$1 AND manifest_hash=$2 ORDER BY created_at,id LIMIT 1", [org, manifestHash]);
      if (existing.rowCount) return existing.rows[0];
      const saved = await client.query("INSERT INTO evidence_snapshots(id,organization_id,evidence_ids,manifest,manifest_hash,query) VALUES($1,$2,$3,$4,$5,$6) RETURNING *", [id("snap"), org, JSON.stringify(manifest.map((item) => item.evidenceId)), JSON.stringify(manifest), manifestHash, JSON.stringify({ evidenceIds: [...evidenceIds].sort() })]);
      await this.audit(client, org, "evidence.snapshot_created", "evidence_snapshot", saved.rows[0].id, { manifestHash, evidenceIds: manifest.map((item) => item.evidenceId) });
      return saved.rows[0];
    });
  }
  async listQuarantine(org: string) { const result = await this.db.query("SELECT id,reason_code,details,payload_hash,created_at FROM evidence_quarantine WHERE organization_id=$1 ORDER BY created_at DESC", [org]); return result.rows; }
  private decodeCursor(cursor: string): { observedAt: string; id: string } { try { const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")); if (!value.observedAt || !value.id || Number.isNaN(Date.parse(value.observedAt))) throw new Error(); return value; } catch { throw new BadRequestException("Invalid evidence cursor"); } }
  private async audit(client: PoolClient, org: string, eventType: string, objectType: string, objectId: string, data: unknown) { const payload = { eventType, organizationId: org, objectType, objectId, data }; await client.query("INSERT INTO audit_events(id,organization_id,event_type,actor,action,object_type,object_id,data,payload_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)", [id("audit"), org, eventType, { type: "adapter", id: "mock-attestcoin" }, eventType, objectType, objectId, data, hash(payload)]); }
  private map(row: any) { const classification=row.classification_hash?{schemaVersion:row.classification_schema_version,classifierVersion:row.classifier_version,evidenceId:row.id,evidenceContentHash:row.evidence_content_hash,verificationStatus:row.classification_verification_status,labels:row.classification_labels,routes:row.classification_routes,reasons:row.classification_reasons,classificationHash:row.classification_hash,assetExecutionAuthorized:row.classification_asset_authority}:undefined;return { id: row.id, organizationId: row.organization_id, subject: row.subject, predicate: row.predicate, value: row.value, chain: row.chain, source: row.source, verification: { status: row.verification_status }, freshness: row.effective_freshness ?? row.freshness_status, freshnessExpiresAt: new Date(row.freshness_expires_at).toISOString(), qualityScore: row.quality_score, qualityComponents: row.quality_components, conflictGroupId: row.conflict_group_id, observedAt: new Date(row.observed_at).toISOString(), contentHash: row.content_hash,...(classification?{classification}:{}) }; }
}
