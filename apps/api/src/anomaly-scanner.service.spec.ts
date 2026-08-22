import { AnomalyScannerService } from "./anomaly-scanner.service";

describe("periodic anomaly scanner service", () => {
  it("scans as system, emits immutable audit events once, and reports duplicates", async () => {
    const configuration = { organization_id: "org_1", id: "config_2", version: 2, content_hash: "0xconfig2", config: { governorAddress: "0x1", timelockAddress: "0x2", safeAddress: "0x9", treasuryGuardAddress: "0x4" }, inspection: { blockNumber: 10, blockHash: "0xblock", contracts: { treasuryGuardAddress: { paused: true } } } };
    const previous = { ...configuration, id: "config_1", version: 1, content_hash: "0xconfig1", config: { ...configuration.config, safeAddress: "0x3" } };
    const client = { query: jest.fn().mockResolvedValueOnce({ rows: [{ organization_id: "org_1", id: "ev_1", content_hash: "0xevidence", freshness_expires_at: "2026-08-07T00:00:00Z" }] }).mockResolvedValueOnce({ rows: [{ organization_id: "org_1", proposal_id: "proposal_1", id: "obs_1", state: "ACTIVE", observed_at: "2026-08-07T00:00:00Z", payload_hash: "0xobs" }] }).mockResolvedValueOnce({ rows: [configuration, previous] }).mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "a" }] }).mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "b" }] }).mockResolvedValueOnce({ rowCount: 0, rows: [] }).mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "d" }] }) };
    const db = { runAsSystem: jest.fn((work: any) => work()), transaction: (work: any) => work(client) } as any;
    const result = await new AnomalyScannerService(db).scanOnce(new Date("2026-08-07T01:00:00Z"));
    expect(result).toEqual(expect.objectContaining({ candidates: 4, emitted: 3, duplicates: 1, assetExecutionAuthorized: false })); expect(db.runAsSystem).toHaveBeenCalledTimes(1);expect(client.query.mock.calls[0][0]).toContain("NOT EXISTS");expect(client.query.mock.calls[1][0]).toContain("NOT EXISTS");
    for (const call of client.query.mock.calls.slice(3)) { expect(call[0]).toContain("ON CONFLICT(id) DO NOTHING"); expect(call[1][7]).toEqual(expect.objectContaining({ assetExecutionAuthorized: false })); }
  });
  it("rejects an invalid reference time before database access", async () => { const db = { runAsSystem: jest.fn() } as any; await expect(new AnomalyScannerService(db).scanOnce(new Date("invalid"))).rejects.toThrow("INVALID_SCAN_REFERENCE_TIME"); expect(db.runAsSystem).not.toHaveBeenCalled(); });
});
