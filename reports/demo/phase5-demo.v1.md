# AEOS Phase 5 deterministic demo report

- Fixture: `phase5-governance-demo.v1`
- Organization: `org_demo_fixture_v1`
- Fixture hash: `0x298b80256584ef0c428f112ce47ba1c6e557bb48b633d41d8de70510876a8b01`
- Report hash: `0xb34d013d4ada11326e85c865d004a4d0ddf7f803a56cd74e4823db16969b4599`
- Data boundary: `DETERMINISTIC_OFFLINE`, live on-chain verified=false
- Evidence manifest: `0x7d52813633a063ddee505ab6d11a748050c45eb8ce77bc9cf5e34a32299a3ecf` (2 items)
- Decision: `HOLD`, citation coverage 100%
- Simulation: `SUGGESTED`, advisory only
- Proposal calldata consistent: `true`
- Ready boundary: `READY_FOR_SAFE_REVIEW`, signed=false, submitted=false
- Pause drill: `BLOCKED` (GUARD_NOT_PAUSED), Safe handoff omitted
- Stale Evidence drill: `INSUFFICIENT_EVIDENCE` (STALE_EVIDENCE)
- Asset execution authorized: `false` at Decision, Simulation, Proposal, Preflight, and refusal boundaries

This artifact is deterministic and contains no credentials, signatures, wallet session, transaction submission, or asset-moving operation. Fixed governance and Guard snapshots exercise validation logic only and are not live on-chain evidence.
