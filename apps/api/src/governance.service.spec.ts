import { NotFoundException } from "@nestjs/common";
import { MockGovernorAdapter } from "./governance-adapter";
import { GovernanceService } from "./governance.service";

describe("GovernanceService tenant boundary", () => {
  it("returns cross-organization observation access as not found", async () => {
    const db = { query: jest.fn().mockResolvedValue({ rowCount: 0, rows: [] }) } as any;
    await expect(new GovernanceService(db, new MockGovernorAdapter()).list("org_b", "proposal_org_a")).rejects.toBeInstanceOf(NotFoundException);
    expect(db.query.mock.calls[0][1]).toEqual(["org_b", "proposal_org_a"]);
  });
});
