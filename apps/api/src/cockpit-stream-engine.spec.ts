import { CockpitStreamAdmission, cockpitHeartbeatMessage, cockpitStreamCapacity, COCKPIT_STREAM_POLICY, initialCockpitStreamState, nextCockpitStreamMessage } from "./cockpit-stream-engine";

const projection = { projectionHash: "0xprojection", organizationId: "org_session", assetExecutionAuthorized: false as const };

describe("cockpit SSE reliability policy", () => {
  it("emits a changed projection and freezes a bounded zero-authority policy", () => {
    const result = nextCockpitStreamMessage(initialCockpitStreamState("0xolder"), projection);
    expect(result.message).toEqual(expect.objectContaining({ id: "0xprojection", type: "projection", retry: 1000, data: projection }));
    expect(COCKPIT_STREAM_POLICY).toEqual(expect.objectContaining({ schemaVersion: "aeos.cockpit.stream-policy.v2", projectionFallbackIntervalMs: 15000, heartbeatIntervalMs: 15000, connectionLeaseMs: 55000, projectionWakeStrategy: "POSTGRESQL_NOTIFY_WITH_PERSISTED_FALLBACK", overlapStrategy: "DROP_WAKE_WHILE_QUERY_IN_FLIGHT", assetExecutionAuthorized: false }));
  });

  it("suppresses an unchanged resume cursor and builds a query-independent bounded heartbeat", () => {
    const result = nextCockpitStreamMessage(initialCockpitStreamState("0xprojection"), projection);
    expect(result.message).toBeNull();
    expect(cockpitHeartbeatMessage(result.state, "org_session")).toEqual(expect.objectContaining({ id: "0xprojection", type: "heartbeat", data: expect.objectContaining({ organizationId: "org_session", streamPolicy: "aeos.cockpit.stream-policy.v2", advisoryOnly: true, assetExecutionAuthorized: false }) }));
    expect(cockpitHeartbeatMessage(initialCockpitStreamState(), "org_session")).toBeNull();
  });

  it("fails closed if a projection ever claims asset execution authority", () => {
    expect(() => nextCockpitStreamMessage(initialCockpitStreamState(), { ...projection, assetExecutionAuthorized: true as false })).toThrow("COCKPIT_PROJECTION_AUTHORITY_INVALID");
  });

  it("enforces per-organization capacity without starving another organization and releases idempotently", () => {
    const admission = new CockpitStreamAdmission({ maxConnectionsTotal: 3, maxConnectionsPerOrganization: 2 });
    const releaseA1 = admission.acquire("org_a"), releaseA2 = admission.acquire("org_a");
    expect(() => admission.acquire("org_a")).toThrow("COCKPIT_STREAM_CAPACITY_EXHAUSTED");
    const releaseB = admission.acquire("org_b");
    expect(() => admission.acquire("org_c")).toThrow("COCKPIT_STREAM_CAPACITY_EXHAUSTED");
    expect(admission.metrics()).toEqual({ activeStreams: 3, connectionsTotal: 3, rejectionsTotal: 2, maxConnectionsTotal: 3, maxConnectionsPerOrganization: 2, tenantLabelsExposed: false });
    releaseA1(); releaseA1(); releaseA2(); releaseB();
    expect(admission.metrics().activeStreams).toBe(0);
  });

  it("bounds environment capacity and never permits the total below the per-organization limit", () => {
    expect(cockpitStreamCapacity({ COCKPIT_SSE_MAX_TOTAL: "4", COCKPIT_SSE_MAX_PER_ORGANIZATION: "6" })).toEqual({ maxConnectionsTotal: 6, maxConnectionsPerOrganization: 6 });
    expect(cockpitStreamCapacity({ COCKPIT_SSE_MAX_TOTAL: "unbounded", COCKPIT_SSE_MAX_PER_ORGANIZATION: "0" })).toEqual({ maxConnectionsTotal: 64, maxConnectionsPerOrganization: 8 });
  });
});
