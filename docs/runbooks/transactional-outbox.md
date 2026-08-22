# Transactional Outbox runbook

## Safety boundary

Every new append-only `audit_events` row creates one `outbox_events` envelope and one `mock-observer-v1` delivery in the same PostgreSQL transaction. The default publisher is explicitly Mock-only: it has no network client, credentials, signer, transaction submission, or asset authority. Unsupported publisher modes fail during startup instead of silently falling back.

Events and consumer receipts are immutable and tenant-isolated. Delivery state is mutable only through bounded `PENDING/FAILED -> CLAIMED -> DELIVERED/FAILED` transitions. A claim carries a 30-second lease token; an expired claim can be recovered, while a stale worker cannot complete another worker's claim. Delivery attempts stop after three tries.

The event ID is the mandatory downstream idempotency key. A crash after a provider accepts an event but before AEOS records the receipt may cause redelivery, so every future real consumer must persist `event_id` before applying its effect. The deterministic Mock receipt proves this contract without contacting an external system.

## Configuration

```text
OUTBOX_PUBLISHER=mock
OUTBOX_AUTO_DISPATCH=true
OUTBOX_DISPATCH_INTERVAL_MS=5000
```

`GET /api/v1/outbox-publisher` exposes only capability metadata to ADMIN/AUDITOR members. There is deliberately no public dispatch endpoint.

## Signals and recovery

- `aeos_outbox_deliveries_active`: pending or leased deliveries. Sustained growth indicates dispatcher/database pressure.
- `aeos_outbox_deliveries_failed_total`: failed attempts. Page the platform operator if it rises continuously or terminal attempts reach three.
- Database/readiness failure: do not delete or edit events. Restore PostgreSQL, then restart the API; expired leases are reclaimed automatically.
- Publisher failure: keep the Mock boundary or fix the configured adapter. Never bypass receipts by manually marking an event delivered.
- Verification: run `npm run verify:command-security-db`. It proves same-transaction enqueue, immutable envelopes/receipts, expired-lease recovery, one consumer receipt, tenant isolation, and zero asset authority.
