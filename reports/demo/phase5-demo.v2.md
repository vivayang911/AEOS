# AEOS Phase 5 deterministic demo report

- Fixture: `phase5-governance-demo.v2`
- Organization: `org_demo_fixture_v1`
- Fixture hash: `0xe135512c45fec2f3d96008e7b20bcdaaa323a0982f68fcbb90d7cdc71be6d991`
- Report hash: `0x650dd16100ee6277593fb97bf2abe7735b3bf7d83bab5b9363a599d35ad64166`
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
