# AEOS Phase 5 deterministic demo report

- Fixture: `phase5-governance-demo.v3-eight-agent`
- Organization: `org_demo_fixture_v1`
- Fixture hash: `0x0dc01c50b2806411cb671d78c56255227fabe38edf99e7db94ce4d26240a2bf5`
- Report hash: `0x082eaa84c4e222fb74b08b3b082174895c75377f953340f6c15de8cad6f32255`
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
