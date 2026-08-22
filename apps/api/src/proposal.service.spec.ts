import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ProposalService } from "./proposal.service";

const input = { decisionId: "decision_1", simulationId: "sim_1", title: "Treasury rebalance", summary: "Move a governed amount", rationale: "Approved evidence and simulation", createdBy: "reviewer_1", kind: "ERC20_TRANSFER" as const, tokenContract: "0x1111111111111111111111111111111111111111", recipient: "0x2222222222222222222222222222222222222222", amountBaseUnits: "1000000", amountUsd: "1" };

describe("ProposalService governance gates", () => {
  it("does not reveal a proposal belonging to another organization", async () => {
    const db = { query: jest.fn().mockResolvedValue({ rowCount: 0, rows: [] }) } as any;
    await expect(new ProposalService(db).get("org_b", "proposal_org_a")).rejects.toBeInstanceOf(NotFoundException);
    expect(db.query.mock.calls[0][1]).toEqual(["org_b", "proposal_org_a"]);
  });
  it("refuses to build calldata without explicit human Decision approval", async () => {
    const db = { query: jest.fn().mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "decision_1", status: "REVIEW_REQUIRED" }] }).mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "sim_1", status: "SUGGESTED", result: { status: "SUGGESTED", blockers: [], assetExecutionAuthorized: false } }] }) } as any;
    await expect(new ProposalService(db).create("org_a", input)).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).toHaveBeenCalledTimes(2);
  });
  it("refuses a blocked simulation even when the Decision was approved", async () => {
    const decision = { id: "decision_1", status: "APPROVED", human_approval_recorded: true, recommendation: { recommendation: "HOLD", unresolvedDisagreements: 0 } };
    const db = { query: jest.fn().mockResolvedValueOnce({ rowCount: 1, rows: [decision] }).mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "sim_1", status: "BLOCKED", result: { status: "BLOCKED", blockers: ["SLIPPAGE_LIMIT"], assetExecutionAuthorized: false } }] }) } as any;
    await expect(new ProposalService(db).create("org_a", input)).rejects.toBeInstanceOf(BadRequestException);
  });
  it("refuses a Proposal amount that differs from the immutable Simulation impact",async()=>{const decision={id:"decision_1",status:"APPROVED",human_approval_recorded:true,recommendation:{recommendation:"HOLD",unresolvedDisagreements:0}};const simulation={id:"sim_1",status:"SUGGESTED",input:{transferAmountBaseUnits:"999999"},result:{schemaVersion:"treasury.simulation.v2",status:"SUGGESTED",blockers:[],transactionImpact:{tokenBalance:{transferBaseUnits:"999999"}},assetExecutionAuthorized:false}};const db={query:jest.fn().mockResolvedValueOnce({rowCount:1,rows:[decision]}).mockResolvedValueOnce({rowCount:1,rows:[simulation]})} as any;await expect(new ProposalService(db).create("org_a",input)).rejects.toThrow("exactly match");expect(db.query).toHaveBeenCalledTimes(2)});
});
