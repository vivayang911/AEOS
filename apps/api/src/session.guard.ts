import { CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthService } from "./auth.service";
import { parseCookies, SESSION_COOKIE } from "./auth-engine";
import { allowedWebOrigins } from "./security-headers";

export const AUTH_ROLES = "aeos.auth.roles";
export const ORGANIZATION_ROLES = ["ADMIN", "TREASURY_COMMITTEE", "REVIEWER", "OPERATOR", "AUDITOR", "GUARDIAN"] as const;
export const RequireRoles = (...roles: string[]) => SetMetadata(AUTH_ROLES, roles);
export const CurrentAuth = createParamDecorator((_data: unknown, context: ExecutionContext) => context.switchToHttp().getRequest().auth);
export const activeOrganizationId = (auth: { activeOrganizationId: string | null }) => {
  if (!auth.activeOrganizationId) throw new UnauthorizedException("Select an organization first");
  return auth.activeOrganizationId;
};

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService, private readonly reflector: Reflector) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
    request.auth = await this.auth.authenticate(token);
    const method=String(request.method??"GET").toUpperCase();
    if(!["GET","HEAD","OPTIONS"].includes(method)){
      const origins=allowedWebOrigins();
      const origin=typeof request.headers.origin==="string"?request.headers.origin.replace(/\/$/,""):"";
      if(!origin||!origins.includes(origin))throw new ForbiddenException("Request Origin is not allowed");
      await this.auth.validateCsrf(request.auth,request.headers["x-csrf-token"]);
    }
    const roles = this.reflector.getAllAndOverride<string[]>(AUTH_ROLES, [context.getHandler(), context.getClass()]) ?? [];
    if (roles.length && !request.auth.activeOrganizationId) throw new UnauthorizedException("Select an organization first");
    if (roles.length && !roles.includes(request.auth.role)) throw new ForbiddenException("Organization role is not permitted");
    return true;
  }
}
