import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import { DatabaseService } from "./database.service";
import { buildSiweMessage, createOpaqueToken, hashSecret, normalizeWallet, recoverSiweWallet } from "./auth-engine";
import { consumeDatabaseRateLimit } from "./rate-limit-engine";

const makeId = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;
const challengeLifetimeMs = 5 * 60 * 1000;
const sessionMaxAgeSeconds = () => {
  const value = Number(process.env.SESSION_MAX_AGE_SECONDS ?? 43200);
  return Number.isSafeInteger(value) && value >= 300 && value <= 604800 ? value : 43200;
};

export interface AuthContext {
  sessionId: string; userId: string; walletAddress: string; activeOrganizationId: string | null;
  role: string | null; expiresAt: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly db: DatabaseService) {}

  async createChallenge(walletAddress: string, chainId: number) {
    let wallet: string;
    try { wallet = normalizeWallet(walletAddress); } catch { throw new BadRequestException("Invalid wallet address"); }
    await consumeDatabaseRateLimit(this.db,wallet,"auth.challenge",5,600);
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + challengeLifetimeMs);
    const nonce = randomBytes(16).toString("hex");
    const domain = process.env.SIWE_DOMAIN ?? "localhost:3000";
    const uri = process.env.SIWE_URI ?? "http://localhost:3000";
    let message: string;
    try { message = buildSiweMessage({ domain, uri, walletAddress: wallet, chainId, nonce, issuedAt, expiresAt }); }
    catch { throw new ConflictException("SIWE configuration is invalid"); }
    const challengeId = makeId("challenge");
    await this.db.query("INSERT INTO auth_challenges(id,wallet_address,chain_id,nonce,message_hash,issued_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)", [challengeId, wallet, chainId, nonce, hashSecret(message), issuedAt, expiresAt]);
    return { challengeId, message, expiresAt: expiresAt.toISOString(), chainId, assetExecutionAuthorized: false };
  }

  async verify(challengeId: string, message: string, signature: string) {
    await consumeDatabaseRateLimit(this.db,challengeId,"auth.verify",10,600);
    return this.db.transaction(async (client) => {
      const found = await client.query("SELECT * FROM auth_challenges WHERE id=$1 FOR UPDATE", [challengeId]);
      const challenge = found.rows[0];
      if (!challenge) throw new UnauthorizedException("Authentication challenge not found");
      if (challenge.consumed_at) throw new UnauthorizedException("Authentication challenge already consumed");
      if (new Date(challenge.expires_at).getTime() <= Date.now()) throw new UnauthorizedException("Authentication challenge expired");
      if (hashSecret(message) !== challenge.message_hash) throw new UnauthorizedException("Authentication message mismatch");
      let recovered: string;
      try { recovered = recoverSiweWallet(message, signature); } catch { throw new UnauthorizedException("Invalid wallet signature"); }
      if (recovered !== challenge.wallet_address) throw new UnauthorizedException("Wallet signature does not match challenge");
      const consumed = await client.query("UPDATE auth_challenges SET consumed_at=now() WHERE id=$1 AND consumed_at IS NULL RETURNING id", [challengeId]);
      if (!consumed.rowCount) throw new UnauthorizedException("Authentication challenge already consumed");
      const userId = makeId("user");
      const userResult = await client.query("INSERT INTO users(id,wallet_address) VALUES($1,$2) ON CONFLICT(wallet_address) DO UPDATE SET wallet_address=EXCLUDED.wallet_address RETURNING id,wallet_address", [userId, recovered]);
      const user = userResult.rows[0];
      const token = createOpaqueToken();
      const csrfToken = createOpaqueToken();
      const maxAgeSeconds = sessionMaxAgeSeconds();
      const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);
      const sessionId = makeId("session");
      await client.query("INSERT INTO auth_sessions(id,user_id,token_hash,csrf_token_hash,expires_at) VALUES($1,$2,$3,$4,$5)", [sessionId, user.id, hashSecret(token), hashSecret(csrfToken), expiresAt]);
      return { token, csrfToken, maxAgeSeconds, session: { sessionId, userId: user.id, walletAddress: user.wallet_address, activeOrganizationId: null, role: null, expiresAt: expiresAt.toISOString() }, signatureStored: false, privateKeyAccepted: false, assetExecutionAuthorized: false };
    });
  }

  async authenticate(token?: string): Promise<AuthContext> {
    if (!token) throw new UnauthorizedException("Authentication required");
    const result = await this.db.query(`SELECT s.id AS session_id,s.expires_at,s.active_organization_id,u.id AS user_id,u.wallet_address
      FROM auth_sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()`, [hashSecret(token)]);
    const row = result.rows[0];
    if (!row) throw new UnauthorizedException("Session is invalid or expired");
    let role: string | null = null;
    if (row.active_organization_id) {
      const membership = await this.db.runWithUser(row.user_id, () => this.db.query("SELECT role FROM memberships WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE'", [row.active_organization_id, row.user_id]));
      if (!membership.rowCount) throw new UnauthorizedException("Session organization membership is invalid");
      role = membership.rows[0].role;
    }
    return { sessionId: row.session_id, userId: row.user_id, walletAddress: row.wallet_address, activeOrganizationId: row.active_organization_id ?? null, role, expiresAt: new Date(row.expires_at).toISOString() };
  }

  async selectOrganization(context: AuthContext, organizationId: string) {
    const membership = await this.db.runWithUser(context.userId, () => this.db.query("SELECT role FROM memberships WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE'", [organizationId, context.userId]));
    if (!membership.rowCount) throw new UnauthorizedException("Active organization membership required");
    await this.db.query("UPDATE auth_sessions SET active_organization_id=$1 WHERE id=$2 AND user_id=$3 AND revoked_at IS NULL", [organizationId, context.sessionId, context.userId]);
    return { ...context, activeOrganizationId: organizationId, role: membership.rows[0].role };
  }

  async logout(context: AuthContext) {
    await this.db.query("UPDATE auth_sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL", [context.sessionId, context.userId]);
    return { loggedOut: true };
  }

  async validateCsrf(context:AuthContext,token?:string){
    if(!token)throw new ForbiddenException("CSRF token required");
    const result=await this.db.query("SELECT 1 FROM auth_sessions WHERE id=$1 AND user_id=$2 AND csrf_token_hash=$3 AND revoked_at IS NULL AND expires_at>now()",[context.sessionId,context.userId,hashSecret(token)]);
    if(!result.rowCount)throw new ForbiddenException("CSRF token is invalid");
  }
}
