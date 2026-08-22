import { AttestcoinController } from "./attestcoin.controller";

describe("AttestcoinController", () => {
  it("forwards the organization boundary on every job mutation", async () => {
    const service = { create: jest.fn(), requestProof: jest.fn(), prepareVerification: jest.fn(), prepareEvidenceAnchor:jest.fn(),confirmEvidenceAnchor:jest.fn(), confirmVerification: jest.fn() } as any;
    const controller = new AttestcoinController(service);
    const auth = { activeOrganizationId: "org_a", walletAddress: "0x444d510728fb8072351cb5d0e88432e6a8501dfa" } as any;
    const body = { sourceTransactionHash: `0x${"11".repeat(32)}`, requesterWallet: "0x1111111111111111111111111111111111111111" };
    await controller.create(auth, body);
    await controller.proof(auth, "job_1");
    await controller.prepare(auth, "job_1");
    await controller.prepareEvidenceAnchor(auth,"job_1",{decisionId:"decision_1"});
    await controller.confirmEvidenceAnchor(auth,"handoff_1",{transactionHash:`0x${"33".repeat(32)}`});
    await controller.confirm(auth, "job_1", { verificationTransactionHash: `0x${"22".repeat(32)}` });
    expect(service.create).toHaveBeenCalledWith("org_a", { ...body, requesterWallet: auth.walletAddress });
    expect(service.requestProof).toHaveBeenCalledWith("org_a", "job_1");
    expect(service.prepareVerification).toHaveBeenCalledWith("org_a", "job_1");
    expect(service.prepareEvidenceAnchor).toHaveBeenCalledWith("org_a","job_1","decision_1");
    expect(service.confirmEvidenceAnchor).toHaveBeenCalledWith("org_a","handoff_1",`0x${"33".repeat(32)}`);
    expect(service.confirmVerification).toHaveBeenCalledWith("org_a", "job_1", `0x${"22".repeat(32)}`);
  });
});
