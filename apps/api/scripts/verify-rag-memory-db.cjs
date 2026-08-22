const path = require("node:path");
const { Pool } = require("pg");
const { DatabaseService } = require("../dist/database.service");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  process.env.MIGRATIONS_DIR ??= path.resolve(__dirname, "../../../infra/migrations");
  const migrations = new DatabaseService();
  await migrations.onModuleInit();
  await migrations.onModuleDestroy();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const migration = await client.query("SELECT 1 FROM schema_migrations WHERE version='027_rag_memory.sql'");
    await client.query("BEGIN");
    await client.query("INSERT INTO organizations(id,name,status) VALUES('org_rag_a','RAG A','ACTIVE'),('org_rag_b','RAG B','ACTIVE')");
    for (const org of ["a", "b"]) {
      await client.query("INSERT INTO knowledge_sources(id,organization_id,source_key,partition,version,title,redacted_content,acl_roles,valid_from,created_by,scan_result,original_content_hash,content_hash) VALUES($1,$2,'policy','GOVERNANCE',1,'Policy','Stablecoin allocation policy','[\"ADMIN\"]',now(),'user','{}',$3,$3)", [`source_${org}`, `org_rag_${org}`, `0x${org}`]);
      await client.query("INSERT INTO knowledge_source_events(id,organization_id,source_id,ordinal,status,actor_id,rationale,payload_hash) VALUES($1,$2,$3,0,'APPROVED','user','approved',$4)", [`event_${org}`, `org_rag_${org}`, `source_${org}`, `0xe${org}`]);
      await client.query("INSERT INTO knowledge_chunks(id,organization_id,source_id,source_version,chunk_index,heading,content,embedding,embedding_model,acl_roles,valid_from,content_hash) VALUES($1,$2,$3,1,0,'Policy','Stablecoin allocation policy','[1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]'::vector,'mock','[\"ADMIN\"]',now(),$4)", [`chunk_${org}`, `org_rag_${org}`, `source_${org}`, `0xc${org}`]);
    }
    await client.query("INSERT INTO organization_memories(id,organization_id,memory_type,content,source_refs,acl_roles,author_id,content_hash,embedding,embedding_model) VALUES('memory_a','org_rag_a','ENTERPRISE','Candidate only','[\"source_a\"]','[\"ADMIN\"]','user','0xmemory','[1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]'::vector,'mock')");
    await client.query("INSERT INTO memory_events(id,organization_id,memory_id,ordinal,status,actor_id,rationale,payload_hash) VALUES('memory_event_a','org_rag_a','memory_a',0,'CANDIDATE','user','pending','0xpending')");
    await client.query("SAVEPOINT immutable");
    let immutable = false;
    try { await client.query("UPDATE knowledge_chunks SET content='mutated' WHERE id='chunk_a'"); }
    catch (error) { immutable = String(error.message).includes("immutable"); await client.query("ROLLBACK TO SAVEPOINT immutable"); }
    const candidateExcluded = Number((await client.query("SELECT count(*)::int count FROM organization_memories m WHERE m.organization_id='org_rag_a' AND m.id='memory_a' AND (SELECT status FROM memory_events e WHERE e.organization_id=m.organization_id AND e.memory_id=m.id ORDER BY ordinal DESC LIMIT 1)='APPROVED'")).rows[0].count) === 0;
    await client.query("SET LOCAL ROLE aeos_app");
    await client.query("SELECT set_config('app.current_organization_id','org_rag_a',true),set_config('app.current_user_id','user',true),set_config('app.current_membership_role','ADMIN',true),set_config('app.system_worker','off',true)");
    const own = Number((await client.query("SELECT count(*)::int count FROM knowledge_chunks WHERE acl_roles ? 'ADMIN'")).rows[0].count);
    const other = Number((await client.query("SELECT count(*)::int count FROM knowledge_chunks WHERE organization_id='org_rag_b'")).rows[0].count);
    const aclDenied = Number((await client.query("SELECT count(*)::int count FROM knowledge_chunks WHERE acl_roles ? 'AUDITOR'")).rows[0].count) === 0;
    await client.query("SAVEPOINT cross_write");
    let crossWrite = false;
    try { await client.query("INSERT INTO memory_events(id,organization_id,memory_id,ordinal,status,actor_id,rationale,payload_hash) VALUES('attack','org_rag_b','memory_a',1,'APPROVED','x','x','x')"); }
    catch (error) { crossWrite = error.code === "42501"; await client.query("ROLLBACK TO SAVEPOINT cross_write"); }
    await client.query("SELECT set_config('app.current_organization_id','',true)");
    const unscoped = Number((await client.query("SELECT count(*)::int count FROM knowledge_chunks")).rows[0].count);
    await client.query("ROLLBACK");
    const result = { migrationApplied: migration.rowCount === 1, immutable, candidateMemoryExcluded: candidateExcluded, ownOrganizationVisible: own === 1, crossTenantReadHidden: other === 0, crossTenantWriteRejected: crossWrite, aclDenied, missingContextFailsClosed: unscoped === 0, assetExecutionAuthorized: false };
    if (!Object.entries(result).every(([key, value]) => key === "assetExecutionAuthorized" ? value === false : value === true)) throw new Error(JSON.stringify(result));
    console.log(JSON.stringify(result));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
