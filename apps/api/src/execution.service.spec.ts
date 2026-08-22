import { NotFoundException } from "@nestjs/common";
import { ExecutionService } from "./execution.service";
import { MockTreasuryGuardReadAdapter } from "./treasury-guard-adapter";

describe("ExecutionService tenant boundary",()=>{
  it("does not reveal another organization's preflight",async()=>{const db={query:jest.fn().mockResolvedValue({rowCount:0,rows:[]})} as any;await expect(new ExecutionService(db,new MockTreasuryGuardReadAdapter()).get("org_b","preflight_org_a")).rejects.toBeInstanceOf(NotFoundException);expect(db.query.mock.calls[0][1]).toEqual(["org_b","preflight_org_a"])});
});
