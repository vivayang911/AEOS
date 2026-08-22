import { NotFoundException } from "@nestjs/common";
import { OrganizationService } from "./organization.service";
import { AuthContext } from "./auth.service";

const context: AuthContext = { sessionId: "session_1", userId: "user_1", walletAddress: "0xabc", activeOrganizationId: null, role: null, expiresAt: new Date(Date.now() + 60000).toISOString() };

describe("OrganizationService tenant boundary", () => {
  it("creates an ADMIN membership and auditable no-authority organization", async () => {
    const client = { query: jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: "org_1", name: "DAO One", status: "ACTIVE", created_at: new Date("2026-08-06T00:00:00Z") }] })
      .mockResolvedValue({ rowCount: 1, rows: [] }) };
    const db = { transaction: (work: any) => work(client), runWithTenant: (_org:string,_user:string,_role:string,work:any) => work() } as any;
    const result = await new OrganizationService(db).create(context, "DAO One");
    expect(client.query.mock.calls[1][0]).toContain("memberships");
    expect(client.query.mock.calls[1][0]).toContain("'ADMIN'");
    expect(client.query.mock.calls[3][0]).toContain("audit_events");
    expect(client.query.mock.calls[3][1][3].assetExecutionAuthorized).toBe(false);
    expect(result.membership.role).toBe("ADMIN");
    expect(result.assetExecutionAuthorized).toBe(false);
  });

  it("lists only memberships owned by the authenticated user", async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }), runWithUser: (_user:string,work:any) => work() } as any;
    await new OrganizationService(db).list(context);
    expect(db.query.mock.calls[0][1]).toEqual(["user_1"]);
    expect(db.query.mock.calls[0][0]).toContain("m.user_id=$1");
  });

  it("does not query memberships for a non-active organization", async () => {
    const db = { query: jest.fn() } as any;
    await expect(new OrganizationService(db).memberships({ ...context, activeOrganizationId: "org_a" }, "org_b")).rejects.toBeInstanceOf(NotFoundException);
    expect(db.query).not.toHaveBeenCalled();
  });
});
