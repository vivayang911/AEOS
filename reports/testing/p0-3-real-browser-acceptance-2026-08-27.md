# P0-3 Real-Browser Acceptance Record

Status: `ACCEPTED / BOUNDED LOCAL CHROME E2E`

Date: 2026-08-27 (Asia/Shanghai)

This record covers the normal AEOS application route only. It does not use a temporary wallet page and does not authorize a signature, broadcast, vote or asset action.

## Frozen acceptance boundary

- Browser: the user's connected Chrome session.
- Identity: existing SIWE session for `0x444d510728fb8072351cb5d0e88432e6a8501dfa`; no new signature was requested during the three measured runs.
- Organization: `AEOS Hackathon Demo DAO`, selected by the server session.
- Route: `Landing -> SIWE -> Organization -> Attestcoin -> Evidence -> Decision -> Governance -> Outcome`.
- Visible Evidence sample: `ev_8e74e45559234d308f7b684675790095` was present in the organization-scoped Evidence list.
- Visible Decision sample: `decision_8047c40b442940c8a1b2ea268681b990` was present in the organization-scoped Decision list.
- Accepted Outcome: `govout_ef291722a8cb069e4fe75fe1abe2936e`, with immutable Evidence `govout_fd6c5926fdd447485662aa5dba5fb8d6`.
- Final authority invariant: `ASSET EXECUTION AUTHORIZED / false`.

## Measured runs

| Run | Duration | Recovery condition | Result |
|---|---:|---|---|
| 1 | 77.356 s | baseline continuous traversal | PASS; five Evidence references and six Decision records were visible before the accepted Governance Outcome |
| 2 | 114.719 s | API listener stopped while frontend and PostgreSQL remained available; browser displayed `API CONNECTION INTERRUPTED`; replacement API recovered in place | PASS; the same SIWE session and organization recovered without another wallet prompt, then the route reached the accepted Outcome |
| 3 | 15.485 s | browser reloaded on `/decisions?tour=p0e2e` | PASS; HttpOnly session and server-selected organization recovered, then the route reached the accepted Outcome |

All three completed runs were below the 180-second acceptance limit.

## Environment interruption observed after run 2

The following-day continuation found all local services stopped and Docker Desktop unable to start because two stale zero-byte Windows Unix-socket reparse entries were inaccessible. The exact temporary directories were renamed to recoverable backups; no image, container or data volume was deleted. Docker Engine `29.5.2`, AEOS PostgreSQL/Redis, API port `4000` and Web port `3000` were restored before run 3. This was a local host-runtime recovery, not an AEOS application recovery claim.

## Console observation

The AEOS pages rendered without a Next.js error overlay or failed application route. Chrome recorded MetaMask extension listener/multiplex warnings. It also reported three asynchronous message-channel closure errors against the Landing URL during extension initialization. The message signature and adjacent `chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn` warnings identify extension-channel noise; this record therefore does not claim a globally clean browser console. No failure was observed in the AEOS route, tenant reads, recovery gates or Outcome rendering.

## Independent limitation

The Governance page reported zero tenant-visible Proposal API records in this session while separately displaying the explicitly labeled frozen accepted Outcome replay. P0-3 accepts continuous navigation and recovery, but it does not convert that replay into a chain-synchronized Proposal read model. That remaining gap belongs to broader PRD-04/PRD-10 acceptance and must remain `PARTIAL`.

Passing P0-3 proves a bounded local browser route, session/organization recovery and visibility of immutable records. It does not prove production availability, economic benefit, causal AI/PID performance or autonomous asset control.
