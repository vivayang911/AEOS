# AEOS next development plan — institutional intelligence and Evidence Demand Loop

Plan date: 2026-08-12

This plan distills the agreed enterprise-organization model into executable work. It strengthens, but does not replace or reduce, PRD/06–09 and the database, API, security and testing requirements in PRD/13–16. The competition overlay remains binding: a real non-asset-moving Evidence Anchor ASC and wallet-explicit testnet proof are hard submission gates.

## Product model to preserve

AEOS simulates an on-chain institutional investment organization, not an autonomous asset manager.

- Ownership and final authority: DAO asset owners and human governance board.
- Formal eight-Agent committee: Governor, Research, Strategy, Quant, Risk, Compliance, Portfolio and Treasury.
- Deterministic service departments: Evidence Intelligence, Enterprise Knowledge/RAG, Evidence Request Broker, Monitoring, Audit, and Policy/Control.
- DAO-controlled operations: Proposal/Governance Operations, Safe/Timelock and smart-contract controls.

Opportunity Discovery remains a Research/Strategy capability. Monitoring and the Evidence Request Broker are deterministic services, not ninth or tenth Agents. AI may request, analyze, challenge, recommend and draft; it may not hold credentials, call arbitrary networks, vote, sign, broadcast or move assets.

## Target closed loop

```text
Attestcoin-verified facts
  -> Evidence Intelligence normalization/classification
  -> organization and role ACL filtering
  -> RAG retrieval manifest
  -> eight-Agent committee and Risk/Compliance challenge
  -> structured evidence-gap request
  -> deterministic Evidence Request Broker
  -> Attestcoin/read-only discovery adapter
  -> new immutable Evidence
  -> new Decision revision
  -> human/DAO authorization
  -> Safe/Timelock and deterministic contract controls
  -> verified result and governed retrospective/PID feedback
```

An in-flight Decision is never mutated when new Evidence arrives. New facts produce a new Evidence Snapshot and a child Decision revision linked to the prior refusal or recommendation.

## Development sequence

### Slice 1 — freeze role-scoped RAG retrieval manifests — `LOCAL_VERIFIED 2026-08-12`

PRD coverage: PRD/06.2–06.7, PRD/08.4–08.6, PRD/09.1–09.6, PRD/13, PRD/15 and PRD/16.

- Retrieve only `organization_id`, active-status, validity-window and role-ACL eligible chunks.
- Create an immutable Decision retrieval snapshot containing query, role, source/chunk/version IDs, content hashes, stable citations, rank components, embedding/reranker versions and manifest hash.
- Give each of the eight roles only its permitted context; freeze all manifests into the Decision input hash.
- Keep verified structured Evidence above governance/protocol/history knowledge in trust ordering.
- Reject cross-tenant, expired, quarantined, candidate-memory and prompt-injected context.
- Keep the current deterministic committee as the fail-closed fallback if retrieval is unavailable.

Acceptance evidence: identical inputs reproduce hashes; forged/role-forbidden citations fail; Job input cannot mutate while lifecycle state advances; manifests are immutable and RLS-protected; both same-organization cross-role and cross-organization leakage are zero; Risk/Compliance and zero-authority boundaries remain intact. Complete release gate passed with 222 API tests, 5/5 RAG Eval and 39-table RLS through migration 030.

### Slice 2 — deterministic Evidence Intelligence classification and routing — `LOCAL_VERIFIED 2026-08-12`

PRD coverage: PRD/07.2–07.7, PRD/08.1–08.6, PRD/13–16.

- Add versioned navigation labels such as `LIQUIDITY`, `GROWTH`, `RISK`, `SECURITY`, `GOVERNANCE`, `TREASURY` and `PROTOCOL`.
- Classification is a deterministic rule result, not an LLM assertion of truth.
- Preserve Attestcoin provenance and the original Evidence content hash as authoritative.
- Store immutable classification events and role-routing decisions with `organization_id` and RLS.
- Route eligible Evidence to Agent-readable queues using explicit label-to-role policy.
- Conflicts, low quality, stale state and rejected proofs remain visible but cannot support high-impact recommendations.

Acceptance: fixed fixtures reproduce labels/routes; labels never upgrade verification; tenant/role ACL leakage is zero; every route traces backward to proof and forward to Agent claims.

