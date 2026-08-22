# Attestcoin provider reliability

## Boundary

AEOS uses Attestcoin only to read finalized Sepolia transaction data, request and statically validate a USC proof, and inspect the user-submitted CC3 verification transaction. The adapter has no private-key, signing, transaction-submission, governance, or asset-execution method. The default adapter remains the deterministic `mock` adapter.

`GET /api/v1/attestcoin/health` is passive: it reads the selected organization's immutable provider-call observations and the in-process circuit state. It never makes a provider or RPC request merely to report health. Locally generated request correlation is labeled `AEOS_GENERATED`; it must not be presented as an upstream provider request ID.

## Deterministic policy

- Each network attempt has a configurable deadline, `ATTESTCOIN_CALL_TIMEOUT_MS`, defaulting to 10 seconds and bounded to 1-30 seconds.
- Only timeouts, network failures, rate limits, and provider 5xx failures are retried.
- A high-level operation makes at most three attempts with fixed 50 ms and 100 ms delays.
- Invalid input, proof mismatch, non-final source data, missing events, and other deterministic failures are not retried.
- Three exhausted transient operations open the process-local provider circuit for 30 seconds.
- An open circuit rejects immediately and performs zero network work. AEOS never falls back to stale proof data for a high-impact operation.
- Every completed or rejected high-level operation appends one immutable, tenant-scoped observation containing bounded outcome metadata and a result hash. Provider messages, credentials, signatures, raw proof material, and transaction bodies are not persisted in this record.
- A circuit transition to open appends an audit event. The existing Transactional Outbox and deterministic alert consumer produce a HIGH `PROVIDER_HEALTH` alert idempotently.

## Signals

The bearer-protected Prometheus endpoint exposes tenant-free aggregates:

- `aeos_provider_calls_total`
- `aeos_provider_failures_total`
- `aeos_provider_circuit_rejections_total`

Use the health endpoint for the authenticated tenant's most recent bounded history. Use the alert and audit APIs for immutable incident evidence and request correlation. Do not add `organization_id`, wallet, transaction hash, proof, URL query, or credential values to metric labels.

## Triage

1. Confirm API liveness and database readiness independently. A provider outage must not make process liveness false.
2. Inspect `GET /api/v1/attestcoin/health` and the latest HIGH provider-health alert.
3. Correlate the stored AEOS request ID with sanitized access logs and immutable audit events.
4. Distinguish deterministic rejection from transient provider exhaustion. Deterministic failures require correcting the source transaction/proof; repeated retries are inappropriate.
5. For transient exhaustion, wait for the 30-second circuit window, verify RPC/Proof Builder configuration outside AEOS, then repeat the user-initiated operation. There is no automatic transaction retry or submission worker.
6. If health history is absent, confirm the selected organization and adapter mode. `MOCK_ONLY_DISABLED` is expected in default Mock mode and is not evidence of live provider health.

## Recovery acceptance

Recovery is accepted only when a new bounded call succeeds and appends a new immutable observation. Never mutate or delete the failure observation or alert. A successful provider read still does not authorize a proposal, Safe transaction, wallet signature, CC3 submission, or asset movement; those boundaries remain explicit and user/DAO controlled.
