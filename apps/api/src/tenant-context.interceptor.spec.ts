import { of } from "rxjs";
import { TenantContextInterceptor } from "./tenant-context.interceptor";

describe("TenantContextInterceptor", () => {
  it("creates authenticated database context around actual handler subscription", (done) => {
    let active = false;
    const db = { runWithAccessContext: jest.fn((context: unknown, work: () => unknown) => { active = true; try { return work(); } finally { active = false; } }) } as any;
    const interceptor = new TenantContextInterceptor(db);
    const context = { switchToHttp: () => ({ getRequest: () => ({ auth: { activeOrganizationId: "org_session", userId: "user_session", role: "ADMIN" } }) }) } as any;
    const next = { handle: jest.fn(() => { expect(active).toBe(true); return of({ ok: true }); }) } as any;
    interceptor.intercept(context, next).subscribe({ next: (value) => expect(value).toEqual({ ok: true }), complete: () => {
      expect(db.runWithAccessContext).toHaveBeenCalledWith({ organizationId: "org_session", userId: "user_session", role: "ADMIN" }, expect.any(Function)); done();
    } });
  });
});
