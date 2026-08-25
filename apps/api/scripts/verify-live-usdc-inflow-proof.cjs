const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { validateStoredArtifact } = require("./live-usdc-inflow-proof.cjs");

try {
  const inputPath = resolve(process.env.AEOS_LIVE_USDC_PROOF_OUTPUT || resolve(__dirname, "../../../reports/live-demo/real-usdc-inflow-usc-proof-v1.json"));
  const result = validateStoredArtifact(JSON.parse(readFileSync(inputPath, "utf8")));
  console.log(JSON.stringify({ status: "LIVE_USDC_INFLOW_PROOF_ARTIFACT_VERIFIED", inputPath, ...result, signerCustody: false, broadcastCapability: false }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "LIVE_USDC_PROOF_ARTIFACT_VERIFICATION_FAILED");
  process.exit(1);
}
