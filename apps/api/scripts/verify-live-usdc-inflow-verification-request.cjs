const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { validateVerificationArtifact } = require("./prepare-live-usdc-inflow-verification-request.cjs");

try {
  const proofPath = resolve(process.env.AEOS_LIVE_USDC_PROOF_OUTPUT || resolve(__dirname, "../../../reports/live-demo/real-usdc-inflow-usc-proof-v1.json"));
  const requestPath = resolve(process.env.AEOS_LIVE_USDC_VERIFICATION_REQUEST_OUTPUT || resolve(__dirname, "../../../reports/live-demo/real-usdc-inflow-usc-verification-request-v1.json"));
  const result = validateVerificationArtifact(JSON.parse(readFileSync(proofPath, "utf8")), JSON.parse(readFileSync(requestPath, "utf8")));
  console.log(JSON.stringify({ status: "LIVE_USDC_VERIFY_AND_EMIT_ARTIFACT_VERIFIED", requestPath, ...result }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "LIVE_USDC_VERIFICATION_ARTIFACT_FAILED");
  process.exit(1);
}
