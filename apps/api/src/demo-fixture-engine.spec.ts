import { loadDemoFixture, runDemoFixture, validateDemoFixture } from "./demo-fixture-engine";

describe("Phase 5 deterministic demo fixture", () => {
  it("reproduces the same trace and hashes without mutating the fixture", () => {
    const fixture = loadDemoFixture();
    const before = JSON.stringify(fixture);
    const first = runDemoFixture(fixture);
    const second = runDemoFixture(fixture);
    expect(second).toEqual(first);
    expect(JSON.stringify(fixture)).toBe(before);
    expect(first.trace.evidence.count).toBe(2);
    expect(first.trace.decision).toMatchObject({ recommendation: "HOLD", citationCoverage: 1, actions: 0, assetExecutionAuthorized: false });
    expect(first.trace.policy).toMatchObject({ simulationStatus: "SUGGESTED", advisoryOnly: true, assetExecutionAuthorized: false });
    expect(first.trace.proposal).toMatchObject({ consistencyVerified: true, assetExecutionAuthorized: false });
    expect(first.fixtureBoundary).toEqual({ mode: "DETERMINISTIC_OFFLINE", liveOnchainVerified: false, databasePersisted: false, externalProviderCalled: false });
    expect(first.trace.decision).toMatchObject({agentRoster:["Governor","Research","Strategy","Quant","Risk","Compliance","Portfolio","Treasury"]});
    expect(first.trace.decision.a2aMessages).toBeGreaterThan(0);
    expect(first.reportHash).toBe("0x082eaa84c4e222fb74b08b3b082174895c75377f953340f6c15de8cad6f32255");
  });

  it("keeps the Safe handoff unsigned and fails closed when the Guard is paused", () => {
    const report = runDemoFixture(loadDemoFixture());
    expect(report.trace.execution).toMatchObject({ readyStatus: "READY_FOR_SAFE_REVIEW", signed: false, submitted: false, executesAssetTransfer: false, assetExecutionAuthorized: false, pausedStatus: "BLOCKED", pausedBlockers: ["GUARD_NOT_PAUSED"], pausedSafeHandoff: null });
    expect(report.trace.refusal).toMatchObject({ recommendation: "INSUFFICIENT_EVIDENCE", blockers: ["STALE_EVIDENCE"], actions: 0, assetExecutionAuthorized: false });
  });

  it("rejects any cross-organization Evidence in the fixture", () => {
    const fixture = loadDemoFixture();
    fixture.evidence[0].organizationId = "org_other";
    expect(() => validateDemoFixture(fixture)).toThrow("DEMO_CROSS_ORGANIZATION_EVIDENCE");
  });
});
