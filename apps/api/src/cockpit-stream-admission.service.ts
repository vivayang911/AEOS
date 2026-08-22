import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { cockpitStreamCapacity, COCKPIT_STREAM_POLICY } from "./cockpit-stream-engine";
import { DatabaseService } from "./database.service";

export type CockpitDistributedLease = {
  connectionId: string;
  expiresAt: string;
  release: () => Promise<void>;
  advisoryOnly: true;
  assetExecutionAuthorized: false;
};

@Injectable()
export class CockpitStreamAdmissionService {
  private readonly capacity = cockpitStreamCapacity();
  private readonly instanceId = randomUUID();

  constructor(private readonly db: DatabaseService) {}

  async acquire(organizationId: string): Promise<CockpitDistributedLease | null> {
    const connectionId = randomUUID();
    const acquired = await this.db.runAsSystem(() => this.db.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('aeos:cockpit:sse:admission',0))");
      await client.query("DELETE FROM cockpit_stream_leases WHERE expires_at<=now()");
      const counts = await client.query(
        "SELECT count(*)::int AS total,count(*) FILTER(WHERE organization_id=$1)::int AS organization_total FROM cockpit_stream_leases WHERE expires_at>now()",
        [organizationId]
      );
      const row = counts.rows[0];
      if (Number(row.total) >= this.capacity.maxConnectionsTotal || Number(row.organization_total) >= this.capacity.maxConnectionsPerOrganization) return null;
      const saved = await client.query(
        "INSERT INTO cockpit_stream_leases(connection_id,organization_id,instance_id,expires_at,advisory_only,asset_execution_authorized) VALUES($1,$2,$3,now()+($4::text||' milliseconds')::interval,true,false) RETURNING expires_at",
        [connectionId, organizationId, this.instanceId, COCKPIT_STREAM_POLICY.distributedAdmissionLeaseMs]
      );
      return new Date(saved.rows[0].expires_at).toISOString();
    }));
    if (!acquired) return null;
    let released = false;
    return {
      connectionId,
      expiresAt: acquired,
      release: async () => {
        if (released) return;
        released = true;
        await this.db.runAsSystem(() => this.db.query("DELETE FROM cockpit_stream_leases WHERE connection_id=$1 AND instance_id=$2", [connectionId, this.instanceId]));
      },
      advisoryOnly: true,
      assetExecutionAuthorized: false
    };
  }

  policy() {
    return { mode: "POSTGRESQL_SHARED_LEASE", leaseMs: COCKPIT_STREAM_POLICY.distributedAdmissionLeaseMs, crashRecovery: "EXPIRED_LEASE_RECLAIM", tenantLabelsExposed: false, advisoryOnly: true, assetExecutionAuthorized: false } as const;
  }
}
