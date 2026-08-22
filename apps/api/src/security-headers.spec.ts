import { allowedWebOrigins, apiSecurityHeaders } from "./security-headers";

describe("API security headers",()=>{
  it("denies embedding and disables caching by default",()=>{
    const headers=apiSecurityHeaders(false);
    expect(headers["Cache-Control"]).toBe("no-store");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers).not.toHaveProperty("Strict-Transport-Security");
  });

  it("enables HSTS in production",()=>expect(apiSecurityHeaders(true)["Strict-Transport-Security"]).toContain("max-age=31536000"));
  it("normalizes a comma-separated CORS allowlist",()=>expect(allowedWebOrigins("http://localhost:3000/, https://console.example")).toEqual(["http://localhost:3000","https://console.example"]));
});
