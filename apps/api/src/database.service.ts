import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { Pool, PoolClient, QueryResultRow } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import { currentRequestId } from "./request-trace";

export interface DatabaseAccessContext { organizationId?: string | null; userId?: string | null; role?: string | null; systemWorker?: boolean; }

export function resolveMigrationsDirectory(configured=process.env.MIGRATIONS_DIR,workingDirectory=process.cwd(),moduleDirectory=__dirname){
  if(configured)return resolve(workingDirectory,configured);
  const candidates=[resolve(workingDirectory,"infra","migrations"),resolve(workingDirectory,"..","..","infra","migrations"),resolve(moduleDirectory,"..","..","..","infra","migrations")];
  return candidates.find(candidate=>existsSync(candidate))??candidates[0];
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly pool = new Pool({ connectionString: process.env.DATABASE_URL });
  private readonly access = new AsyncLocalStorage<DatabaseAccessContext>();
  async onModuleInit() { await this.migrate(); }
  async onModuleDestroy() { await this.pool.end(); }
  runWithAccessContext<T>(context: DatabaseAccessContext, work: () => T) { return this.access.run(context, work); }
  runWithUser<T>(userId: string, work: () => Promise<T>) { return this.access.run({ userId }, work); }
  runWithTenant<T>(organizationId: string, userId: string, role: string, work: () => Promise<T>) { return this.access.run({ organizationId, userId, role }, work); }
  runAsSystem<T>(work: () => Promise<T>) { return this.access.run({ systemWorker: true }, work); }
  async query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
    const client = await this.pool.connect();
    try { await client.query("BEGIN"); await this.applyAccessContext(client); const result = await client.query<T>(text, values); await client.query("COMMIT"); return result; }
    catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  async transaction<T>(work: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try { await client.query("BEGIN"); await this.applyAccessContext(client); const result = await work(client); await client.query("COMMIT"); return result; }
    catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  private async applyAccessContext(client: PoolClient) {
    const context = this.access.getStore() ?? {};
    await client.query("SET LOCAL ROLE aeos_app");
    await client.query("SELECT set_config('app.current_organization_id',$1,true),set_config('app.current_user_id',$2,true),set_config('app.current_membership_role',$3,true),set_config('app.system_worker',$4,true),set_config('app.current_request_id',$5,true)", [context.organizationId ?? "", context.userId ?? "", context.role ?? "", context.systemWorker ? "on" : "off",currentRequestId()??""]);
  }
  private async migrate() {
    const directory = resolveMigrationsDirectory();
    const files = (await readdir(directory)).filter((file) => /^\d+.*\.sql$/.test(file)).sort();
    await this.pool.query("CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())");
    for (const file of files) {
      const applied = await this.pool.query("SELECT 1 FROM schema_migrations WHERE version=$1", [file]);
      if (applied.rowCount) continue;
      const sql = await readFile(join(directory, file), "utf8");
      const client = await this.pool.connect();
      try { await client.query("BEGIN"); await client.query(sql); await client.query("INSERT INTO schema_migrations(version) VALUES($1)", [file]); await client.query("COMMIT"); }
      catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    }
  }
}
