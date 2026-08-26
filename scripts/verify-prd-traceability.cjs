const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const baselinePath = path.join(root, 'docs', 'prd-baseline.json');
const matrixPath = path.join(root, 'docs', 'prd-traceability-matrix.md');
const competitionPath = path.join(root, 'docs', 'hackathon-competition-audit.md');
const conceptReconciliationPath = path.join(root, 'docs', 'concept-competition-reconciliation.md');
const failures = [];

function baselineDigest(target) {
  // Git may materialize the same tracked Markdown blob as LF or CRLF depending
  // on checkout settings. The PRD baseline protects semantic text, so hash one
  // canonical LF representation instead of treating line endings as changes.
  const canonicalText = fs.readFileSync(target, 'utf8').replace(/\r\n?/g, '\n');
  return crypto.createHash('sha256').update(canonicalText, 'utf8').digest('hex').toUpperCase();
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const matrix = fs.readFileSync(matrixPath, 'utf8');
const competition = fs.readFileSync(competitionPath, 'utf8');
const conceptReconciliation = fs.readFileSync(conceptReconciliationPath, 'utf8');
const expected = Object.keys(baseline.documents).sort();
const actual = fs.readdirSync(path.join(root, 'PRD'))
  .filter((name) => fs.statSync(path.join(root, 'PRD', name)).isFile())
  .map((name) => `PRD/${name}`)
  .sort();

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  failures.push(`PRD file set changed: expected ${expected.join(', ')}, received ${actual.join(', ')}`);
}

for (const [relative, descriptor] of Object.entries(baseline.documents)) {
  const target = path.join(root, ...relative.split('/'));
  if (!fs.existsSync(target)) {
    failures.push(`Missing ${relative}`);
    continue;
  }
  const digest = baselineDigest(target);
  if (digest !== descriptor.sha256) failures.push(`${relative} hash changed: ${digest}`);
}

for (const [relative, descriptor] of Object.entries(baseline.conceptDocuments ?? {})) {
  const target = path.join(root, ...relative.split('/'));
  if (!fs.existsSync(target)) {
    failures.push(`Missing concept input ${relative}`);
    continue;
  }
  const digest = baselineDigest(target);
  if (digest !== descriptor.sha256) failures.push(`${relative} hash changed: ${digest}`);
}

for (let document = 1; document <= 18; document += 1) {
  const padded = String(document).padStart(2, '0');
  const sections = baseline.documents[expected.find((name) => name.startsWith(`PRD/${padded}-`))]?.sections;
  const marker = `PRD-${padded}.1–${padded}.${sections}`;
  if (!matrix.includes(marker)) failures.push(`Traceability row missing: ${marker}`);
}
for (let story = 1; story <= 8; story += 1) {
  const marker = `US-${String(story).padStart(2, '0')}`;
  if (!matrix.includes(marker)) failures.push(`P0 story missing: ${marker}`);
}
for (let requirement = 1; requirement <= 11; requirement += 1) {
  const marker = `FR-${String(requirement).padStart(2, '0')}`;
  if (!matrix.includes(marker)) failures.push(`Functional requirement missing: ${marker}`);
}

for (const role of ['Governor', 'Research', 'Quant', 'Risk', 'Portfolio', 'Strategy', 'Compliance', 'Treasury']) {
  if (!matrix.includes(role)) failures.push(`Eight-Agent roster not tracked: ${role}`);
}
for (const marker of ['Opportunity Discovery', 'Monitoring Agent', 'A2A', 'institutional memory', 'Evidence Anchor ASC']) {
  if (!conceptReconciliation.includes(marker)) failures.push(`Concept reconciliation missing: ${marker}`);
}
for (const marker of ['ASC', 'testnet', 'public GitHub README', 'deck/whitepaper', 'demo video']) {
  if (!competition.toLowerCase().includes(marker.toLowerCase()) && !matrix.toLowerCase().includes(marker.toLowerCase())) {
    failures.push(`Competition gate not tracked: ${marker}`);
  }
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: 'FAIL', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'PASS',
  baseline: baseline.capturedAt,
  documents: expected.length,
  conceptDocuments: Object.keys(baseline.conceptDocuments ?? {}).length,
  prdSectionsTracked: 18,
  p0StoriesTracked: 8,
  functionalRequirementsTracked: 11,
  agentRolesTracked: 8,
  note: 'This gate verifies baseline integrity and traceability coverage; it does not convert PARTIAL items into acceptance.'
}, null, 2));
