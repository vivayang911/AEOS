import { EvidenceController } from "./evidence.controller";
describe("EvidenceController", () => {
  const auth = { activeOrganizationId: "org_a" } as any;
  it("always forwards the authenticated organization boundary and filters", async () => { const service = { list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }) } as any; const controller = new EvidenceController(service); const query = { status: "VERIFIED", chainId: 11155111, limit: 20 } as any; await controller.list(auth, query); expect(service.list).toHaveBeenCalledWith("org_a", query); });
  it("ignores a spoofed snapshot organization", async () => { const service = { snapshot: jest.fn().mockResolvedValue({ id: "snap_1" }) } as any; const controller = new EvidenceController(service); await controller.snapshot(auth, { organizationId: "org_attacker", evidenceIds: ["ev_1"] }); expect(service.snapshot).toHaveBeenCalledWith("org_a", ["ev_1"]); });
  it("scopes quarantine reads", async () => { const service = { listQuarantine: jest.fn().mockResolvedValue([]) } as any; await new EvidenceController(service).quarantine(auth); expect(service.listQuarantine).toHaveBeenCalledWith("org_a"); });
});