Acceptance evidence: `evidence.classification.v1` and migrations 031–032 bind labels/routes to immutable Evidence content and verification status; Mock and live Attestcoin persistence classify atomically; Decision Job input freezes the exact classification set/hash; unknown labels/routes, truth promotion, mutation, cross-tenant access and asset authority fail closed. Complete release gate passes with 228 API tests and 40-table RLS.

### Slice 3 — Evidence Request Broker and Mock Attestcoin demand adapter — `LOCAL_VERIFIED 2026-08-12`

PRD coverage: PRD/06 tool controls, PRD/07 `EvidenceQuery`/Adapter, PRD/08 lifecycle, PRD/13–16.

Create `evidence.request.v1` as a structured request proposed by an Agent and executed only by a deterministic Broker.

Minimum fields include server-derived organization/Decision/requesting role; evidence-gap code/type; source chain; subject/contract; optional transaction hash or allowlisted event plus bounded block range; required fields/confirmations/freshness; priority/rationale; supporting Evidence IDs; budget, schema version and request hash.

Lifecycle:

`PROPOSED -> VALIDATED | REJECTED -> QUEUED -> DISCOVERING | PROOF_PENDING -> VERIFIED | UNSATISFIED | QUARANTINED | FAILED -> NORMALIZED -> INDEXED -> SATISFIED`.

- Agents propose requests; they receive no arbitrary URL, RPC, credential or network tool.
- Validate chain/address/event allowlists, range/result limits, freshness, provider budget and retry policy.
- Deduplicate identical requests within an organization and Decision lineage.
- Known transaction hashes go directly to the Attestcoin adapter.
- Address/event/range questions first use an approved read-only discovery adapter, then request Attestcoin proof for selected transactions.
- Off-chain market/legal material uses a separately labeled adapter and is never presented as Attestcoin-verified.
- Start with an explicit deterministic Mock adapter when a concrete live source transaction or provider boundary is unavailable.

Acceptance: role-specific requests pass while escalation/arbitrary payloads fail; injection, excessive ranges, unsupported chains, duplicates and exhausted budgets fail deterministically; request history is immutable/RLS/audited; no path gains signer, submission, governance or asset authority.

Acceptance evidence: `evidence.request.v1` derives the formal Agent role from an immutable same-Decision Agent Run, validates allowlisted chains/events and bounded range/freshness/confirmation/result/retry budgets, and deduplicates by organization + Decision + request hash. The deterministic Mock Broker satisfies only bounded balance requests with explicitly Mock Evidence; transaction/event demand without a live source fails `UNSATISFIED`. Migrations 033–034 enforce immutable ordered lifecycle, organization-consistent Decision/Agent/Evidence references and RLS. The complete release gate passes with 234 API tests and 42 tenant tables. Automatic committee gap generation, A2A request references and child Decision revisions remain Slice 4.

### Slice 4 — committee evidence-gap protocol and Decision revisions — `LOCAL_VERIFIED 2026-08-12`

PRD coverage: PRD/06, PRD/08.4–08.6, PRD/09, PRD/14 and PRD/16.

- Add structured gap codes for missing, stale, conflicting, low-quality or unsupported context.
- Allow each formal Agent to propose a bounded request appropriate to its role; Governor coordinates/deduplicates but cannot invent provider payloads.
- Persist request references in immutable A2A messages and Decision output.
- A satisfied request creates a new Evidence Snapshot and child Decision with `parent_decision_id`; preserve the original `INSUFFICIENT_EVIDENCE` result.
- Re-run all eight roles and both Risk/Compliance challenges, never resume halfway through the prior committee.
- Promote retrospectives/governance outcomes to memory only through candidate/approval lifecycle.

Acceptance: no-answer creates a request instead of a hallucination; verified response creates a child revision without mutation; unsatisfied/quarantined/expired results retain refusal; lineage is navigable in both directions.

