import { NotFoundException } from "@nestjs/common";
import { PolicyService } from "./policy.service";

describe("PolicyService tenant boundary", () => {
  it("does not reveal a policy belonging to another organization", async () => {
    const db = { query: jest.fn().mockResolvedValue({ rowCount: 0, rows: [] }) } as any;
    await expect(new PolicyService(db).get("org_b", "policy_org_a")).rejects.toBeInstanceOf(NotFoundException);
    expect(db.query.mock.calls[0][1]).toEqual(["org_b", "policy_org_a"]);
  });
  it("scopes simulation listing by both organization and policy", async () => {
    const db = { query: jest.fn().mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "policy_1" }] }).mockResolvedValueOnce({ rowCount: 0, rows: [] }) } as any;
    await new PolicyService(db).listSimulations("org_a", "policy_1");
    expect(db.query.mock.calls[1][1]).toEqual(["org_a", "policy_1"]);
  });
  it("does not reveal a scenario comparison belonging to another organization", async () => {
    const db = { query: jest.fn().mockResolvedValue({ rowCount: 0, rows: [] }) } as any;
    await expect(new PolicyService(db).getScenarioComparison("org_b", "comparison_org_a")).rejects.toBeInstanceOf(NotFoundException);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("organization_id=$1"), ["org_b", "comparison_org_a"]);
  });
  it("rejects duplicate policy versions before querying or persisting", async () => {
    const db = { query: jest.fn() } as any;
    await expect(new PolicyService(db).compareScenarios("org_a", ["policy_1", "policy_1"], "user_1")).rejects.toThrow("DUPLICATE_POLICY_VERSION");
    expect(db.query).not.toHaveBeenCalled();
  });
  it("scopes an adaptive PID snapshot by organization and Policy version",async()=>{
    const db={query:jest.fn().mockResolvedValue({rowCount:0,rows:[]})}as any;
    await expect(new PolicyService(db).getAdaptivePidSnapshot("org_b","policy_b","pid_org_a")).rejects.toBeInstanceOf(NotFoundException);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("organization_id=$1 AND policy_version_id=$2 AND id=$3"),["org_b","policy_b","pid_org_a"]);
  });
});
