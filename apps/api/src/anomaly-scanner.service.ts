import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { DatabaseService } from "./database.service";
import { anomalyAudit, governanceUnknownCandidate, GOVERNANCE_UNKNOWN_AFTER_SECONDS, pausedGuardCandidate, permissionChangeCandidate, staleEvidenceCandidate } from "./anomaly-scanner-engine";
const safeCode = (error: unknown) => (error instanceof Error ? error.constructor.name : "UnknownError").replace(/[^A-Za-z0-9_]/g, "_").slice(0, 60).toUpperCase();

@Injectable()
export class AnomalyScannerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AnomalyScannerService.name); private timer?: NodeJS.Timeout; private running = false;
  constructor(private readonly db: DatabaseService) {}
  configuration() { return { producerVersion: "aeos-anomaly-producers.v1", intervalMilliseconds: this.interval(), governanceUnknownAfterSeconds: GOVERNANCE_UNKNOWN_AFTER_SECONDS, source: "IMMUTABLE_STORED_STATE", networkAccess: false, credentialsRequired: false, signerCapability: false, broadcastCapability: false, assetExecutionAuthorized: false }; }
  onApplicationBootstrap() { if ((process.env.ANOMALY_SCAN_ENABLED ?? "true").toLowerCase() === "false") return; this.timer = setInterval(() => void this.tick(), this.interval()); this.timer.unref(); void this.tick(); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  private interval() { const value = Number(process.env.ANOMALY_SCAN_INTERVAL_MS ?? 60_000); return Number.isSafeInteger(value) && value >= 10_000 && value <= 3_600_000 ? value : 60_000; }
  private async tick() { if (this.running) return; this.running = true; try { await this.scanOnce(new Date()); } catch (error) { this.logger.warn(JSON.stringify({ event: "anomaly.scan.failed", error_type: safeCode(error), sensitive_fields_logged: false })); } finally { this.running = false; } }
  async scanOnce(referenceTime: Date) {
    if (!Number.isFinite(referenceTime.getTime())) throw new Error("INVALID_SCAN_REFERENCE_TIME");
    return this.db.runAsSystem(() => this.db.transaction(async (client) => {
      const evidence = await client.query(`SELECT e.organization_id,e.id,e.content_hash,e.freshness_expires_at FROM evidence e
        WHERE e.verification_status='VERIFIED' AND e.freshness_expires_at<=$1
        AND NOT EXISTS(SELECT 1 FROM audit_events a WHERE a.organization_id=e.organization_id AND a.event_type='evidence.stale' AND a.object_id=e.id AND a.data->>'evidenceContentHash'=e.content_hash)
        ORDER BY e.freshness_expires_at DESC,e.id LIMIT 100`, [referenceTime]);
      const governance = await client.query(`SELECT organization_id,proposal_id,id,state,observed_at,payload_hash FROM (SELECT DISTINCT ON(organization_id,proposal_id) organization_id,proposal_id,id,state,observed_at,payload_hash,ordinal FROM proposal_state_observations ORDER BY organization_id,proposal_id,ordinal DESC) latest
        WHERE state IN('PUBLISHED','PENDING','ACTIVE','SUCCEEDED','QUEUED') AND observed_at<=$1::timestamptz-make_interval(secs=>$2)
        AND NOT EXISTS(SELECT 1 FROM audit_events a WHERE a.organization_id=latest.organization_id AND a.event_type='proposal.state_unknown' AND a.object_id=latest.proposal_id AND a.data->>'latestObservationHash'=latest.payload_hash)
        ORDER BY observed_at DESC,id LIMIT 100`, [referenceTime, GOVERNANCE_UNKNOWN_AFTER_SECONDS]);
      const configurations = await client.query(`SELECT organization_id,id,version,config,inspection,content_hash FROM (SELECT c.*,row_number() OVER(PARTITION BY organization_id ORDER BY version DESC) AS position FROM organization_configuration_versions c) ranked WHERE position<=2 ORDER BY organization_id,version DESC`);
      const candidates = [...evidence.rows.map(staleEvidenceCandidate), ...governance.rows.map(governanceUnknownCandidate)];
      const byOrganization = new Map<string, any[]>(); for (const row of configurations.rows) byOrganization.set(row.organization_id, [...(byOrganization.get(row.organization_id) ?? []), row]);
      for (const rows of byOrganization.values()) { const paused = pausedGuardCandidate(rows[0]); if (paused) candidates.push(paused); if (rows[1]) { const permission = permissionChangeCandidate(rows[0], rows[1]); if (permission) candidates.push(permission); } }
      let emitted = 0;
      for (const candidate of candidates) { const audit = anomalyAudit(candidate); const saved = await client.query("INSERT INTO audit_events(id,organization_id,event_type,actor,action,object_type,object_id,data,payload_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING RETURNING id", [audit.id, audit.organizationId, audit.eventType, audit.actor, audit.action, audit.objectType, audit.objectId, audit.data, audit.payloadHash]); emitted += saved.rowCount ?? 0; }
      return { status: "COMPLETED" as const, scannedAt: referenceTime.toISOString(), candidates: candidates.length, emitted, duplicates: candidates.length - emitted, advisoryOnly: true, assetExecutionAuthorized: false };
    }));
  }
}
