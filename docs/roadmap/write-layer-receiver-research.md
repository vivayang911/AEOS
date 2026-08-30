# Message-centric Write Layer receiver research

Status: `COMMUNITY-DISCUSSION INPUT / NOT AN OFFICIAL PROTOCOL COMMITMENT / NOT IMPLEMENTED`.

## Context

A community discussion described a possible future Write Layer as message-centric delivery between programmable chains. Under that hypothesis, a source dApp would send an ABI-compatible payload through an outbox/inbox path, optionally using a relayer, and a destination receiver would authenticate the inbox before forwarding a bounded message to the destination dApp.

This is useful architectural input, but it is not treated as a released Attestcoin specification or a competition requirement. AEOS therefore does not redesign the current accepted read/verify MVP around it.

## Candidate boundary

```text
user → source dApp → outbox/inbox → receiver adapter → destination AEOS contract
                   ↘ optional relayer
```

- The receiver adapter verifies the configured inbox rather than requiring every AEOS business contract to bind permanently to one protocol implementation.
- The AEOS destination contract verifies only the approved receiver adapter.
- A future governance action may replace or add receiver adapters through a versioned Timelock-controlled registry.
- Message content remains untrusted until its schema, sender, domain, nonce, expiry and Evidence lineage pass deterministic validation.

## Required controls

- Exact source/destination chain and application-domain separation.
- Sender and source-dApp authentication where the message semantics depend on identity.
- Nonce, message hash, expiry and replay protection.
- Checks-effects-interactions or equivalent re-entrancy protection.
- Bounded payload length and allowlisted ABI schemas/selectors.
- Idempotent delivery and duplicate reconciliation.
- Relayer identity must not replace the preserved logical sender.
- Receiver upgrades require Governor/Timelock approval and append-only version history.
- Failure, retry and translation never grant signing, broadcasting or treasury authority to an Agent.

## Relationship to the current MVP

The current competition path proves source-chain transaction inclusion and then creates organization-scoped Evidence. A future Write Layer would add an outbound/inbound message transport surface; it would not replace Attestcoin verification, Evidence freshness, RAG citation, Risk/Compliance challenge or DAO authorization.

## Go/no-go criteria

Implementation should begin only after an official public specification, Testnet endpoints and security assumptions are available. Before adoption, AEOS must compare the adapter design against leaving the current immutable read/verify path unchanged. Until those conditions exist, this document is research only and has no competition-completion value.
