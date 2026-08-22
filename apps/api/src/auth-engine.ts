import { createHash, randomBytes } from "node:crypto";
import { getAddress, verifyMessage } from "ethers";

export const SESSION_COOKIE = "aeos_session";
export const hashSecret = (value: string) => `0x${createHash("sha256").update(value).digest("hex")}`;
export const createOpaqueToken = () => randomBytes(32).toString("base64url");
export const normalizeWallet = (value: string) => getAddress(value).toLowerCase();

export interface SiweMessageInput {
  domain: string; uri: string; walletAddress: string; chainId: number; nonce: string;
  issuedAt: Date; expiresAt: Date;
}

export function buildSiweMessage(input: SiweMessageInput) {
  if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(input.domain)) throw new Error("INVALID_SIWE_DOMAIN");
  const uri = new URL(input.uri);
  if (!['http:', 'https:'].includes(uri.protocol)) throw new Error("INVALID_SIWE_URI");
  if (!Number.isSafeInteger(input.chainId) || input.chainId <= 0) throw new Error("INVALID_CHAIN_ID");
  if (!/^[A-Za-z0-9]{8,64}$/.test(input.nonce)) throw new Error("INVALID_NONCE");
  if (input.expiresAt.getTime() <= input.issuedAt.getTime()) throw new Error("INVALID_EXPIRY");
  return `${input.domain} wants you to sign in with your Ethereum account:\n${getAddress(input.walletAddress)}\n\nSign in to AEOS. This request does not authorize any transaction or asset action.\n\nURI: ${uri.toString()}\nVersion: 1\nChain ID: ${input.chainId}\nNonce: ${input.nonce}\nIssued At: ${input.issuedAt.toISOString()}\nExpiration Time: ${input.expiresAt.toISOString()}`;
}

export function recoverSiweWallet(message: string, signature: string) {
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new Error("INVALID_SIGNATURE_FORMAT");
  return normalizeWallet(verifyMessage(message, signature));
}

export function parseCookies(header?: string) {
  const result: Record<string, string> = {};
  for (const entry of header?.split(";") ?? []) {
    const index = entry.indexOf("=");
    if (index > 0) result[entry.slice(0, index).trim()] = decodeURIComponent(entry.slice(index + 1).trim());
  }
  return result;
}

export function sessionCookie(token: string, maxAgeSeconds: number, secure: boolean) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/api/v1; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`;
}
export function clearSessionCookie(secure: boolean) {
  return `${SESSION_COOKIE}=; Path=/api/v1; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
}