Acceptance evidence: `committee.evidence-gap.v1` deterministically records missing/stale/conflicting/low-quality/unsupported gaps. Safe requestable gaps are Governor-deduplicated, sent through the existing bounded Broker and linked to immutable round-4 A2A messages. A satisfied Mock request creates a new immutable Evidence Snapshot and one child Decision; the parent refusal remains unchanged and the child reruns all eight roles with Risk/Compliance present. Migrations 035–036 enforce parent/child revision order, immutable links, same-organization Decision/Agent/Request/A2A references and 44-table RLS. Unsupported chains, injection and non-address contexts remain refusal-only. The complete release gate passed using official stable Foundry v1.7.1 selected through `FORGE_BIN`. Live cryptographic Attestcoin satisfaction remains Slice 5.

### Slice 5 — real Attestcoin/USC and Evidence Anchor ASC path

PRD coverage: PRD/07, PRD/08, PRD/12, PRD/15–18 plus the BUIDL CTC overlay.

- Implement the non-asset-moving Evidence Anchor ASC with exact source validation, event binding and replay protection.
- Connect a validated Broker request to the existing read-only USC proof backend.
- Require an explicit user-wallet Creditcoin transaction; AEOS never accepts a private key or broadcasts.
- Verify submitted transaction, calldata, sender, precompile/ASC, zero value, receipt, finality and commitment event before Evidence creation.
- Demonstrate source chain -> Attestcoin -> Creditcoin ASC -> immutable Evidence -> RAG -> cited eight-Agent Decision.
- Preserve Mock mode as deterministic local/CI default.

Acceptance: happy path plus tampered/replayed/wrong-chain/wrong-event/reorg paths pass unit, integration, fuzz/invariant and testnet checks; all chain claims link to proof/Explorer; authority remains with the DAO.

Guard/Registry binding update (2026-08-13): TreasuryGuard freezes a distinct PolicyRegistry address, accepts only exact next policy versions and enforces the snapshotted validity window. DAO activation/configuration is designed as one Safe/Timelock atomic batch while paused. The read-only adapter continuously compares Guard and Registry hash/window at one confirmed block, and Preflight rejects any mismatch. The standalone CLI verifies the paused post-batch binding before unpause; none of these paths can sign, submit or move assets. This replaces the earlier “Guard/Registry integration design missing” item locally; testnet deployment and DAO atomic configuration remain external.

PolicyRegistry deployment update (2026-08-13): deterministic Creditcoin testnet preparation freezes DAO governance, creation/runtime hashes and exact zero-value init code. Read-only verification checks transaction, receipt, finality, runtime, governance and clean initial version. The complete release gate passes; wallet submission and Explorer evidence remain external.

Current status: `PARTIAL / EVIDENCE ANCHOR DEPLOYED + GUARD-REGISTRY EXTERNAL`. The non-upgradeable PolicyRegistry freezes governance-only sequential policy hash/version/validity records without external calls or asset authority. `EvidenceAnchorASC` implements the real USC native query verifier ABI, immutable verifier/source-chain configuration, exact Decision/Snapshot/encoded-transaction/requester commitment, replay protection and a nonpayable single write surface. The user-controlled zero-value deployment is verified on Creditcoin Testnet at `0x5DE85313c5622e3707C3fED8932F51e5991e62C2`; exact init code, successful receipt/finality, deployed code, native verifier and source key all match the frozen plan. Five stateful properties pass at 64 runs and 4096 calls each, and the exact gas snapshot for 18 deterministic behavior/fuzz tests is release-gated. The backend generates deterministic `verifyAndAnchor` calldata from a frozen same-organization Decision/Snapshot/proof, derives the requester from the SIWE session, accepts the ASC address only from server configuration, and persists an immutable unsigned/unsubmitted `evidence.anchor.handoff.v1`. The opt-in read-only confirmation path validates exact chain/sender/target/calldata/value/receipt/finality/canonical block/event identity, persists an immutable confirmation, appends every success/failure attempt and records reorg detection without mutating the prior snapshot. It does not claim that the precompile proves an independently supplied transaction hash. Real proof-backed `verifyAndAnchor`, deployed ASC organization configuration, live Explorer event, DAO atomic Guard/Registry configuration, fork/real calldata, migration drill and independent audit remain incomplete.

### Slice 6 — governed feedback, cockpit and operational acceptance

PRD coverage: PRD/04, PRD/10–11 and PRD/14–18.

