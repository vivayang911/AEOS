const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];
const requireText = (path, pattern, reason) => {
  if (!pattern.test(read(path))) failures.push(`${path}: ${reason}`);
};
const forbidText = (path, pattern, reason) => {
  if (pattern.test(read(path))) failures.push(`${path}: ${reason}`);
};

const canonicalStatusDocuments = [
  "docs/hackathon-competition-audit.md",
  "docs/prd-traceability-matrix.md",
  "docs/submission/submission-consistency-manifest.md",
];

for (const path of canonicalStatusDocuments) {
  forbidText(
    path,
    /(?:public|current-state|explicit public)[^\n]{0,80}(?:push|clean-clone)[^\n]{0,40}pending/i,
    "public repository or clean-clone verification is incorrectly described as pending",
  );
}

requireText(
  "README.md",
  /Public repository status:[^\n]+3e7b3742cd6d807e49c502218397e02b59131846/,
  "verified public-repository checkpoint is missing",
);
requireText(
  "docs/submission/submission-consistency-manifest.md",
  /PUBLIC REPOSITORY VERIFIED \/ LOCAL NARRATED VIDEO HUMAN-ACCEPTED \/ HOSTED VIDEO URL PENDING/,
  "canonical submission status is not reconciled",
);
requireText(
  "docs/submission/submission-consistency-manifest.md",
  /Local narrated video \| `LOCAL-MANUALS\/submission\/AEOS-Judge-Mode-180s-Narrated-v4-final\.mp4` \| Local only; 180-second, 1920×1080 render with narration playback fixed at `1\.0` and gain reduced to `0\.42`; normal-speed human audio\/visual acceptance passed; not public/,
  "the local narrated-video boundary is missing",
);
requireText(
  "docs/submission/submission-consistency-manifest.md",
  /Final video URL \| — \| Pending manual playback acceptance and upload/,
  "the genuinely pending final video must remain explicit",
);
requireText(
  "docs/submission/submission-consistency-manifest.md",
  /Demo URL \| — \| No hosted URL; exact read-only reproduction route documented in `docs\/submission\/judge-local-run\.md`/,
  "the unhosted Demo boundary or exact local reproduction route is missing",
);
const releaseGate = read("scripts/release-gate.ps1");
for (const field of ["apiTests", "apiSuites", "webTests", "tenantRlsTables"]) {
  if (new RegExp(`${field}=(?:'[^']*')?\\d`).test(releaseGate)) {
    failures.push(`scripts/release-gate.ps1: ${field} must not be a hard-coded release count`);
  }
}
if (!releaseGate.includes("Counts are intentionally not hard-coded")) {
  failures.push("scripts/release-gate.ps1: non-hard-coded summary explanation is missing");
}

if (failures.length) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(
  `${JSON.stringify({
    status: "PASS",
    canonicalStatusDocuments: canonicalStatusDocuments.length,
    publicRepositoryCheckpoint: "3e7b3742cd6d807e49c502218397e02b59131846",
    localNarratedVideoPrepared: true,
    finalVideoHosted: false,
    demoUrlPublished: false,
    releaseCountsHardCoded: false,
    assetExecutionAuthorized: false,
  }, null, 2)}\n`,
);
