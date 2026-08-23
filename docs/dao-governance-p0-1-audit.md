# DAO governance P0-1 deployment audit

Status: `BLOCKED BEFORE IMPLEMENTATION / DEPENDENCY AND SAFE DEPLOYMENT DECISION REQUIRED`.

This audit records facts checked before the first real DAO-governance implementation batch. It does not convert a Mock observation, an EOA call, or an Evidence anchor into governance finality.

## Verified repository state

- `EvidenceAnchorASC` has one verified Creditcoin Testnet deployment and one complete live proof-to-anchor sample.
- `PolicyRegistry` and `TreasuryGuard` Solidity sources, deterministic unsigned deployment plans, read-only deployment verification and contract tests exist locally.
- No deployed `PolicyRegistry` or `TreasuryGuard` receipt is present under `reports/deployment/`.
- No Governor, Timelock or governance-token Solidity implementation or deployment artifact exists in the repository.
- The existing OpenZeppelin Governor Adapter is read-only. Mock observations explicitly have `onchainFinalityVerified=false` and cannot be upgraded into real finality.
- `TreasuryGuard` records a validated authorization and emits `ActionAuthorized`; it deliberately performs no external call or asset transfer. It cannot be described as a completed treasury asset action.

## Creditcoin Testnet Safe finding

Read-only RPC calls to `https://rpc.cc3-testnet.creditcoin.network` returned chain ID `0x18e8f` (`102031`). At the same time:

- Safe v1.4.1 canonical singleton `0x41675C099F32341bf84BFc5382aF534df5C7461a` returned `eth_getCode = 0x`.
- Safe v1.4.1 canonical proxy factory `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67` returned `eth_getCode = 0x`.

The official Safe deployment registry lists Creditcoin chain `102030`, not `102031`, for the canonical Safe v1.4.1 deployment. Consequently AEOS must not reuse those addresses on `102031` or label an EOA as a Safe. A Safe path requires a separately verified official/self-deployed Safe stack and independent code-hash/readback evidence.

## Required governance implementation

The minimum non-simplified stack is:

1. an OpenZeppelin-compatible votes token with the demo owner delegated at a historical checkpoint;
2. `TimelockController` with a non-zero minimum delay;
3. a Governor using `GovernorVotes`, `GovernorCountingSimple`, quorum and `GovernorTimelockControl`;
4. Governor-only proposer/canceller configuration and a deliberately documented executor policy;
5. `PolicyRegistry` and `TreasuryGuard` governed by the Timelock, never by the AI or API;
6. removal of temporary deployment administration only after exact role readback passes;
7. a Decision-bound batch proposal that activates one policy, configures the paused Guard, allows a zero-value target/selector, unpauses through Timelock governance and records one deterministic `ActionAuthorized` result;
8. canonical proposal/vote/quorum/queue/timelock/execute events and block-finality readback before Outcome Evidence import.

The proposed test action is an authorization record only. A later asset-moving test must remain separately gated by Safe/Timelock, simulation, balances, allowlists, policy limits and user/DAO confirmation.

## Current blocker

The repository has no OpenZeppelin Contracts source or cached dependency. Installing official OpenZeppelin Contracts 5.4.0 was requested but did not execute because the approval transport failed. Hand-writing a reduced Governor would violate the PRD preference for mature standard contracts and create unnecessary security risk. Implementation must resume only after the official dependency installation is explicitly authorized and succeeds.

Safe remains a distinct external gap because the official canonical contracts are absent from chain `102031`. This does not permit AEOS to invent a Safe address or silently remove Safe from the whole-PRD acceptance list.
