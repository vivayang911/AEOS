const { Pool } = require("pg");
const { Wallet } = require("ethers");
const path = require("node:path");
const { DatabaseService } = require("../dist/database.service");
const { AuthService } = require("../dist/auth.service");
const { OrganizationService } = require("../dist/organization.service");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  process.env.MIGRATIONS_DIR ??= path.resolve(__dirname, "../../../infra/migrations");
  const migrations = new DatabaseService();
  await migrations.onModuleInit();
  await migrations.onModuleDestroy();

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const scopedDb = {
      query: (text, values = []) => client.query(text, values), transaction: (work) => work(client),
      runWithUser: (_userId, work) => work(), runWithTenant: (_organizationId, _userId, _role, work) => work()
    };
    const auth = new AuthService(scopedDb);
    const organizations = new OrganizationService(scopedDb);
    const wallet = Wallet.createRandom();
    const challenge = await auth.createChallenge(wallet.address, 102031);
    const signature = await wallet.signMessage(challenge.message);
    const verified = await auth.verify(challenge.challengeId, challenge.message, signature);
    const sessionRow = (await client.query("SELECT token_hash,csrf_token_hash FROM auth_sessions WHERE id=$1", [verified.session.sessionId])).rows[0];
    const challengeRow = (await client.query("SELECT message_hash,consumed_at FROM auth_challenges WHERE id=$1", [challenge.challengeId])).rows[0];
    const columns = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN('auth_challenges','auth_sessions')");
    const context = await auth.authenticate(verified.token);
    const organization = await organizations.create(context, "Identity Integration DAO");
    const selectedContext = await auth.authenticate(verified.token);
    const visible = await organizations.list(selectedContext);
    const members = await organizations.memberships(selectedContext, organization.id);

    const otherWallet = Wallet.createRandom();
    const otherChallenge = await auth.createChallenge(otherWallet.address, 102031);
    const otherVerified = await auth.verify(otherChallenge.challengeId, otherChallenge.message, await otherWallet.signMessage(otherChallenge.message));
    const otherContext = await auth.authenticate(otherVerified.token);
    const otherVisible = await organizations.list(otherContext);
    let replayRejected = false;
    try { await auth.verify(challenge.challengeId, challenge.message, signature); }
    catch (error) { replayRejected = String(error.message).includes("consumed"); }
    await client.query("SAVEPOINT audit_immutable");
    let auditAppendOnly = false;
    try { await client.query("UPDATE audit_events SET data='{}'::jsonb WHERE organization_id=$1", [organization.id]); }
    catch (error) { auditAppendOnly = String(error.message).includes("append-only"); await client.query("ROLLBACK TO SAVEPOINT audit_immutable"); }

    const rawSecretSearch = await client.query("SELECT count(*)::int AS count FROM auth_sessions WHERE token_hash=$1", [verified.token]);
    const rawCsrfSearch = await client.query("SELECT count(*)::int AS count FROM auth_sessions WHERE csrf_token_hash=$1", [verified.csrfToken]);
    const result = {
      migrationApplied: (await client.query("SELECT 1 FROM schema_migrations WHERE version='015_identity_organization.sql'")).rowCount === 1,
      exactMessageHashStored: challengeRow.message_hash !== challenge.message && challengeRow.consumed_at !== null,
      rawTokenNotStored: sessionRow.token_hash !== verified.token && rawSecretSearch.rows[0].count === 0,
      rawCsrfNotStored: sessionRow.csrf_token_hash !== verified.csrfToken && rawCsrfSearch.rows[0].count === 0,
      signatureSchemaAbsent: !columns.rows.some((row) => row.column_name.includes("signature") || row.column_name.includes("private_key")),
      replayRejected,
      auditAppendOnly,
      adminMembershipCreated: organization.membership.role === "ADMIN" && members.items.length === 1 && members.items[0].user.walletAddress === wallet.address.toLowerCase(),
      sessionOrganizationSelected: selectedContext.activeOrganizationId === organization.id && selectedContext.role === "ADMIN",
      authenticatedTenantIsolation: visible.items.length === 1 && otherVisible.items.length === 0,
      authorityWithheld: challenge.assetExecutionAuthorized === false && verified.assetExecutionAuthorized === false && organization.assetExecutionAuthorized === false
    };
    await client.query("ROLLBACK");
    if (!Object.values(result).every((value) => value === true)) throw new Error(`Identity integration assertions failed: ${JSON.stringify(result)}`);
    console.log(JSON.stringify(result));
  } finally { client.release(); await pool.end(); }
}

main().catch((error) => { console.error(error); process.exit(1); });
