const { createHash } = require("node:crypto");
const { Pool } = require("pg");

const connectionString=process.env.DATABASE_RESTORE_MANIFEST_URL;
if(!connectionString)throw new Error("DATABASE_RESTORE_MANIFEST_URL is required");
const hash=value=>createHash("sha256").update(value).digest("hex");

async function main(){
  const pool=new Pool({connectionString,application_name:"aeos-restore-manifest-v1",max:1});
  try{
    const client=await pool.connect();
    try{
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const tables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row=>row.tablename);
      const tableManifest=[];
      for(const table of tables){
        const identifier='"'+table.replaceAll('"','""')+'"';
        const result=await client.query(`SELECT count(*)::text AS count, coalesce(md5(string_agg(row_value, E'\\n' ORDER BY row_value)),'d41d8cd98f00b204e9800998ecf8427e') AS digest FROM (SELECT to_jsonb(source_row)::text AS row_value FROM ${identifier} source_row) rows`);
        tableManifest.push({table,count:result.rows[0].count,digest:result.rows[0].digest});
      }
      const migrations=(await client.query("SELECT version FROM schema_migrations ORDER BY version")).rows.map(row=>row.version);
      const policies=(await client.query("SELECT schemaname,tablename,policyname,roles::text,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname")).rows;
      const triggers=(await client.query("SELECT c.relname AS table_name,t.tgname AS trigger_name,pg_get_triggerdef(t.oid,true) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname")).rows;
      const rlsTables=(await client.query("SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity ORDER BY relname")).rows.map(row=>row.relname);
      await client.query("COMMIT");
      const frozen={schemaVersion:"aeos.database-restore-manifest.v1",migrations,tables:tableManifest,rlsTables,policies,triggers};
      console.log(JSON.stringify({...frozen,manifestHash:hash(JSON.stringify(frozen))}));
    }finally{client.release()}
  }finally{await pool.end()}
}
main().catch(error=>{console.error(error instanceof Error?error.message:"DATABASE_RESTORE_MANIFEST_FAILED");process.exit(1)});
