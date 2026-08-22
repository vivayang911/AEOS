import { BadRequestException, NotFoundException } from "@nestjs/common";
import { EvidenceService } from "./evidence.service";
describe("EvidenceService guardrails", () => {
  it("rejects malformed cursors before querying", async () => { const db = { query: jest.fn() } as any; await expect(new EvidenceService(db).list("org_a", { cursor: "bad", limit: 20 } as any)).rejects.toBeInstanceOf(BadRequestException); expect(db.query).not.toHaveBeenCalled(); });
  it("returns no cross-organization object as not found", async () => { const db = { query: jest.fn().mockResolvedValue({ rowCount: 0, rows: [] }) } as any; await expect(new EvidenceService(db).get("org_b", "ev_org_a")).rejects.toBeInstanceOf(NotFoundException); expect(db.query.mock.calls[0][1]).toEqual(["org_b", "ev_org_a"]); });
  it("refuses incomplete snapshot membership", async () => { const db = { query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ id: "ev_1", content_hash: "0x1", verification_status: "VERIFIED" }] }) } as any; await expect(new EvidenceService(db).snapshot("org_a", ["ev_1", "ev_2"])).rejects.toBeInstanceOf(NotFoundException); });
});
