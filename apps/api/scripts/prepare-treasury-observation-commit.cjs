const { buildTreasuryObservationCommitRequest, } = require("../dist/evidence-source-engine");
const { AEOS_EVIDENCE_SOURCE_CHAIN_ID } = require("../dist/deployment-engine");

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const request = buildTreasuryObservationCommitRequest({
  chainId: Number(process.env.AEOS_EVIDENCE_SOURCE_CHAIN_ID ?? AEOS_EVIDENCE_SOURCE_CHAIN_ID),
  sourceContract: required("AEOS_EVIDENCE_SOURCE_ADDRESS"),
  reporter: required("AEOS_EVIDENCE_SOURCE_REPORTER_ADDRESS"),
  organizationId: required("AEOS_OBSERVATION_ORGANIZATION_ID"),
  treasuryId: required("AEOS_OBSERVATION_TREASURY_ID"),
  observationKey: required("AEOS_OBSERVATION_KEY"),
  evidencePayloadHash: required("AEOS_OBSERVATION_PAYLOAD_HASH"),
  observedAt: Number(required("AEOS_OBSERVATION_OBSERVED_AT")),
});
console.log(JSON.stringify(request, null, 2));
