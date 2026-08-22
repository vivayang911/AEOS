const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { verifyAEOSEvidenceSourceArtifact } = require("../dist/contract-surface-engine");

const artifactPath = resolve(
  process.env.AEOS_EVIDENCE_SOURCE_ARTIFACT_PATH
    || resolve(__dirname, "../../../contracts/out/AEOSTreasuryEvidenceSource.sol/AEOSTreasuryEvidenceSource.json"),
);
const result = verifyAEOSEvidenceSourceArtifact(JSON.parse(readFileSync(artifactPath, "utf8")));
console.log(JSON.stringify(result));
if (result.status !== "VERIFIED") process.exitCode = 1;
