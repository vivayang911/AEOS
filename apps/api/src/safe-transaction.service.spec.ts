import { NotFoundException } from "@nestjs/common";
import { SafeTransactionService } from "./safe-transaction.service";
import { MockSafeTransactionReadAdapter } from "./safe-transaction-adapter";

describe("SafeTransactionService tenant boundary",()=>{
  it("does not reveal another organization's observation",async()=>{const db={query:jest.fn().mockResolvedValue({rowCount:0,rows:[]})} as any;await expect(new SafeTransactionService(db,new MockSafeTransactionReadAdapter()).get("org_b","safeobs_org_a")).rejects.toBeInstanceOf(NotFoundException);expect(db.query.mock.calls[0][1]).toEqual(["org_b","safeobs_org_a"])});
  it("does not call the adapter when the scoped preflight is absent",async()=>{const db={query:jest.fn().mockResolvedValue({rowCount:0,rows:[]})} as any;const adapter={configuration:()=>({}),mode:"mock",provider:"test",read:jest.fn()} as any;await expect(new SafeTransactionService(db,adapter).observe("org_b","preflight_org_a",{safeTxHash:hash})).rejects.toBeInstanceOf(NotFoundException);expect(adapter.read).not.toHaveBeenCalled()});
  it("does not reveal another organization's reconciliation history",async()=>{const db={query:jest.fn().mockResolvedValue({rowCount:0,rows:[]})} as any;await expect(new SafeTransactionService(db,new MockSafeTransactionReadAdapter()).reconciliationAttempts("org_b","preflight_org_a")).rejects.toBeInstanceOf(NotFoundException);expect(db.query.mock.calls[0][1]).toEqual(["org_b","preflight_org_a"])});
});
const hash=`0x${"11".repeat(32)}`;
