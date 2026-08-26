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
  /Public repository status:[^\n]+58948cf61953c6405b0963cc7a247607d846d52f/,
  "verified public-repository checkpoint is missing",
);
requireText(
  "docs/submission/submission-consistency-manifest.md",
  /PUBLIC REPOSITORY VERIFIED \/ VIDEO RECORDING AND HOSTED URLS PENDING/,
  "canonical submission status is not reconciled",
);
requireText(
  "docs/submission/submission-consistency-manifest.md",
  /Final video URL \| — \| Pending recording\/upload/,
  "the genuinely pending final video must remain explicit",
);
requireText(
  "docs/submission/submission-consistency-manifest.md",
  /Demo URL \| — \| Pending hosting decision or documented local-demo route/,
  "the genuinely pending Demo URL must remain explicit",
);
requireText(
  "CODEX-DEVELOPMENT-BRIEF.md",
  /Historical pre-deployment checkpoint \(superseded by the accepted 2026-08-26 lineage above\)/,
  "Balance Observer handoff history is not clearly marked as superseded",
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
    publicRepositoryCheckpoint: "58948cf61953c6405b0963cc7a247607d846d52f",
    finalVideoHosted: false,
    demoUrlPublished: false,
    releaseCountsHardCoded: false,
    assetExecutionAuthorized: false,
  }, null, 2)}\n`,
);
