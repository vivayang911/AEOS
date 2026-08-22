import { Wallet } from "ethers";
import { UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
  it("stores only the challenge message hash", async () => {
    const db = { query: jest.fn().mockResolvedValueOnce({ rowCount: 1, rows: [{ count: 1 }] }).mockResolvedValueOnce({ rowCount: 1, rows: [] }) } as any;
    const result = await new AuthService(db).createChallenge("0x444D510728FB8072351cB5d0E88432e6a8501DFA", 102031);
    const values = db.query.mock.calls[1][1];
    expect(db.query.mock.calls[1][0]).toContain("message_hash");
    expect(values).not.toContain(result.message);
    expect(values.some((value: unknown) => typeof value === "string" && /^0x[0-9a-f]{64}$/.test(value))).toBe(true);
    expect(result.assetExecutionAuthorized).toBe(false);
  });

  it("consumes the challenge and persists only a session token hash", async () => {
    const wallet = Wallet.createRandom();
    const setupDb = { query: jest.fn().mockResolvedValueOnce({ rowCount: 1, rows: [{ count: 1 }] }).mockResolvedValueOnce({ rowCount: 1, rows: [] }).mockResolvedValueOnce({ rowCount: 1, rows: [{ count: 1 }] }) } as any;
    const service = new AuthService(setupDb);
    const challenge = await service.createChallenge(wallet.address, 1);
    const inserted = setupDb.query.mock.calls[1][1];
    const row = { id: challenge.challengeId, wallet_address: wallet.address.toLowerCase(), message_hash: inserted[4], expires_at: new Date(Date.now() + 60000), consumed_at: null };
    const client = { query: jest.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [row] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: row.id }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "user_1", wallet_address: row.wallet_address }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) };
    (setupDb as any).transaction = (work: any) => work(client);
    const signature = await wallet.signMessage(challenge.message);
    const verified = await service.verify(challenge.challengeId, challenge.message, signature);
    const sessionValues = client.query.mock.calls[3][1];
    expect(sessionValues).not.toContain(verified.token);
    expect(sessionValues).not.toContain(verified.csrfToken);
    expect(sessionValues[2]).toMatch(/^0x[0-9a-f]{64}$/);
    expect(sessionValues[3]).toMatch(/^0x[0-9a-f]{64}$/);
    expect(verified.signatureStored).toBe(false);
    expect(verified.privateKeyAccepted).toBe(false);
    expect(verified.assetExecutionAuthorized).toBe(false);
  });

  it("rejects a consumed challenge before signature processing", async () => {
    const db = { query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ count: 1 }] }), transaction: (work: any) => work({ query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ consumed_at: new Date() }] }) }) } as any;
    await expect(new AuthService(db).verify("challenge_1", "message", "0x" + "00".repeat(65))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
