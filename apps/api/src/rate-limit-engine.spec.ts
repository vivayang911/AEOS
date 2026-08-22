import { consumeDatabaseRateLimit } from "./rate-limit-engine";

describe("database rate limits",()=>{
  it("increments a hashed fixed-window key without persisting the subject",async()=>{
    const db={query:jest.fn().mockResolvedValue({rows:[{count:2}]})} as any;
    const result=await consumeDatabaseRateLimit(db,"0xwallet","auth.challenge",5,600);
    expect(result).toEqual({limit:5,remaining:3,windowSeconds:600});
    expect(db.query.mock.calls[0][1][0]).toMatch(/^0x[0-9a-f]{64}$/);
    expect(db.query.mock.calls[0][1]).not.toContain("0xwallet");
  });

  it("fails closed with 429 after the deterministic limit",async()=>{
    const db={query:jest.fn().mockResolvedValue({rows:[{count:6}]})} as any;
    await expect(consumeDatabaseRateLimit(db,"subject","action",5,60)).rejects.toMatchObject({status:429});
  });
});
