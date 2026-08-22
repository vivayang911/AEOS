import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { defer, exhaustMap, filter, finalize, from, map, merge, Observable, of, takeUntil, timer } from "rxjs";
import { AuthContext } from "./auth.service";
import { CockpitStreamAdmission, cockpitHeartbeatMessage, cockpitStreamCapacity, COCKPIT_STREAM_POLICY, initialCockpitStreamState, nextCockpitStreamMessage } from "./cockpit-stream-engine";
import { CockpitStreamAdmissionService } from "./cockpit-stream-admission.service";
import { CockpitProjectionNotificationService } from "./cockpit-projection-notification.service";
import { DatabaseService } from "./database.service";

type CountRow = { state: string; count: string };
const sha256 = (value: unknown) => `0x${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const counts = (rows: CountRow[]) => Object.fromEntries(rows.map((row) => [row.state, Number(row.count)]));

@Injectable()
export class CockpitProjectionService {
  private readonly capacity = cockpitStreamCapacity();
  private readonly admission = new CockpitStreamAdmission(this.capacity);
  constructor(private readonly db: DatabaseService, private readonly distributedAdmission: CockpitStreamAdmissionService, private readonly notifications: CockpitProjectionNotificationService) {}

  async snapshot(auth: AuthContext) {
    const organizationId = auth.activeOrganizationId;
    if (!organizationId || !auth.role) throw new Error("COCKPIT_TENANT_CONTEXT_REQUIRED");
    const projection = await this.db.runWithTenant(organizationId, auth.userId, auth.role, () => this.db.transaction(async (client) => {
      // A pg PoolClient supports one in-flight query. Keep this tenant-scoped
      // projection on the same transaction and issue its reads sequentially.
      const evidence = await client.query<CountRow>("SELECT verification_status AS state,count(*)::text AS count FROM evidence WHERE organization_id=$1 GROUP BY verification_status ORDER BY verification_status", [organizationId]);
      const decisions = await client.query<CountRow>("SELECT status AS state,count(*)::text AS count FROM decision_jobs WHERE organization_id=$1 GROUP BY status ORDER BY status", [organizationId]);
      const workflows = await client.query<CountRow>("SELECT status AS state,count(*)::text AS count FROM treasury_workflows WHERE organization_id=$1 GROUP BY status ORDER BY status", [organizationId]);
      const treasuries = await client.query("SELECT DISTINCT ON(treasury_id) treasury_id,display_name,chain_id,treasury_address,state,version,content_hash,created_at FROM treasury_registry_versions WHERE organization_id=$1 ORDER BY treasury_id,version DESC", [organizationId]);
      const activity = await client.query("SELECT id,event_type,object_type,object_id,payload_hash,created_at FROM audit_events WHERE organization_id=$1 ORDER BY created_at DESC,id DESC LIMIT 12", [organizationId]);
      const latestActivity = activity.rows.map((row) => ({
        eventId: row.id,
        eventType: row.event_type,
        objectType: row.object_type,
        objectId: row.object_id,
        payloadHash: row.payload_hash,
        createdAt: new Date(row.created_at).toISOString()
      }));
      return {
        schemaVersion: "aeos.cockpit.projection.v1",
        organizationId,
        source: "ORGANIZATION_SCOPED_IMMUTABLE_DATABASE_STATE",
        evidence: counts(evidence.rows),
        decisionJobs: counts(decisions.rows),
        treasuryWorkflows: counts(workflows.rows),
        treasuries: treasuries.rows.map((row) => ({
          treasuryId: row.treasury_id,
          displayName: row.display_name,
          chainId: row.chain_id,
          treasuryAddress: row.treasury_address,
          state: row.state,
          version: row.version,
          contentHash: row.content_hash,
          snapshotCreatedAt: new Date(row.created_at).toISOString()
        })),
        latestActivity,
        latestImmutableEventAt: latestActivity[0]?.createdAt ?? null,
        advisoryOnly: true as const,
        assetExecutionAuthorized: false as const
      };
    }));
    return { ...projection, projectionHash: sha256(projection) };
  }

  async stream(auth: AuthContext, lastEventId?: string): Promise<Observable<any>> {
    const organizationId = auth.activeOrganizationId;
    if (!organizationId) throw new ServiceUnavailableException({ message: "Cockpit stream requires an active organization", code: "COCKPIT_TENANT_CONTEXT_REQUIRED", retryable: false });
    let distributedLease;
    try { distributedLease = await this.distributedAdmission.acquire(organizationId); }
    catch {
      this.admission.recordRejection();
      throw new ServiceUnavailableException({ message: "Cockpit stream admission is temporarily unavailable", code: "COCKPIT_STREAM_ADMISSION_UNAVAILABLE", retryable: true, retryAfterSeconds: 1 });
    }
    if (!distributedLease) {
      this.admission.recordRejection();
      throw new ServiceUnavailableException({ message: "Cockpit stream capacity is temporarily exhausted", code: "COCKPIT_STREAM_CAPACITY_EXHAUSTED", retryable: true, retryAfterSeconds: 1 });
    }
    let release: () => void;
    try { release = this.admission.acquire(organizationId); }
    catch {
      await distributedLease.release().catch(() => undefined);
      throw new ServiceUnavailableException({ message: "Cockpit stream capacity is temporarily exhausted", code: "COCKPIT_STREAM_CAPACITY_EXHAUSTED", retryable: true, retryAfterSeconds: 1 });
    }
    return defer(() => {
      let state = initialCockpitStreamState(lastEventId);
      const projectionWakeups = merge(
        of({ reason: "INITIAL" }),
        this.notifications.forOrganization(organizationId),
        timer(COCKPIT_STREAM_POLICY.projectionFallbackIntervalMs, COCKPIT_STREAM_POLICY.projectionFallbackIntervalMs).pipe(map(() => ({ reason: "PERSISTED_FALLBACK" })))
      ).pipe(
        // Bursts coalesce naturally: a slow projection read drops overlapping wakeups, while the persisted fallback repairs any missed notification.
        exhaustMap(() => from(this.snapshot(auth))),
        map((projection) => {
          const next = nextCockpitStreamMessage(state, projection);
          state = next.state;
          return next.message;
        }),
        filter((message) => message !== null)
      );
      const heartbeats = timer(COCKPIT_STREAM_POLICY.heartbeatIntervalMs, COCKPIT_STREAM_POLICY.heartbeatIntervalMs).pipe(
        map(() => cockpitHeartbeatMessage(state, organizationId)),
        filter((message) => message !== null)
      );
      return merge(projectionWakeups, heartbeats).pipe(
        // A bounded lease forces a fresh HTTP request and therefore fresh SessionGuard/RBAC checks.
        takeUntil(timer(COCKPIT_STREAM_POLICY.connectionLeaseMs)),
        finalize(() => { release(); void distributedLease.release().catch(() => undefined); })
      );
    });
  }

  streamPolicy() { return { ...COCKPIT_STREAM_POLICY, ...this.capacity, distributedAdmission: this.distributedAdmission.policy(), eventFanout: this.notifications.policy() }; }
  operationalMetrics() { return { ...this.admission.metrics(), ...this.notifications.metrics() }; }
}
