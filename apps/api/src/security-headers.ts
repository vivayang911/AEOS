export function apiSecurityHeaders(production:boolean){return {
  "Cache-Control":"no-store",
  "Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "Cross-Origin-Opener-Policy":"same-origin",
  "Cross-Origin-Resource-Policy":"same-site",
  "Permissions-Policy":"camera=(), microphone=(), geolocation=(), payment=()",
  "Referrer-Policy":"no-referrer",
  "X-Content-Type-Options":"nosniff",
  "X-Frame-Options":"DENY",
  ...(production?{"Strict-Transport-Security":"max-age=31536000; includeSubDomains"}:{})
}}

export function allowedWebOrigins(value=process.env.WEB_ORIGIN??"http://localhost:3000"){
  return value.split(",").map((origin)=>origin.trim().replace(/\/$/,"")).filter(Boolean);
}
