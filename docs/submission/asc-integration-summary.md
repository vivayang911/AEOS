# ASC integration summary — evidence-first draft

Status: `ONE TESTNET 11-STEP LIVE PROOF-TO-ANCHOR SAMPLE VERIFIED / WHOLE PRD PARTIAL`.

Development disclosure: AEOS is AI-assisted. AI coding agents helped analyze requirements, implement and test code, investigate failures, and draft documentation. The human project owner retains responsibility for product and risk decisions and personally controls every wallet or DAO confirmation. Neither AEOS nor an AI agent holds keys, signs transactions, broadcasts arbitrary transactions, or controls treasury assets.

The system integrates Creditcoin Universal Smart Contracts as a decentralized evidence-verification boundary rather than as an AI data feed. Creditcoin ChainInfo is read to discover currently supported source chains and the latest attested height. The Proof Builder constructs a transaction-inclusion proof only after the selected source block is covered by the attestation network. Creditcoin's native BlockProver verifies that proof.

`EvidenceAnchorASC` binds the verified encoded source transaction to an immutable Decision ID, Evidence Snapshot hash, source chain key, source block height and requesting wallet. It accepts only Sepolia chain key `1`, rejects zero or malformed anchors, prevents commitment replay and emits `EvidenceAnchored` only after the native verifier returns true. The contract has no payable surface, holds no assets, calls no arbitrary target and grants no AI signing or execution authority.

Off-chain, each proof job, Evidence record, routing result, Retrieval Manifest, eight-Agent recommendation and anchor handoff is scoped by `organization_id` and frozen with content hashes. AI Agents may request missing bounded evidence and produce recommendations, but a human-controlled DAO wallet remains responsible for deployment and every on-chain submission.

Verified local artifacts:

- deterministic deployment plan and exact init-code hash;
- contract behavior/fuzz and stateful invariant tests;
- surface checks for nonpayable/no-asset authority;
- organization RLS, immutable proof/Decision/handoff lineage and receipt confirmation logic;
- live read-only Creditcoin ChainInfo source-support observation.
- Creditcoin Testnet deployment transaction [`0xf8ef...4dd2`](https://creditcoin-testnet.blockscout.com/tx/0xf8efed6e45f8979ee13a995a293fef46d7ae58fb9a1de0dbb1e44e970c594dd2) and deployed contract [`0x5DE8...62C2`](https://creditcoin-testnet.blockscout.com/address/0x5DE85313c5622e3707C3fED8932F51e5991e62C2), with exact init-code, receipt/finality, bytecode and constructor readback verification.

Pending before submission claims may be upgraded:

- approved, contentful role-partitioned RAG sources;
- organization-scoped import and child-Decision use of the verified Sepolia test-USDC inflow, plus a genuinely second live source chain and broader proof-backed economic metric derivations;
- a real DAO proposal/vote/queue/Timelock/Guard outcome rather than an Evidence anchor;
- broader live error, reorg, coverage, load, fork and independent-audit acceptance.
## Project-owned Sepolia source binding

AEOS no longer plans to demonstrate the USC path with an arbitrary public Sepolia transaction. The locally verified `AEOSTreasuryEvidenceSource` produces the project-owned source event. Its commitment domain includes Sepolia chain ID, contract, immutable reporter, observation ID, hash-only organization/Treasury identity, immutable Evidence payload hash and observation time. It has one nonpayable write method, no external-call opcode, no upgrade path and no asset authority.

The backend deterministically prepares both deployment init code and `commitObservation` calldata but cannot sign or submit either. The user-controlled Sepolia observation, standard USC verification, immutable Evidence import, frozen eight-Agent Decision and user-controlled Creditcoin Testnet `verifyAndAnchor` have now completed one verified 11-step sample. Readback verified the exact transactions, canonical receipts and events before immutable lineage was accepted. This strengthens semantic binding but proves source-transaction inclusion and anchor commitment only; it does not prove payload economic truth, investment performance, AI/PID causality, or a treasury asset action.
