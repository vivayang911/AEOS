import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { AttestcoinService } from "./attestcoin.service";

describe("AttestcoinService tenant and state guardrails", () => {
  const adapter = { mode: "usc", provider: "fake-usc", configuration: jest.fn(), health: jest.fn(), inspectSourceTransaction: jest.fn(), fetchAndVerifyProof: jest.fn(), buildVerificationRequest: jest.fn(), inspectVerificationTransaction: jest.fn() } as any;
  const reliability = { execute: jest.fn((_org: string, _provider: string, _operation: string, work: () => Promise<unknown>) => work()), health: jest.fn() } as any;
  const anchorReceipt={provider:"mock-anchor",inspect:jest.fn(),configuration:jest.fn()} as any;
  beforeEach(() => jest.clearAllMocks());

  it("returns cross-organization job access as not found", async () => {
    const db = { query: jest.fn().mockResolvedValue({ rowCount: 0, rows: [] }) } as any;
    await expect(new AttestcoinService(db, adapter, reliability,anchorReceipt).get("org_b", "uscjob_org_a")).rejects.toBeInstanceOf(NotFoundException);
    expect(db.query.mock.calls[0][1]).toEqual(["org_b", "uscjob_org_a"]);
  });

  it("will not prepare a wallet request before an immutable proof exists", async () => {
    const db = { query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ id: "job_1", organization_id: "org_a", proof_snapshot: null }] }) } as any;
    await expect(new AttestcoinService(db, adapter, reliability,anchorReceipt).prepareVerification("org_a", "job_1")).rejects.toBeInstanceOf(BadRequestException);
    expect(adapter.buildVerificationRequest).not.toHaveBeenCalled();
  });

  it("records a retryable attestation state without leaking an unbounded upstream error", async () => {
    adapter.fetchAndVerifyProof.mockRejectedValueOnce(new Error("PROOF_NOT_READY:upstream details that must not be persisted"));
    const row = { id: "job_1", organization_id: "org_a", source_snapshot: { transactionHash: `0x${"11".repeat(32)}` }, proof_snapshot: null };
    const db = { query: jest.fn().mockResolvedValueOnce({ rowCount: 1, rows: [row] }).mockResolvedValueOnce({ rowCount: 1, rows: [] }) } as any;
    await expect(new AttestcoinService(db, adapter, reliability,anchorReceipt).requestProof("org_a", "job_1")).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(db.query.mock.calls[1][1]).toEqual(["org_a", "job_1", "PROOF_NOT_READY"]);
  });

  it("rejects an idempotency collision that changes the requester wallet", async () => {
    const db = { query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ requester_wallet: "0x1111111111111111111111111111111111111111" }] }) } as any;
    const input = { sourceTransactionHash: `0x${"11".repeat(32)}`, requesterWallet: "0x2222222222222222222222222222222222222222" };
    await expect(new AttestcoinService(db, adapter, reliability,anchorReceipt).create("org_a", input)).rejects.toBeInstanceOf(ConflictException);
    expect(adapter.inspectSourceTransaction).not.toHaveBeenCalled();
  });

  it("quarantines deterministic proof failures instead of retrying them", async () => {
    adapter.fetchAndVerifyProof.mockRejectedValueOnce(new Error("PROOF_SOURCE_MISMATCH"));
    const row = { id: "job_1", organization_id: "org_a", source_snapshot: { chainId: 11155111 }, proof_snapshot: null };
    const client = { query: jest.fn().mockResolvedValueOnce({ rows: [{ id: "raw_1" }] }).mockResolvedValue({ rows: [] }) };
    const db = { query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [row] }), transaction: jest.fn(async (work) => work(client)) } as any;
    await expect(new AttestcoinService(db, adapter, reliability,anchorReceipt).requestProof("org_a", "job_1")).rejects.toBeInstanceOf(BadRequestException);
    expect(client.query.mock.calls.some(([sql]: [string]) => sql.includes("evidence_quarantine"))).toBe(true);
    expect(client.query.mock.calls.some(([sql]: [string]) => sql.includes("status='REJECTED'"))).toBe(true);
  });
});
