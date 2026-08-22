# API observability runbook

## Request correlation and log safety

- Supply `X-Request-ID` using 1–100 characters from letters, digits, `.`, `_`, `:`, and `-`. Missing, malformed, or log-injection values are replaced with `req_<opaque>`.
- The trusted ID is returned as `X-Request-ID`, used by error envelopes, propagated through database transaction context, and attached to audit events created during that request.
- API access logs are structured and contain only event name, request ID, method, query-free route, status code, duration, and `sensitive_fields_logged=false`.
- Internal-error logs contain only request ID, status, and error class. Never add bodies, query parameters, Cookie/Authorization/CSRF headers, wallet signatures, RPC credentials, exception messages, or stacks.
- Business audit events are append-only and tenant-isolated; do not mix them with operational access logs.

## Endpoints

- `GET /api/v1/health/live` checks only that the API process can respond. It must remain independent of PostgreSQL and external providers.
- `GET /api/v1/health/ready` checks PostgreSQL and migration `019_request_trace_audit.sql`. A failed dependency returns 503 and must remove the instance from traffic.
- `GET /api/v1/metrics` exposes Prometheus text only when `METRICS_TOKEN` is configured and the exact bearer token is supplied. If the token is absent, the endpoint fails closed with 503.

Metrics contain only global numeric aggregates. They must never contain organization IDs, wallet/contract addresses, transaction hashes, Evidence content, provider URLs, credentials, or exception messages.

## Initial alerts

- `aeos_api_up == 0`: page the platform operator.
- readiness 503 for two consecutive checks: remove from traffic and investigate PostgreSQL/migrations.
- increase in `aeos_execution_reconciliation_terminal_total`: page execution/security owners and follow the Phase 4 recovery runbook.
- increase in `aeos_execution_reconciliation_retryable_total`: warn platform operator; inspect Safe/RPC availability and deterministic retry timing.
- sustained `aeos_decision_jobs_active` growth: inspect worker leases and queue recovery.
- sustained `aeos_outbox_deliveries_active` growth: inspect dispatcher leases and database availability; expired claims recover automatically.
- increase in `aeos_outbox_deliveries_failed_total`: inspect the configured publisher and bounded attempt count; never mark receipts manually.
- sustained `aeos_evidence_stale_total` growth: inspect Attestcoin/source availability; stale Evidence remains visible but cannot authorize high-impact decisions.

## Verification

```powershell
$env:METRICS_TOKEN='LOCAL_SECRET_VALUE'
Invoke-RestMethod http://localhost:4000/api/v1/health/live
Invoke-RestMethod http://localhost:4000/api/v1/health/ready
Invoke-RestMethod -Headers @{ Authorization = 'Bearer LOCAL_SECRET_VALUE' } http://localhost:4000/api/v1/metrics
```

Verify a missing/wrong token returns 401, an unset token returns 503, and metric output contains no tenant label. Rotate the token through the environment secret manager; never commit it.
