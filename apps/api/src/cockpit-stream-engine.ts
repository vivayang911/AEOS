export const COCKPIT_STREAM_POLICY = Object.freeze({
  schemaVersion: "aeos.cockpit.stream-policy.v2",
  projectionFallbackIntervalMs: 15_000,
  heartbeatIntervalMs: 15_000,
  connectionLeaseMs: 55_000,
  distributedAdmissionLeaseMs: 65_000,
  reconnectRetryMs: 1_000,
  maxConnectionsTotal: 64,
  maxConnectionsPerOrganization: 8,
  projectionWakeStrategy: "POSTGRESQL_NOTIFY_WITH_PERSISTED_FALLBACK",
  overlapStrategy: "DROP_WAKE_WHILE_QUERY_IN_FLIGHT",
  sessionRevalidation: "RECONNECT_AFTER_BOUNDED_LEASE",
  advisoryOnly: true,
  assetExecutionAuthorized: false
} as const);

export type CockpitStreamCapacity = { maxConnectionsTotal: number; maxConnectionsPerOrganization: number };
const boundedInteger = (value: string | undefined, fallback: number, minimum: number, maximum: number) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
};

export function cockpitStreamCapacity(environment: Record<string, string | undefined> = process.env): CockpitStreamCapacity {
  const perOrganization = boundedInteger(environment.COCKPIT_SSE_MAX_PER_ORGANIZATION, COCKPIT_STREAM_POLICY.maxConnectionsPerOrganization, 1, 100);
  const total = boundedInteger(environment.COCKPIT_SSE_MAX_TOTAL, COCKPIT_STREAM_POLICY.maxConnectionsTotal, 1, 1_000);
  return { maxConnectionsPerOrganization: perOrganization, maxConnectionsTotal: Math.max(perOrganization, total) };
}

export class CockpitStreamAdmission {
  private activeTotal = 0;
  private acceptedTotal = 0;
  private rejectedTotal = 0;
  private readonly activeByOrganization = new Map<string, number>();
  constructor(private readonly capacity: CockpitStreamCapacity) {}

  acquire(organizationId: string) {
    const activeForOrganization = this.activeByOrganization.get(organizationId) ?? 0;
    if (this.activeTotal >= this.capacity.maxConnectionsTotal || activeForOrganization >= this.capacity.maxConnectionsPerOrganization) {
      this.rejectedTotal += 1;
      throw new Error("COCKPIT_STREAM_CAPACITY_EXHAUSTED");
    }
    this.activeTotal += 1;
    this.acceptedTotal += 1;
    this.activeByOrganization.set(organizationId, activeForOrganization + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeTotal = Math.max(0, this.activeTotal - 1);
      const next = Math.max(0, (this.activeByOrganization.get(organizationId) ?? 1) - 1);
      if (next === 0) this.activeByOrganization.delete(organizationId); else this.activeByOrganization.set(organizationId, next);
    };
  }

  recordRejection() { this.rejectedTotal += 1; }

  metrics() {
    return { activeStreams: this.activeTotal, connectionsTotal: this.acceptedTotal, rejectionsTotal: this.rejectedTotal, ...this.capacity, tenantLabelsExposed: false };
  }
}

export type CockpitStreamState = { lastEventId: string | null };
export type CockpitProjectionIdentity = { projectionHash: string; organizationId: string; assetExecutionAuthorized: false };

export function initialCockpitStreamState(lastEventId?: string): CockpitStreamState {
  return { lastEventId: lastEventId?.trim() || null };
}

export function nextCockpitStreamMessage<T extends CockpitProjectionIdentity>(state: CockpitStreamState, projection: T) {
  if (projection.assetExecutionAuthorized !== false) throw new Error("COCKPIT_PROJECTION_AUTHORITY_INVALID");
  if (projection.projectionHash !== state.lastEventId) {
    return {
      state: { lastEventId: projection.projectionHash },
      message: { id: projection.projectionHash, type: "projection", retry: COCKPIT_STREAM_POLICY.reconnectRetryMs, data: projection }
    };
  }
  return { state, message: null };
}

export function cockpitHeartbeatMessage(state: CockpitStreamState, organizationId: string) {
  if (!state.lastEventId) return null;
  return {
    id: state.lastEventId,
    type: "heartbeat",
    retry: COCKPIT_STREAM_POLICY.reconnectRetryMs,
    data: {
      schemaVersion: "aeos.cockpit.heartbeat.v1",
      organizationId,
      projectionHash: state.lastEventId,
      streamPolicy: COCKPIT_STREAM_POLICY.schemaVersion,
      advisoryOnly: true,
      assetExecutionAuthorized: false
    }
  };
}