- Feed only newly verified observed state into deterministic PI/PID.
- Treat controller output as a bounded suggestion that repeats committee, simulation and DAO gates.
- Add cockpit views for department responsibility, retrieval manifests, A2A challenges, evidence requests/attempts, Decision lineage and verified feedback.
- Complete OpenAPI/client generation, P0 wallet/browser E2E, accessibility, latency/load, restore/deletion propagation and runbooks.
- Rebuild/rescan the changed API image before claiming a release candidate.

## Role-to-evidence-demand policy

| Formal Agent | Allowed evidence-demand domain |
|---|---|
| Governor | Missing citations, unresolved-challenge evidence and Decision-wide completion checks |
| Research | Protocol, growth, governance-history and activity events |
| Strategy | Policy-dependent gaps routed through Research/Quant specializations |
| Quant | Balances, flows, reserves, configuration history and controller observed state |
| Risk | Liquidity, concentration, liquidation, pause, upgrade, security and abnormal-flow events |
| Compliance | Roles, ownership, allowlists, proposals, votes, Timelock and Safe state |
| Portfolio | Organization-wide balances, exposure, allocation and cross-chain distribution |
| Treasury | Treasury/token/gas balances, inflow/outflow, simulation inputs and Safe/Timelock read state |

## Verification required for every slice

- Run `npm run verify:prd` before and after the batch.
- Add unit, service/controller, PostgreSQL integration and tenant-isolation tests.
- Extend Agent/RAG golden sets for no-answer, request generation, conflict, injection, duplicate, budget, unsupported-chain and cross-tenant cases.
- Run typecheck, all tests, production builds and the complete release gate.
- Update README, development brief, implementation status and strict matrix using only verified facts.
- End every batch with explicit scoped completion, whole-PRD status and unfinished requirements. Never count a Mock, placeholder, reduced edge-case set or `LOCAL_VERIFIED` slice as full completion; PRD requirements may not be simplified.

## 2026-08-15 continuation order

