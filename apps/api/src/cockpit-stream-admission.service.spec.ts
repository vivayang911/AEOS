import { CockpitStreamAdmissionService } from "./cockpit-stream-admission.service";

describe("CockpitStreamAdmissionService", () => {
  it("acquires and idempotently releases a zero-authority shared lease", async () => {
    const client = { query: jest.fn().mockImplementation((sql: string) => {
      if (sql.startsWith("SELECT count")) return Promise.resolve({ rows: [{ total: 0, organization_total: 0 }] });
      if (sql.startsWith("INSERT")) return Promise.resolve({ rows: [{ expires_at: "2026-08-14T00:01:05.000Z" }] });
      return Promise.resolve({ rows: [] });
    }) };
    const db = {
      runAsSystem: jest.fn((work: any) => work()),
      transaction: jest.fn((work: any) => work(client)),
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 })
    } as any;
    const service = new CockpitStreamAdmissionService(db);
    const lease = await service.acquire("org_session");
    expect(lease).toEqual(expect.objectContaining({ advisoryOnly: true, assetExecutionAuthorized: false, expiresAt: "2026-08-14T00:01:05.000Z" }));
    expect(client.query.mock.calls[0][0]).toContain("pg_advisory_xact_lock");
    await lease!.release();
    await lease!.release();
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).toContain("connection_id=$1");
  });

  it("refuses capacity before inserting a lease", async () => {
    const client = { query: jest.fn().mockImplementation((sql: string) => {
      if (sql.startsWith("SELECT count")) return Promise.resolve({ rows: [{ total: 64, organization_total: 8 }] });
      return Promise.resolve({ rows: [] });
    }) };
    const db = { runAsSystem: (work: any) => work(), transaction: (work: any) => work(client) } as any;
    expect(await new CockpitStreamAdmissionService(db).acquire("org_full")).toBeNull();
    expect(client.query.mock.calls.some((call) => call[0].startsWith("INSERT"))).toBe(false);
  });
});
