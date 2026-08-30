# AEOS post-hackathon roadmap

Status: `ROADMAP ONLY / NOT IMPLEMENTED / NOT PART OF CURRENT MVP ACCEPTANCE`.

The competition MVP remains the accepted Sepolia source-event → Attestcoin verification → immutable Evidence → cited eight-role Decision → DAO-controlled withholding path. The items below must not be presented as current product capabilities.

## R1 — second supported source

- Add one narrowly scoped Ethereum Mainnet `chainKey=3` public transaction after confirming current Testnet support.
- Preserve the same receipt-status, sender/target/calldata/log, freshness, duplicate and canonical-lineage checks used for Sepolia.
- Use a transaction with clear public semantics and make no ownership, treasury-control or economic-value claim that the transaction does not prove.
- Exit criterion: one independently reproducible second-source Evidence record and child Decision, without weakening the accepted Sepolia path.

## R2 — fresh economic-state Evidence

- Add separately verifiable price, liquidity and authorization Evidence rather than inferring them from transaction inclusion or a point-in-time token balance.
- Freeze source, observation time, expiry, units, methodology and truth boundary for every metric.
- Accept an unchanged HOLD when the new facts remain insufficient; never design the data to force a preferred Agent position.
- Exit criterion: the before/after Decision comparison shows which citations, challenges, confidence boundaries and positions actually changed.

## R3 — governed LLM/PID association

- Keep the LLM outside the PID runtime control loop.
- Permit an LLM to explain verified regimes or draft a bounded PID-envelope candidate, but never to write live `Kp`, `Ki` or `Kd` values.
- Require deterministic simulation, no-amplification checks, Risk/Compliance challenge and human/DAO approval before a new Policy version can influence PID.
- Exit criterion: a versioned candidate-to-Policy lineage is reproducible and cannot increase exposure or asset authority without governance.

## R4 — message-centric Write Layer compatibility

- Research an adapter/receiver boundary for future cross-chain message delivery without treating a community design discussion as an official released protocol.
- Keep sender authentication, replay protection, re-entrancy controls and replaceable inbox/receiver bindings explicit.
- Exit criterion: a Testnet prototype against a published protocol specification, with the current read/verify path preserved as the accepted baseline.

## R5 — private Evidence with ZK

- Continue the bounded research plan in [ZK private Evidence and governance research roadmap](zk-private-evidence-research.md).
- ZK supplements Attestcoin lineage and DAO authorization; it does not prove market truth, investment performance or model quality by itself.
- Exit criterion: one independently reproducible private predicate with a governed verifier and no witness disclosure.

## Priority rule

Hosted submission materials, external user discovery and accepted MVP gaps take precedence over every roadmap item. No roadmap item may be counted toward current `18/18 PARTIAL` PRD acceptance until it is implemented and independently verified.