1. `LOCAL_VERIFIED`: governed Skill version/event/backtest ledger. Only current approved same-organization Enterprise Memory can be distilled; lifecycle is append-only and tenant-RLS isolated.
2. `LOCAL_VERIFIED`: explicit immutable Policy-to-Skill binding and adaptive PID overlay. Stable ordered Skills can only tighten a bound or force HOLD; snapshot lineage freezes IDs/hashes and retirement blocks future use.
3. `LOCAL_VERIFIED`: bind exact typed Evidence observations to controller inputs without accepting current metrics or historical controller state from the caller. Do not call all market metrics Attestcoin-derived: the current real USC implementation proves transaction inclusion, while price/volatility/liquidity need separately verified sources or a cryptographically traceable derivation.
4. `LOCAL_VERIFIED`: immutable Treasury Outcome records compare before/after Evidence-bound observations and optionally correlate one confirmed Safe execution, but never infer causation or net benefit and never self-promote into Memory/Skill.
5. `LOCAL_VERIFIED`: separately verified historical transaction-cost Evidence now sums only common-numeraire network fee, protocol fee and execution shortfall; slippage/price-impact bps are non-additive diagnostics. It still withholds net benefit and causality.
6. `LOCAL_VERIFIED`: governed prospective counterfactual methodology versions now pre-register a fixed baseline, bounded observation horizon, external factors, benchmark, opportunity-cost/risk formulas, disjoint observed costs and missing-data refusal. Human approval is not relabeled as on-chain DAO approval, applies only to later executions and still produces no assessment or performance claim.
7. `LOCAL_VERIFIED / PARTIAL`: the immutable counterfactual assessment engine/API/migration pass targeted 6/6 tests, PostgreSQL lineage/idempotency/immutability/tenant-isolation verification and the complete 87-suite/340-test Release Gate. The estimate remains non-causal and cannot self-promote or authorize assets.
8. `LOCAL_VERIFIED / PARTIAL`: Evidence-bound adaptive PID is now a registry/active-Policy-bound stateful workload with same-Treasury serialization, cross-Treasury/cross-organization concurrency, filtered Worker claims, lease heartbeats and queue-to-snapshot PostgreSQL verification. Sustained multi-process/production-like load and formal SLO evidence remain open.
9. `LOCAL_VERIFIED / PARTIAL`: a Treasury Outcome plus matching counterfactual assessment may create only an immutable non-causal operating-lesson candidate. Creator separation, distinct REVIEWER/TREASURY_COMMITTEE approvals, optional non-Mock DAO finality and explicit ADMIN promotion gate entry into Approved Enterprise Memory. Fake finality is rejected. One bounded real Decision-bound withholding Outcome now exists; governed promotion into future Memory/Skill and broader positive/alternate outcomes remain incomplete.
10. `LOCAL_VERIFIED / PARTIAL`: PostgreSQL-time expiry and explicit same-Treasury governed supersession now create immutable retirement records. Later search/eight-role manifests exclude the old Memory and route the replacement, while the frozen prior bundle remains unchanged. No LLM decides expiry or replacement.
11. Next backend slice: replace free-text-only invalidation with versioned deterministic predicates plus explicit human adjudication for conditions that cannot be machine-evaluated; then implement deletion-request/backup-propagation evidence without deleting immutable Decision citations or audit lineage.
12. `LOCAL_VERIFIED / PARTIAL`: the owner-approved cockpit now gives Attestcoin, Strategy/PID, RAG, Skills, Governance, Audit and Settings their own deterministic six-stage one-click demonstrations. They close the static-page demo break but remain explicitly simulated and zero-authority.
13. `LOCAL_VERIFIED / PARTIAL`: Attestcoin configuration, organization-scoped reliability summary and proof-job lineage now replace the first static-only surface. Mock/external-probe truth labels and DAO execution withholding remain explicit.
14. Next MVP frontend slice: add proof-job detail/trace navigation and human-controlled lifecycle commands using the existing CSRF/idempotency boundary, then replace the next static page with an authenticated organization-scoped read projection. Do not change the approved overall layout or expose Agent network/signing authority.
15. `BOUNDED LIVE SAMPLE ACCEPTED / PARTIAL`: source-chain discovery reads Creditcoin ChainInfo and refuses unsupported/unattested inputs. One Sepolia-to-Creditcoin Attestcoin lineage, one block-specific balance lineage and one AEOS Decision-bound Governor lifecycle are accepted. A genuinely second source chain, fresh price/liquidity/authorization Evidence, complete error/reorg/load behavior and production acceptance remain; never substitute unrelated or Mock terminal state.

## Explicit non-goals

- No ninth or tenth committee Agent.
- No direct Agent access to Attestcoin, RPC, arbitrary URLs, credentials or code execution.
- No mutation of Evidence, retrieval manifests, A2A messages, Decisions, Proposals or request history.
- No automatic promotion of Agent output into trusted long-term memory.
- No autonomous policy activation, vote, signature, broadcast or treasury execution.
- No claim that external/off-chain content is Attestcoin-verified without supported cryptographic proof.

## 2026-08-22 P0 continuation checkpoint

Historical checkpoint notice (2026-08-26): steps 2–5 below were subsequently completed for one bounded sample, including Sepolia funding/deployment, USC verification, immutable Evidence/eight-Agent Decision and the final ASC anchor. The numbered list remains as the contemporaneous execution record, not the current backlog.

1. `LOCAL_VERIFIED`: project-owned Sepolia Treasury Evidence Source contract, fuzz tests, permission-surface gate, deterministic deployment/readback and tenant/Treasury/Evidence-bound observation request.
2. `EXTERNAL_PENDING`: obtain Sepolia ETH for the user-controlled reporter wallet; re-read balance/nonce/gas and regenerate the exact plan before confirmation.
3. Deploy with the wallet and pass `verify:aeos-evidence-source-deployment`; then prepare, wallet-submit and validate one exact `TreasuryObservationCommitted` transaction.
4. Wait for current ChainInfo coverage, request/fetch the proof and independently validate the source contract, selector, calldata and event before marking the proof usable.
5. Prepare deployed `EvidenceAnchorASC.verifyAndAnchor`, require wallet confirmation, verify finality/event, ingest immutable Evidence and run all eight Agents with frozen RAG citations.
6. Only after steps 2–5 pass may the P0 end-to-end Demo be marked accepted. Then continue submission Deck/video/ASC summary; do not divert into additional frontend scope.
