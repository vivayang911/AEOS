import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadDemoFixture, runDemoFixture } from "./demo-fixture-engine";

const report = runDemoFixture(loadDemoFixture());
const reportDirectory = resolve(__dirname, "../../../reports/demo");
mkdirSync(reportDirectory, { recursive: true });
writeFileSync(resolve(reportDirectory, "phase5-demo.v3.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
const lines = [
  "# AEOS Phase 5 deterministic demo report",
  "",
  `- Fixture: \`${report.fixtureVersion}\``,
  `- Organization: \`${report.organizationId}\``,
  `- Fixture hash: \`${report.fixtureHash}\``,
  `- Report hash: \`${report.reportHash}\``,
  `- Data boundary: \`${report.fixtureBoundary.mode}\`, live on-chain verified=${report.fixtureBoundary.liveOnchainVerified}`,
  `- Evidence manifest: \`${report.trace.evidence.manifestHash}\` (${report.trace.evidence.count} items)`,
  `- Decision: \`${report.trace.decision.recommendation}\`, citation coverage ${report.trace.decision.citationCoverage * 100}%`,
  `- Simulation: \`${report.trace.policy.simulationStatus}\`, advisory only`,
  `- Proposal calldata consistent: \`${report.trace.proposal.consistencyVerified}\``,
  `- Ready boundary: \`${report.trace.execution.readyStatus}\`, signed=${report.trace.execution.signed}, submitted=${report.trace.execution.submitted}`,
  `- Pause drill: \`${report.trace.execution.pausedStatus}\` (${report.trace.execution.pausedBlockers.join(", ")}), Safe handoff omitted`,
  `- Stale Evidence drill: \`${report.trace.refusal.recommendation}\` (${report.trace.refusal.blockers.join(", ")})`,
  "- Asset execution authorized: `false` at Decision, Simulation, Proposal, Preflight, and refusal boundaries",
  "",
  "This artifact is deterministic and contains no credentials, signatures, wallet session, transaction submission, or asset-moving operation. Fixed governance and Guard snapshots exercise validation logic only and are not live on-chain evidence.",
  "",
];
writeFileSync(resolve(reportDirectory, "phase5-demo.v3.md"), lines.join("\n"), "utf8");
console.log(JSON.stringify({ status: "PASS", fixture: report.fixtureVersion, reportHash: report.reportHash, evidenceCount: report.trace.evidence.count, citationCoverage: report.trace.decision.citationCoverage, signed: report.trace.execution.signed, submitted: report.trace.execution.submitted, assetExecutionAuthorized: report.trace.execution.assetExecutionAuthorized }));
