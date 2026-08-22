const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildProjectReportedControlObservation } = require("../dist/evidence-source-engine");
const { AEOS_EVIDENCE_SOURCE_CHAIN_ID } = require("../dist/deployment-engine");

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const artifactPath = path.resolve(process.env.AEOS_LIVE_OBSERVATION_ARTIFACT ?? path.join(__dirname, "../../../reports/live-demo/step-1-commit-observation-request.json"));
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const rebuilt = buildProjectReportedControlObservation({
  chainId: Number(process.env.AEOS_EVIDENCE_SOURCE_CHAIN_ID ?? AEOS_EVIDENCE_SOURCE_CHAIN_ID),
  sourceContract: required("AEOS_EVIDENCE_SOURCE_ADDRESS"),
  reporter: required("AEOS_EVIDENCE_SOURCE_REPORTER_ADDRESS"),
  organizationId: required("AEOS_OBSERVATION_ORGANIZATION_ID"),
  treasuryId: required("AEOS_OBSERVATION_TREASURY_ID"),
  observationKey: required("AEOS_OBSERVATION_KEY"),
  observedAt: Number(required("AEOS_OBSERVATION_OBSERVED_AT")),
});

assert.equal(artifact.schemaVersion, "aeos.live-attestcoin-step.v1");
assert.equal(artifact.step, 1);
assert.equal(artifact.status, "PREPARED_UNSIGNED");
assert.equal(artifact.rawTenantIdentifiersDisclosed, false);
assert.deepEqual(artifact.payload, rebuilt.payload);
assert.equal(artifact.evidencePayloadHash, rebuilt.evidencePayloadHash);
assert.deepEqual(artifact.commitRequest, rebuilt.commitRequest);

console.log(JSON.stringify({
  status: "VERIFIED",
  step: artifact.step,
  observationId: rebuilt.payload.observationId,
  evidencePayloadHash: rebuilt.evidencePayloadHash,
  requestHash: rebuilt.commitRequest.requestHash,
  rawTenantIdentifiersPrinted: false,
  signed: false,
  submitted: false,
  assetExecutionAuthorized: false
}, null, 2));
