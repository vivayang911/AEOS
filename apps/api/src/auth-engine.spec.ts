import { Wallet } from "ethers";
import { buildSiweMessage, clearSessionCookie, hashSecret, parseCookies, recoverSiweWallet, sessionCookie } from "./auth-engine";

describe("SIWE authentication guardrails", () => {
  const issuedAt = new Date("2026-08-06T01:00:00.000Z");
  const expiresAt = new Date("2026-08-06T01:05:00.000Z");

  it("builds a deterministic server-owned message that grants no asset authority", () => {
    const message = buildSiweMessage({ domain: "localhost:3000", uri: "http://localhost:3000", walletAddress: "0x444D510728FB8072351cB5d0E88432e6a8501DFA", chainId: 102031, nonce: "0123456789abcdef", issuedAt, expiresAt });
    expect(message).toContain("localhost:3000 wants you to sign in");
    expect(message).toContain("Chain ID: 102031");
    expect(message).toContain("does not authorize any transaction or asset action");
    expect(message).toContain("Expiration Time: 2026-08-06T01:05:00.000Z");
    expect(hashSecret(message)).toBe(hashSecret(message));
  });

  it("recovers only the signer of the exact message", async () => {
    const wallet = Wallet.createRandom();
    const message = buildSiweMessage({ domain: "aeos.test", uri: "https://aeos.test", walletAddress: wallet.address, chainId: 1, nonce: "abcdefgh12345678", issuedAt, expiresAt });
    const signature = await wallet.signMessage(message);
    expect(recoverSiweWallet(message, signature)).toBe(wallet.address.toLowerCase());
    expect(recoverSiweWallet(`${message} changed`, signature)).not.toBe(wallet.address.toLowerCase());
  });

  it("uses an HttpOnly strict cookie and supports explicit clearing", () => {
    const cookie = sessionCookie("opaque/value", 3600, true);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Secure");
    expect(parseCookies(cookie).aeos_session).toBe("opaque/value");
    expect(clearSessionCookie(true)).toContain("Max-Age=0");
  });
});
