# Phase 4 execution reconciliation runbook

## Safety boundary

AEOS reconciliation is read-only. Operators may repeat the Safe observation `POST`, but AEOS never proposes, signs, submits, replaces, or cancels a transaction. Never provide a private key, mnemonic, Safe signature, or RPC credential in a request, ticket, or log. `assetExecutionAuthorized` must remain `false` in every attempt and observation.

## Detection signals

- `FAILED_RETRYABLE`: transient Safe Transaction Service/RPC failure or insufficient finality. Follow `retryAfterSeconds`; retry manually after `nextRetryAt`.
- `FAILED_TERMINAL`: frozen handoff, Safe, chain, receipt, expiry, or event proof mismatch. Do not retry unchanged inputs.
- `SAFE_EXECUTION_REORG_DETECTED`: a previously confirmed execution is no longer reproduced at the same transaction/block identity. Treat it as terminal, stop the execution path, preserve both snapshots, and escalate to the platform and security owners.
- `REJECTED`: the Preflight was not `READY_FOR_SAFE_REVIEW`. Create a new Preflight only after Evidence, policy, governance, and Guard state are valid.
- `EXECUTED`: accepted only after confirmed Safe `ExecutionSuccess` and TreasuryGuard `ActionAuthorized` logs for the frozen identities.

Inspect organization-scoped history:

```powershell
Invoke-RestMethod `
  -Headers @{ 'x-organization-id' = 'org_demo' } `
  -Uri 'http://localhost:4000/api/v1/execution-preflights/PREFLIGHT_ID/reconciliation-attempts'
```

## Recovery procedure

1. Freeze all discretionary changes to Safe, Guard, policy, and RPC configuration for the incident.
2. Record the Preflight ID, Safe transaction hash, latest attempt ID, error code, and observation block identity. Do not copy signatures or credentials.
3. For `FAILED_RETRYABLE`, verify Safe service and RPC health independently, wait until `nextRetryAt`, then repeat the same observation request. Exponential backoff is deterministic and capped at 900 seconds.
4. For `FAILED_TERMINAL`, compare the Safe UI transaction fields with the immutable Preflight handoff. A mismatch requires abandoning that Safe transaction and creating a new human-reviewed flow; never edit a snapshot.
5. For suspected chain reorganization, stop retries until the configured confirmation depth is restored. Preserve both old and new block identities in incident evidence.
6. For suspected key/signature compromise, stop observation retries, ask Safe owners to follow their approved key-rotation process, and have the Guardian pause TreasuryGuard. AEOS cannot rotate keys or resume the Guard.
7. For an execution failure event, preserve the receipt and logs, keep the action unexecuted, and require a new Preflight after the root cause is reviewed.

## Recovery verification

- The reconciliation history is append-only with consecutive ordinals.
- A transient failure remains visible and a later success links an immutable observation.
- Safe transaction hash, Safe address, Guard address, action ID, calldata, policy hash/version, chain ID, receipt, and events match the frozen flow.
- No signature is persisted and no AEOS component exposes proposal/signing/submission capability.
- Cross-organization reads return 404.
- Audit contains `execution.reconciliation_attempted` and, on a new observation, `safe.transaction_observed`.
- TreasuryGuard `consumedAction(actionId)` agrees with the confirmed `ActionAuthorized` log.

## Escalation ownership

- Safe service/RPC availability: platform operator.
- Safe signer or key concern: Safe owners/security lead.
- Guard pause: configured Guardian; resume requires governance.
- Policy or proposal mismatch: DAO governance reviewers.
- Database/audit integrity: database owner and security lead; stop writes until integrity is verified.

## Local recovery drill

```powershell
$env:DATABASE_URL='postgresql://aeos:aeos@localhost:5432/aeos'
npm run build -w @aeos/api
npm run verify:policy-db -w @aeos/api
```

The drill injects a transient Safe service failure, records a retryable immutable attempt, retries manually, advances through Safe observation states, proves recovery, and rolls all fixture data back.

The same drill also injects an emergency Guard pause and a post-confirmation Safe receipt block change. It must prove `GUARD_NOT_PAUSED`, produce no Safe handoff while paused, append a terminal `SAFE_EXECUTION_REORG_DETECTED` attempt, and leave automatic retry disabled.
