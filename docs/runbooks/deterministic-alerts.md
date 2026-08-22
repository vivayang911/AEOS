# Deterministic alerts runbook

## Boundary

`alert-rules-v1` consumes the same immutable tenant event envelopes produced by the Transactional Outbox. The rules are fixed at `aeos-alert-rules.v1`. The current notification adapter is explicitly `mock-local-v1`: it has no network, credentials, signer, broadcast, transaction submission, or asset execution capability.

`aeos-anomaly-producers.v1` runs every 60 seconds by default. It reads only stored immutable Evidence, latest Governance Observations, and organization configuration versions. It emits a stable audit/Outbox event when verified Evidence expires, the latest non-terminal governance observation is more than 15 minutes old, a Governor/Timelock/Safe/TreasuryGuard control address changes, or the latest confirmed configuration inspection records `paused=true`. Repeated scans of the same source fingerprint do not duplicate events. Configure `ANOMALY_SCAN_ENABLED` and the bounded `ANOMALY_SCAN_INTERVAL_MS` (10 seconds to 1 hour); no setting enables network or execution authority.

Alerts and acknowledgements are append-only. Acknowledgement does not delete, mutate, resolve, retry, sign, or execute anything. Every acknowledgement emits its own audit event and Outbox envelope.

## Rules

- `evidence.rejected` and `attestcoin.proof_rejected`: HIGH evidence integrity alert.
- `evidence.stale`: HIGH evidence freshness alert.
- `decision.job_failed`: HIGH decision pipeline alert.
- `policy.simulation_blocked`: MEDIUM policy guardrail alert.
- `organization.configuration_activated`: MEDIUM configuration change alert.
- `membership.changed`, `organization.membership_changed`, or scanner-produced `organization.permission_changed`: HIGH permission-change alert.
- `proposal.state_unknown`: HIGH governance-state alert.
- `security.paused` or `treasury_guard.paused`: CRITICAL emergency-control alert.
- terminal or rejected execution reconciliation: CRITICAL execution safety alert.
- retryable execution reconciliation failure: HIGH execution safety alert.

Events not listed above are consumed and recorded by an immutable consumer receipt without creating an alert. Replay is idempotent on `(organization_id, source_event_id)`.

## Triage

1. Use `GET /api/v1/alerts?acknowledged=false`, starting with CRITICAL.
2. Follow `sourceEventId`, `details.sourceObject`, and `details.requestId` to the immutable Outbox/audit source.
3. Verify the Evidence, policy, proposal, Preflight, or reconciliation snapshot before acknowledging.
4. Append an acknowledgement using an ADMIN, OPERATOR, or GUARDIAN session and an `Idempotency-Key`.
5. Do not edit database rows or manually mark Outbox receipts. Alerts and receipts are intentionally immutable.

Monitor `aeos_alerts_critical_total`, `aeos_alerts_unacknowledged`, `aeos_outbox_deliveries_active`, and `aeos_outbox_deliveries_failed_total`. External notification routing is intentionally absent until a provider and credentials are selected.
