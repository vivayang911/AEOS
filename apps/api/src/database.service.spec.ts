import { resolve } from "node:path";
import { DatabaseService, resolveMigrationsDirectory } from "./database.service";
import { runWithRequestTrace } from "./request-trace";

describe("DatabaseService request trace context",()=>{
  it("sets the transaction-local request ID without placing it in business payloads",async()=>{
    const service=new DatabaseService();const client={query:jest.fn().mockResolvedValue({rows:[]})};
    await runWithRequestTrace("trace_database_1",()=> (service as any).applyAccessContext(client));
    expect(client.query.mock.calls[1][0]).toContain("app.current_request_id");expect(client.query.mock.calls[1][1][4]).toBe("trace_database_1");
  });
  it("resolves repository migrations when npm runs from the API workspace",()=>{
    const repositoryRoot=resolve(__dirname,"..","..","..");
    expect(resolveMigrationsDirectory(undefined,resolve(repositoryRoot,"apps","api"),__dirname)).toBe(resolve(repositoryRoot,"infra","migrations"));
  });
  it("honors an explicit migrations directory",()=>{
    expect(resolveMigrationsDirectory("./custom-migrations","C:\\aeos")).toBe(resolve("C:\\aeos","custom-migrations"));
  });
});
