import { NotFoundException } from "@nestjs/common";
import { GovernedSkillService } from "./governed-skill.service";
describe("GovernedSkillService tenant boundary",()=>{
  it("does not reveal another organization's Skill",async()=>{const db={query:jest.fn().mockResolvedValue({rowCount:0,rows:[]})}as any;await expect(new GovernedSkillService(db).get("org_b","skillv_a")).rejects.toBeInstanceOf(NotFoundException);expect(db.query.mock.calls[0][1][0]).toBe("org_b")});
});
