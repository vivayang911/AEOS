# Deterministic backend demo runbook

## Purpose and authority boundary

This Phase 5 demo is a versioned, offline backend fixture. It exercises the Evidence-to-governance safety path without requiring an LLM credential, wallet session, private key, testnet transaction, or frontend change. It never signs, submits, broadcasts, or moves assets. Its fixed governance and Guard snapshots test deterministic validation behavior; they are explicitly not live on-chain evidence or testnet acceptance.

The fixture belongs only to `org_demo_fixture_v1`. Validation rejects any Evidence item whose `organizationId` differs, and generated reports contain no tenant data from the database. All hashes are derived from canonical fixed inputs; there is no current time, random ID, RPC response, or mutable external provider in the report.

## Run and verify

```powershell
npm run demo:verify
```

Expected machine summary:

```json
{"status":"PASS","fixture":"phase5-governance-demo.v3-eight-agent","reportHash":"0x082eaa84c4e222fb74b08b3b082174895c75377f953340f6c15de8cad6f32255","evidenceCount":2,"citationCoverage":1,"signed":false,"submitted":false,"assetExecutionAuthorized":false}
```

The command rewrites the same deterministic artifacts:

- `reports/demo/phase5-demo.v3.json` for automated review;
- `reports/demo/phase5-demo.v3.md` for human review.

The fixed report hash is asserted by a unit test and by the versioned fixture expectations. An intentional fixture or algorithm change requires review, a fixture-version decision, and an explicit hash update.

The v1 fixture and reports are retained only as historical evidence for the earlier algorithm. Current verification and any future release manifest must use v2; the previously frozen release candidate is invalidated by the changed workspace and image binding.

## Demonstration sequence

1. Show the two organization-bound, verified, fresh Evidence records and their immutable manifest hash.
2. Show the deterministic `HOLD` Decision, 100% material-claim citation coverage, empty executable actions, and `assetExecutionAuthorized=false`.
3. Show the deterministic policy Simulation, maximum gas cost and before/after balances. The values are explicitly offline inputs, the result is `SUGGESTED`, and it grants no execution authority.
4. Show the structured ERC-20 action, decoded calldata consistency, Proposal identity, and Proposal content hash.
5. Show the fixed read-only governance observation and Guard snapshot feeding Preflight, together with `liveOnchainVerified=false` for the overall offline fixture boundary.
6. Show `READY_FOR_SAFE_REVIEW`: the handoff targets only `TreasuryGuard.authorizeAction`, is unsigned and unsubmitted, and does not execute the asset transfer.
7. Repeat with the Guard paused. The deterministic `GUARD_NOT_PAUSED` blocker removes the Safe handoff.
8. Repeat with stale Evidence. The committee returns `INSUFFICIENT_EVIDENCE`, emits no action, and preserves zero asset authority.

## Failure response

- Hash mismatch: block the release and review the exact fixture/engine change; do not refresh the expected hash mechanically.
- Cross-organization Evidence: reject the fixture and investigate data preparation.
- Citation coverage below 100%, executable Agent action, signing/submission flag, or asset authority becoming true: treat as a critical guardrail regression.
- External service or credential requirement: reject the change; this fixture must remain offline and deterministic.
