import { validateGovernanceTransition } from "./governance-engine";

describe("append-only governance state machine", () => {
  it("accepts only the deterministic forward lifecycle", () => {
    expect(validateGovernanceTransition("DRAFT", "REVIEW", { isReorg: false, reorgReferencesLatest: false }).transition).toBe("FORWARD");
    expect(validateGovernanceTransition("ACTIVE", "SUCCEEDED", { isReorg: false, reorgReferencesLatest: false }).transition).toBe("FORWARD");
    expect(validateGovernanceTransition("SUCCEEDED", "QUEUED", { isReorg: false, reorgReferencesLatest: false }).transition).toBe("FORWARD");
  });
  it("permits a read-only on-chain bootstrap without weakening Mock transitions", () => {
    expect(validateGovernanceTransition("DRAFT", "PENDING", { isReorg: false, reorgReferencesLatest: false, allowOnchainBootstrap: true }).transition).toBe("ONCHAIN_BOOTSTRAP");
    expect(() => validateGovernanceTransition("DRAFT", "PENDING", { isReorg: false, reorgReferencesLatest: false })).toThrow("INVALID_GOVERNANCE_TRANSITION");
    expect(validateGovernanceTransition("ACTIVE", "CANCELED", { isReorg: false, reorgReferencesLatest: false }).transition).toBe("FORWARD");
  });
  it("rejects skipped or reversed states without a reorg", () => {
    expect(() => validateGovernanceTransition("DRAFT", "ACTIVE", { isReorg: false, reorgReferencesLatest: false })).toThrow("INVALID_GOVERNANCE_TRANSITION");
    expect(() => validateGovernanceTransition("ACTIVE", "PENDING", { isReorg: false, reorgReferencesLatest: false })).toThrow("INVALID_GOVERNANCE_TRANSITION");
  });
  it("allows rollback only when a reorg references the latest observation", () => {
    expect(validateGovernanceTransition("ACTIVE", "PENDING", { isReorg: true, reorgReferencesLatest: true }).transition).toBe("REORG_ROLLBACK");
    expect(() => validateGovernanceTransition("ACTIVE", "PENDING", { isReorg: true, reorgReferencesLatest: false })).toThrow("REORG_MUST_REFERENCE_LATEST_OBSERVATION");
    expect(() => validateGovernanceTransition("PENDING", "ACTIVE", { isReorg: true, reorgReferencesLatest: true })).toThrow("REORG_MUST_ROLL_BACK_STATE");
  });
});
