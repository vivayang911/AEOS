import { NotFoundException } from "@nestjs/common";
import { CounterfactualAssessmentService } from "./counterfactual-assessment.service";

describe("CounterfactualAssessmentService tenant boundary", () => {
  it("hides another organization's assessment", async () => {
    const db = { query: jest.fn().mockResolvedValue({ rowCount: 0, rows: [] }) } as any;
    await expect(new CounterfactualAssessmentService(db).get("org_b", "outcome_a", "assessment_a")).rejects.toBeInstanceOf(NotFoundException);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("organization_id=$1"), ["org_b", "outcome_a", "assessment_a"]);
  });
  it("requires the parent outcome to exist inside the selected organization", async () => {
    const db = { query: jest.fn().mockResolvedValue({ rowCount: 0, rows: [] }) } as any;
    await expect(new CounterfactualAssessmentService(db).list("org_b", "outcome_a")).rejects.toBeInstanceOf(NotFoundException);
  });
});
