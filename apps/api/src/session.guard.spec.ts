import { ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { SessionGuard } from "./session.guard";

const executionContext = (cookie = "aeos_session=opaque", request: Record<string,unknown> = {}) => ({
  switchToHttp: () => ({ getRequest: () => ({ headers: { cookie }, ...request }) }),
  getHandler: () => function handler() {},
  getClass: () => class Controller {}
}) as unknown as ExecutionContext;

describe("SessionGuard RBAC", () => {
  it("attaches authenticated organization context", async () => {
    const auth = { authenticate: jest.fn().mockResolvedValue({ activeOrganizationId: "org_1", role: "ADMIN" }) } as any;
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue([]) } as any;
    expect(await new SessionGuard(auth, reflector).canActivate(executionContext())).toBe(true);
    expect(auth.authenticate).toHaveBeenCalledWith("opaque");
  });
  it("requires organization selection for role-protected endpoints", async () => {
    const auth = { authenticate: jest.fn().mockResolvedValue({ activeOrganizationId: null, role: null }) } as any;
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(["ADMIN"]) } as any;
    await expect(new SessionGuard(auth, reflector).canActivate(executionContext())).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it("rejects a role outside the endpoint allowlist", async () => {
    const auth = { authenticate: jest.fn().mockResolvedValue({ activeOrganizationId: "org_1", role: "OPERATOR" }) } as any;
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(["ADMIN", "AUDITOR"]) } as any;
    await expect(new SessionGuard(auth, reflector).canActivate(executionContext())).rejects.toBeInstanceOf(ForbiddenException);
  });
  it("rejects unsafe requests without an approved Origin",async()=>{
    const auth={authenticate:jest.fn().mockResolvedValue({sessionId:"session_1",userId:"user_1",activeOrganizationId:"org_1",role:"ADMIN"}),validateCsrf:jest.fn()} as any;
    const reflector={getAllAndOverride:jest.fn().mockReturnValue([])} as any;
    await expect(new SessionGuard(auth,reflector).canActivate(executionContext("aeos_session=opaque",{method:"POST"}))).rejects.toBeInstanceOf(ForbiddenException);
    expect(auth.validateCsrf).not.toHaveBeenCalled();
  });
  it("validates the session-bound CSRF token for an approved Origin",async()=>{
    const context={sessionId:"session_1",userId:"user_1",activeOrganizationId:"org_1",role:"ADMIN"};
    const auth={authenticate:jest.fn().mockResolvedValue(context),validateCsrf:jest.fn().mockResolvedValue(undefined)} as any;
    const reflector={getAllAndOverride:jest.fn().mockReturnValue([])} as any;
    expect(await new SessionGuard(auth,reflector).canActivate(executionContext("aeos_session=opaque",{method:"POST",headers:{cookie:"aeos_session=opaque",origin:"http://localhost:3000","x-csrf-token":"csrf"}}))).toBe(true);
    expect(auth.validateCsrf).toHaveBeenCalledWith(context,"csrf");
  });
});
