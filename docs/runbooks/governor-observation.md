# Governor observation and voting evidence

## Boundary

AEOS mirrors confirmed OpenZeppelin Governor state for review. It does not create, submit, vote on, queue, cancel, or execute a proposal. The adapter has no signer, private key, transaction broadcaster, or asset authority. DAO and wallet actions remain external and explicit.

## Confirmed snapshot

`POST /api/v1/proposals/{id}/sync-governor` selects `latest - GOVERNANCE_CONFIRMATION_LAG` and reads all fields against that same block tag:

- `state(proposalId)`
- ERC-6372 `clock()` and `CLOCK_MODE()`
- `proposalSnapshot(proposalId)` and `proposalDeadline(proposalId)`
- `quorum(proposalSnapshot)` when the snapshot timepoint has been reached
- `proposalVotes(proposalId)` as against, for, and abstain values

The resulting `governance.observation.v2` payload, voting metadata, safe block identity, confirmations, proposal content hash, previous observation link, and payload hash are appended atomically. Records cannot be updated or deleted and are isolated by `organization_id`.

Before the proposal snapshot, the adapter records `availability=PENDING_SNAPSHOT` and `quorum=null`; it does not query a future checkpoint or fabricate a quorum value. If the required Governor interfaces are missing or a confirmed read fails, synchronization fails closed and no observation is appended.

## Interpretation

`forVotes`, `againstVotes`, `abstainVotes`, and `quorum` are confirmed read evidence. `displayedParticipation=forVotes+abstainVotes` and `quorumReachedByDisplayedParticipation` are explicitly labeled `derivedLocally=true` with formula `FOR_PLUS_ABSTAIN`. They are review aids, not a claim that every customized Governor uses that calculation for proposal success. The mirrored on-chain `state` remains the authoritative lifecycle observation.

Mock metadata may be omitted. If supplied, all voting fields must be present and internally ordered; it remains `source=MOCK_ONLY` and `onchainVerified=false` regardless of apparent state or quorum.

## Triage

1. Confirm the selected organization's configured chain and Governor address.
2. Confirm the RPC has the required safe block and the Governor supports the documented read interfaces.
3. Use the observation's block number/hash and payload hash for correlation; do not replace a failed or reorged observation.
4. For `PENDING_SNAPSHOT`, wait until the ERC-6372 clock reaches the frozen snapshot timepoint, then perform another explicit read-only sync.
5. Treat reorgs as new referenced observations. Never mutate the prior snapshot.

Successful observation still leaves `assetExecutionAuthorized=false`. Proposal submission, votes, Timelock operations, Safe signatures, and execution require the configured DAO/wallet path outside this adapter.
