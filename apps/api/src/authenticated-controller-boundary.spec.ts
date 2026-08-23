import { DecisionController } from "./decision.controller";
import { ExecutionController } from "./execution.controller";
import { PolicyController } from "./policy.controller";
import { ProposalController } from "./proposal.controller";
import { KnowledgeController } from "./knowledge.controller";

const auth = { activeOrganizationId: "org_session", userId: "user_session", walletAddress: "0x1111111111111111111111111111111111111111",role:"ADMIN" } as any;

describe("authenticated controller authority boundary", () => {
  it("overrides caller-controlled organization and actor fields", async () => {
    const decisions = { enqueue: jest.fn(), list:jest.fn(), review: jest.fn() } as any;
    const decisionController = new DecisionController(decisions);
    await decisionController.create(auth, { organizationId: "org_attacker", objective: "Review treasury evidence", evidenceIds: ["ev_1"] }, "key_1");
    await decisionController.list(auth,{status:"REVIEW_REQUIRED",limit:20});
    await decisionController.review("decision_1", auth, { organizationId: "org_attacker", actorId: "attacker", rationale: "Reviewed evidence", outcome: "APPROVED" });
    expect(decisions.enqueue).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org_session" }), "key_1","ADMIN");
    expect(decisions.list).toHaveBeenCalledWith("org_session",{status:"REVIEW_REQUIRED",limit:20});
    expect(decisions.review).toHaveBeenCalledWith("decision_1", expect.objectContaining({ organizationId: "org_session", actorId: "user_session" }));

    const policies = { activate: jest.fn() } as any;
    await new PolicyController(policies).activate(auth, "policy_1", { actorId: "attacker" });
    expect(policies.activate).toHaveBeenCalledWith("org_session", "policy_1", "user_session");

    const proposals = { create: jest.fn() } as any;
    const proposal = { decisionId: "decision_1", simulationId: "sim_1", title: "Treasury proposal", summary: "Evidence-backed proposal", rationale: "Within deterministic limits", createdBy: "attacker", kind: "ERC20_TRANSFER", tokenContract: auth.walletAddress, recipient: auth.walletAddress, amountBaseUnits: "1", amountUsd: "1" } as any;
    await new ProposalController(proposals).create(auth, proposal);
    expect(proposals.create).toHaveBeenCalledWith("org_session", expect.objectContaining({ createdBy: "user_session" }));

    const execution = { preflight: jest.fn() } as any;
    await new ExecutionController(execution).preflight(auth, "proposal_1", { actorId: "attacker", validForSeconds: 300 });
    expect(execution.preflight).toHaveBeenCalledWith("org_session", "proposal_1", { actorId: "user_session", validForSeconds: 300 });

    const knowledge={createSource:jest.fn(),search:jest.fn(),createMemory:jest.fn()} as any;const knowledgeController=new KnowledgeController(knowledge);
    await knowledgeController.createSource(auth,{organizationId:"org_attacker",sourceKey:"policy",partition:"GOVERNANCE",title:"Policy",content:"Approved text",aclRoles:["ADMIN"]});
    await knowledgeController.search(auth,{organizationId:"org_attacker",query:"policy",limit:8});
    expect(knowledge.createSource).toHaveBeenCalledWith("org_session","user_session",expect.objectContaining({organizationId:"org_attacker"}));
    expect(knowledge.search).toHaveBeenCalledWith("org_session",auth.role,expect.objectContaining({query:"policy"}));
  });
});
