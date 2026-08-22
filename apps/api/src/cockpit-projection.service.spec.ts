import { firstValueFrom, NEVER, Subject, take, toArray } from "rxjs";
import { ServiceUnavailableException } from "@nestjs/common";
import { CockpitProjectionService } from "./cockpit-projection.service";

const rows = [
  [{ state: "VERIFIED", count: "3" }],
  [{ state: "RUNNING", count: "1" }],
  [{ state: "QUEUED", count: "2" }],
  [{ treasury_id: "trs_core", display_name: "Core", chain_id: 102031, treasury_address: "0x1111111111111111111111111111111111111111", state: "ACTIVE", version: 2, content_hash: `0x${"1".repeat(64)}`, created_at: "2026-08-13T01:00:00Z" }],
  [{ id: "audit_1", event_type: "evidence.verified", object_type: "evidence", object_id: "ev_1", payload_hash: `0x${"2".repeat(64)}`, created_at: "2026-08-13T02:00:00Z" }]
];

describe("CockpitProjectionService", () => {
  const distributed = () => ({
    acquire: jest.fn().mockResolvedValue({ connectionId: "connection", expiresAt: "2026-08-14T00:01:05.000Z", release: jest.fn().mockResolvedValue(undefined), advisoryOnly: true, assetExecutionAuthorized: false }),
    policy: jest.fn().mockReturnValue({ mode: "POSTGRESQL_SHARED_LEASE", leaseMs: 65000, assetExecutionAuthorized: false })
  });
  const notifications = (wakeups: Subject<any> | typeof NEVER = NEVER) => ({
    forOrganization: jest.fn().mockReturnValue(wakeups),
    policy: jest.fn().mockReturnValue({ mode: "POSTGRESQL_LISTEN_NOTIFY_WITH_PERSISTED_FALLBACK", assetExecutionAuthorized: false }),
    metrics: jest.fn().mockReturnValue({ fanoutListenerConnected: 1, fanoutNotificationsTotal: 0, fanoutRejectedNotificationsTotal: 0, fanoutReconnectsTotal: 0, tenantLabelsExposed: false })
  });

  it("projects only the server-selected organization and denies execution authority", async () => {
    const client = { query: jest.fn().mockImplementation((_sql: string, values: unknown[]) => Promise.resolve({ rows: rows[client.query.mock.calls.length - 1], rowCount: 1 })) };
    const db = { runWithTenant: jest.fn((_org: string, _user: string, _role: string, work: any) => work()), transaction: (work: any) => work(client) } as any;
    const auth = { activeOrganizationId: "org_session", userId: "user_session", role: "AUDITOR" } as any;
    const result = await new CockpitProjectionService(db, distributed() as any, notifications() as any).snapshot(auth);
    expect(db.runWithTenant).toHaveBeenCalledWith("org_session", "user_session", "AUDITOR", expect.any(Function));
    expect(client.query).toHaveBeenCalledTimes(5);
    expect(client.query.mock.calls.every((call) => call[1][0] === "org_session")).toBe(true);
    expect(result).toMatchObject({ organizationId: "org_session", evidence: { VERIFIED: 3 }, decisionJobs: { RUNNING: 1 }, treasuryWorkflows: { QUEUED: 2 }, advisoryOnly: true, assetExecutionAuthorized: false });
    expect(result.projectionHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("does not execute concurrent queries on one transaction client", async () => {
    let inFlight = false;
    let queryIndex = 0;
    const client = { query: jest.fn().mockImplementation(async () => {
      if (inFlight) throw new Error("concurrent PoolClient query");
      inFlight = true;
      const response = { rows: rows[queryIndex++], rowCount: 1 };
      await new Promise((resolve) => setImmediate(resolve));
      inFlight = false;
      return response;
    }) };
    const db = { runWithTenant: jest.fn((_org: string, _user: string, _role: string, work: any) => work()), transaction: (work: any) => work(client) } as any;
    const auth = { activeOrganizationId: "org_session", userId: "user_session", role: "AUDITOR" } as any;

    await expect(new CockpitProjectionService(db, distributed() as any, notifications() as any).snapshot(auth)).resolves.toMatchObject({ organizationId: "org_session" });
    expect(client.query).toHaveBeenCalledTimes(5);
  });

  it("emits a changed projection with the bounded reconnect delay", async () => {
    const service = new CockpitProjectionService({} as any, distributed() as any, notifications() as any);
    const projection = { projectionHash: "0xcursor", assetExecutionAuthorized: false } as any;
    jest.spyOn(service, "snapshot").mockResolvedValue(projection);
    const auth = { activeOrganizationId: "org_session", userId: "user_session", role: "AUDITOR" } as any;
    const stream = await service.stream(auth, "0xolder");
    const values = await firstValueFrom(stream.pipe(take(1), toArray()));
    expect(values).toEqual([{ id: "0xcursor", type: "projection", retry: 1000, data: projection }]);
    expect(service.snapshot).toHaveBeenCalledWith(auth);
    expect(service.operationalMetrics()).toEqual({ activeStreams: 0, connectionsTotal: 1, rejectionsTotal: 0, maxConnectionsTotal: 64, maxConnectionsPerOrganization: 8, fanoutListenerConnected: 1, fanoutNotificationsTotal: 0, fanoutRejectedNotificationsTotal: 0, fanoutReconnectsTotal: 0, tenantLabelsExposed: false });
  });

  it("returns a safe retryable 503 at the default organization capacity and releases every reservation", async () => {
    const shared = distributed();
    let active = 0;
    shared.acquire.mockImplementation(async () => active >= 8 ? null : ({ connectionId: `connection-${active += 1}`, expiresAt: "2026-08-14T00:01:05.000Z", release: jest.fn().mockImplementation(async () => { active -= 1; }), advisoryOnly: true, assetExecutionAuthorized: false }));
    const service = new CockpitProjectionService({} as any, shared as any, notifications() as any);
    jest.spyOn(service, "snapshot").mockImplementation(() => new Promise(() => undefined));
    const auth = { activeOrganizationId: "org_capacity", userId: "user_session", role: "AUDITOR" } as any;
    const streams = await Promise.all(Array.from({ length: 8 }, () => service.stream(auth)));
    const subscriptions = streams.map((stream) => stream.subscribe());
    await expect(service.stream(auth)).rejects.toThrow(ServiceUnavailableException);
    expect(service.operationalMetrics()).toEqual(expect.objectContaining({ activeStreams: 8, connectionsTotal: 8, rejectionsTotal: 1, tenantLabelsExposed: false }));
    subscriptions.forEach((subscription) => subscription.unsubscribe());
    expect(service.operationalMetrics().activeStreams).toBe(0);
  });

  it("fails closed when shared admission storage is unavailable", async () => {
    const shared = distributed();
    shared.acquire.mockRejectedValue(new Error("database detail must not escape"));
    const service = new CockpitProjectionService({} as any, shared as any, notifications() as any);
    const auth = { activeOrganizationId: "org_session", userId: "user_session", role: "AUDITOR" } as any;
    await expect(service.stream(auth)).rejects.toMatchObject({ response: expect.objectContaining({ code: "COCKPIT_STREAM_ADMISSION_UNAVAILABLE", retryable: true }) });
    expect(service.operationalMetrics()).toEqual(expect.objectContaining({ activeStreams: 0, connectionsTotal: 0, rejectionsTotal: 1 }));
  });

  it("fans an organization notification into a fresh persisted projection without cross-organization wakeups", async () => {
    const wakeups = new Subject<any>();
    const notificationService = notifications(wakeups);
    const service = new CockpitProjectionService({} as any, distributed() as any, notificationService as any);
    jest.spyOn(service, "snapshot")
      .mockResolvedValueOnce({ organizationId: "org_session", projectionHash: "0xfirst", advisoryOnly: true, assetExecutionAuthorized: false } as any)
      .mockResolvedValueOnce({ organizationId: "org_session", projectionHash: "0xsecond", advisoryOnly: true, assetExecutionAuthorized: false } as any);
    const auth = { activeOrganizationId: "org_session", userId: "user_session", role: "AUDITOR" } as any;
    const stream = await service.stream(auth);
    const result = firstValueFrom(stream.pipe(take(2), toArray()));
    await new Promise((resolve) => setImmediate(resolve));
    wakeups.next({ organizationId: "org_other" });
    wakeups.next({ organizationId: "org_session" });
    await expect(result).resolves.toEqual([
      expect.objectContaining({ id: "0xfirst", type: "projection" }),
      expect.objectContaining({ id: "0xsecond", type: "projection" })
    ]);
    expect(notificationService.forOrganization).toHaveBeenCalledWith("org_session");
    expect(service.snapshot).toHaveBeenCalledTimes(2);
  });
});
