import { parseCockpitProjectionWakeup } from "./cockpit-projection-notification.service";

describe("cockpit projection notification boundary", () => {
  it("accepts only a bounded organization and immutable Audit Event reference", () => {
    expect(parseCockpitProjectionWakeup(JSON.stringify({ schemaVersion: "aeos.cockpit.wakeup.v1", organizationId: "org_safe", eventId: "audit_123", ignored: "not-forwarded" }))).toEqual({ schemaVersion: "aeos.cockpit.wakeup.v1", organizationId: "org_safe", eventId: "audit_123", advisoryOnly: true, assetExecutionAuthorized: false });
  });
  it.each([undefined,"not-json",JSON.stringify({schemaVersion:"wrong",organizationId:"org_safe",eventId:"audit_1"}),JSON.stringify({schemaVersion:"aeos.cockpit.wakeup.v1",organizationId:"org_safe\nleak",eventId:"audit_1"}),"x".repeat(513)])("rejects malformed or unbounded notification payloads", (payload) => {
    expect(parseCockpitProjectionWakeup(payload)).toBeNull();
  });
});
