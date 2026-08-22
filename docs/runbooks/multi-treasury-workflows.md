# Multi-treasury workflow orchestration

Status: `PARTIAL / REGISTRY, ORCHESTRATION AND ADAPTIVE PID WORKER LOCAL_VERIFIED`. This runbook describes the governed configuration and backend concurrency foundation. It does not claim that every domain producer is wired, that local observations prove a production SLO, or that AEOS can sign, broadcast or move assets.

## Governed treasury registry

`POST /api/v1/treasury-registry`, `POST /api/v1/treasury-registry/{treasuryId}/versions` and `POST /api/v1/treasury-registry/{treasuryId}/retire` are ADMIN-only, CSRF-protected and idempotent commands. `GET` list/detail endpoints expose the current state and complete immutable version history for the active organization.

Each version freezes the chain and Treasury, Governor, Timelock, Safe, TreasuryGuard, PolicyRegistry and optional policy-version identities. Versions and registry events are append-only and tenant-RLS protected. A retired treasury cannot be reactivated. Rotation or retirement is refused while exclusive work is running; queued old-version work is cancelled with an immutable reason rather than silently executing against new configuration.

## Concurrency boundary

Each workflow is scoped by `organization_id`, `chain_id`, normalized `treasury_address` and the immutable current Treasury Registry version. Unregistered, retired, stale-version or address-mismatched work is rejected. The resulting treasury key is never global across tenants.

- `ADVISORY`: `EVIDENCE_REFRESH`, `DECISION_ANALYSIS`, `POLICY_SIMULATION`, `MONITORING_SCAN`. These may run concurrently, even against the same treasury, because their outputs remain suggestions or observations.
- `EXCLUSIVE`: `EVIDENCE_BOUND_ADAPTIVE_PID`, `GOVERNANCE_PREPARATION`, `EXECUTION_PREFLIGHT`, `EXECUTION_RECONCILIATION`. At most one exclusive workflow may be `RUNNING` for the same organization and treasury. PID is serialized because its previous error/integral/derivative/output/gain state is ordered, not because it has asset authority. Different treasuries and organizations can run concurrently.

Claiming uses `FOR UPDATE SKIP LOCKED`; exclusive work also takes a transaction advisory lock and is protected by a partial unique index. A lease and heartbeat make abandoned work recoverable. Only a SHA-256 claim-token hash is stored. These database controls support multiple processes; the current API also hosts a bounded PID-only worker pool for local/MVP operation. A separate deployed worker topology and sustained production-like load test remain incomplete.

## Authenticated management API

- `POST /api/v1/treasury-workflows` creates an idempotent, immutable-input workflow for the active organization.
- `POST /api/v1/treasury-workflows/evidence-bound-adaptive-pid` derives chain/address from the current Registry, requires an active Policy, and queues a frozen stateful PID task.
- `GET /api/v1/treasury-workflows` lists only the active organization's workflows.
- `GET /api/v1/treasury-workflows/{id}` returns one organization-scoped workflow.

Workers use the internal service boundary to claim, complete, fail or recover expired work. Public callers cannot select another `organization_id`, obtain stored claim tokens or turn a workflow into asset authority. Every response includes `advisoryOnly=true` and `assetExecutionAuthorized=false`.

The PID worker is enabled by default. `ADAPTIVE_PID_WORKER_ENABLED=false` disables it; `ADAPTIVE_PID_WORKER_CONCURRENCY` is bounded to 1–32 (default 4), and `ADAPTIVE_PID_WORKER_INTERVAL_MS` is bounded to 10–60000 ms (default 250). These are polling controls, not trading-latency or SLO claims.

## Failure and audit behavior

Lifecycle changes append immutable `treasury_workflow_events` and an Audit event in the same transaction; Audit feeds the Transactional Outbox. A failed retryable job is requeued only within its frozen attempt budget. Expired terminal work becomes `TIMED_OUT`. Inputs, input hashes and event history cannot be rewritten.

## Verification

```powershell
npm run verify:multi-treasury-db
npm run verify:treasury-registry-db
```

The PostgreSQL integrations prove same-Treasury PID serialization, advisory overlap, cross-Treasury/cross-organization concurrency, workload filtering, heartbeat persistence, cross-tenant hiding, immutable inputs/events, absence of raw claim tokens and actual queue-to-Evidence-bound-PID-snapshot completion.

## Remaining production work

- Add per-treasury budget, risk and Evidence-source versions and validate policy IDs against their immutable records.
- Add wallet re-confirmation/read-only interface inspection for each new Registry version before it becomes active.
- Wire existing Evidence, Decision, simulation, governance and reconciliation producers to the generic scheduler.
- Deploy separate worker processes with autoscaling, dead-letter operations, metrics and sustained multi-process load/chaos acceptance.
- Complete user-wallet/Safe-controlled testnet execution and feedback. No worker may receive an AEOS private key or bypass governance.
