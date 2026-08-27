# P0-3 Continuous Browser E2E

Status: `ACCEPTED / BOUNDED LOCAL CHROME E2E`

This runbook covers the normal AEOS application only. It does not use a temporary wallet page, does not expose a signing or broadcast API, and does not grant asset authority.

## Required route

1. Open `http://localhost:3000/?tour=p0e2e`.
2. On Landing, complete `SIWE SIGN IN` in the governance wallet.
3. Select the intended DAO organization. The server session, not the route, supplies `organization_id`.
4. Continue through `Attestcoin`.
5. Continue through `Evidence Explorer` and inspect an immutable Evidence record.
6. Continue through `Decision Room` and inspect the frozen eight-role output and citations.
7. Continue through `Governance`.
8. Finish at `#verified-outcome`, where the accepted deterministic-withholding Outcome and its limits are visible.

The persistent P0-3 guide keeps these checkpoints visible. It does not persist credentials or tenant identity in browser storage.

## Acceptance matrix

| Check | Current result | Evidence / limitation |
|---|---|---|
| Production build | PASS | 13 routes generated, including `/` Landing and `/governance` |
| Route availability, 3 runs | PASS / REAL CHROME | complete runs finished in 77.356 s, 114.719 s and 15.485 s |
| Stylesheet delivery | PASS | production CSS returned `200`, 60,121 bytes |
| API disconnect and restart | PASS / service boundary | only API PID 23068 was stopped; disconnect was observed; replacement API became live/ready with database ready |
| Automatic client recovery implementation | PASS / code and contract tests | session poll retries every 2.5 seconds, restores server session and organization list, and never requests a wallet signature |
| Browser refresh recovery implementation | PASS / code boundary | HttpOnly session is reread; CSRF remains intentionally absent until explicit SIWE reauthentication |
| Three complete real-browser runs under 3 minutes | PASS | all three traversed Landing through the accepted Outcome with the same SIWE tenant context and `assetExecutionAuthorized=false` |
| One visible API-disconnect browser recovery | PASS | run 2 displayed `API CONNECTION INTERRUPTED`, recovered automatically after only the API was restarted and required no second wallet prompt |
| One visible refresh recovery | PASS | run 3 reloaded `/decisions?tour=p0e2e`, recovered the HttpOnly session and server-selected organization, then reached Governance/Outcome |

The measured evidence is frozen in `reports/testing/p0-3-real-browser-acceptance-2026-08-27.md`. Extension-channel warnings were observed, so this acceptance does not make a global zero-console-noise claim. The Governance page also exposed zero tenant Proposal API records in this historical run while separately rendering the explicitly labeled accepted Outcome replay. That diagnosed gap is now addressed at the database, service and UI-build layers by the immutable chain Proposal projection documented in `chain-governance-proposal-projection.md`; a new-build API restart and signed-in browser recheck remain pending.

## Timing record requirements

For each real-browser run record start/end time, duration, wallet/session state, selected organization, visited Evidence ID, visited Decision ID, visible governance state, visible Outcome ID, console errors and final authority banner. Every run must be below 180 seconds.

The API-disconnect run must stop only the resolved API listener, preserve PostgreSQL and the frontend, observe `API CONNECTION INTERRUPTED`, restart the API hidden, and observe automatic recovery without a second wallet prompt. The refresh run must reload a read-only page and recover the same server-selected organization; writes must remain unavailable until SIWE restores the in-memory CSRF token.

## Truth boundary

Passing this E2E proves route continuity, tenant-session recovery and visibility of frozen records. It does not prove production availability, economic benefit, autonomous asset execution or causal AI/PID performance. `assetExecutionAuthorized=false` remains invariant.
