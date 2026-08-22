import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { CreateAuthChallengeDto, SelectOrganizationDto, VerifyAuthChallengeDto } from "./auth.dto";
import { clearSessionCookie, sessionCookie } from "./auth-engine";
import { SessionGuard } from "./session.guard";

const secureCookies = () => process.env.NODE_ENV === "production";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post("nonce") challenge(@Body() body: CreateAuthChallengeDto) { return this.auth.createChallenge(body.walletAddress, body.chainId); }
  @Post("verify") async verify(@Body() body: VerifyAuthChallengeDto, @Res({ passthrough: true }) response: any) {
    const result = await this.auth.verify(body.challengeId, body.message, body.signature);
    response.setHeader("Set-Cookie", sessionCookie(result.token, result.maxAgeSeconds, secureCookies()));
    const { token: _token, maxAgeSeconds: _maxAge, ...safe } = result;
    return safe;
  }
  @Get("session") @UseGuards(SessionGuard) session(@Req() request: any) { return request.auth; }
  @Post("select-organization") @UseGuards(SessionGuard) select(@Req() request: any, @Body() body: SelectOrganizationDto) { return this.auth.selectOrganization(request.auth, body.organizationId); }
  @Post("logout") @UseGuards(SessionGuard) async logout(@Req() request: any, @Res({ passthrough: true }) response: any) {
    const result = await this.auth.logout(request.auth);
    response.setHeader("Set-Cookie", clearSessionCookie(secureCookies()));
    return result;
  }
}
