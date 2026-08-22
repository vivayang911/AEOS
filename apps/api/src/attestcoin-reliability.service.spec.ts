import { ServiceUnavailableException } from "@nestjs/common";
import { AttestcoinReliabilityService, isRetryableProviderError } from "./attestcoin-reliability.service";

const database = () => { const client = { query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ id: "call_1" }] }) }; return { client, db: { transaction: (work: any) => work(client), query: jest.fn().mockResolvedValue({ rows: [] }) } as any }; };

describe("Attestcoin provider reliability boundary", () => {
  it("retries only transient failures and persists the successful attempt count", async () => {
    const { client, db } = database(); const work = jest.fn().mockRejectedValueOnce(new Error("ECONNRESET")).mockResolvedValue({ ok: true });
    await expect(new AttestcoinReliabilityService(db).execute("org_1", "provider_1", "proof", work)).resolves.toEqual({ ok: true });
    expect(work).toHaveBeenCalledTimes(2); expect(client.query.mock.calls[0][1][5]).toBe(2); expect(client.query.mock.calls[0][1][4]).toBe("SUCCESS");
  });
  it("never retries deterministic proof validation failures", async () => {
    const { client, db } = database(); const work = jest.fn().mockRejectedValue(new Error("PROOF_SOURCE_MISMATCH"));
    await expect(new AttestcoinReliabilityService(db).execute("org_1", "provider_1", "proof", work)).rejects.toThrow("PROOF_SOURCE_MISMATCH");
    expect(work).toHaveBeenCalledTimes(1); expect(client.query.mock.calls[0][1][4]).toBe("NON_RETRYABLE_FAILURE"); expect(client.query.mock.calls[0][1][5]).toBe(1);
  });
  it("opens after three exhausted operations and fails the next call without network work", async () => {
    const { client, db } = database(); const reliability = new AttestcoinReliabilityService(db); const failure = () => Promise.reject(new Error("PROVIDER_TIMEOUT"));
    for (let count = 0; count < 3; count += 1) await expect(reliability.execute("org_1", "provider_1", "proof", failure)).rejects.toBeInstanceOf(ServiceUnavailableException);
    const blocked = jest.fn(); await expect(reliability.execute("org_1", "provider_1", "proof", blocked)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(blocked).not.toHaveBeenCalled(); expect(client.query.mock.calls.some((call) => call[0].includes("attestcoin.provider_unavailable"))).toBe(true);
  });
  it("classifies bounded retry errors without treating proof state as provider failure", () => { expect(isRetryableProviderError(new Error("HTTP_503"))).toBe(true); expect(isRetryableProviderError(new Error("PROOF_NOT_READY"))).toBe(false); expect(isRetryableProviderError(new Error("PROOF_STATIC_VERIFICATION_FAILED"))).toBe(false); });
  it("returns only tenant-scoped stored observations and performs no active probe", async () => { const { db } = database(); await new AttestcoinReliabilityService(db).health("org_1", "provider_1"); expect(db.query.mock.calls[0][1]).toEqual(["org_1", "provider_1"]); });
});
