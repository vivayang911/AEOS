# BUIDL CTC 2026 Fall competition audit

Last reconciled: 2026-08-11

## Verified event baseline

Primary event page: <https://dorahacks.io/hackathon/buidl-ctc-2026-fall/detail>

The DoraHacks page is client-rendered and was not reliably machine-readable during this audit. The current event facts below were cross-checked against the indexed event summary at <https://www.competehub.dev/en/competitions/dorahacksbuidl-ctc-2026-fall> and current official Creditcoin USC documentation at <https://docs.creditcoin.org/usc>.

- Event window: 2026-08-13 through 2026-09-06.
- Theme: Attestcoin Smart Contracts (ASCs) and cross-chain applications.
- Tracks: DeFi, RWA, DePIN, Gaming and AI.
- Prize pool: USD 15,000; the top three receive CEIP fast-track access.
- A complete project must contain meaningful, functional ASC integration, working ASC code, and technical setup/use documentation.
- Submission requires project/team information, an ASC integration summary, a public GitHub repository with README, a deck or whitepaper PDF URL, and a prototype demo video URL.
- The project must be original work created during the hackathon, deployed on a testnet, and free of third-party IP infringement.

The current Creditcoin architecture uses Creditcoin as the execution chain. Its native query verifier at `0x0FD2` synchronously verifies Merkle and continuity proofs for source-chain transactions. A DApp ASC must additionally validate transaction success, extract only the expected data, prevent replay, and apply application-specific logic. Official reference: <https://docs.creditcoin.org/usc/overview/usc-architecture-overview> and <https://docs.creditcoin.org/usc/dapp-builder-infrastructure/universal-smart-contracts>.

## AEOS positioning

Recommended primary track: **AI**. Secondary market framing: **DeFi / DAO treasury governance**.

One-sentence entry:

> AEOS turns Attestcoin-verified cross-chain treasury events into immutable Evidence, lets bounded AI agents produce cited advice, and keeps every asset action under deterministic DAO authorization.

The strongest demo story is not a generic bridge. It is a complete trust boundary:

1. A treasury observation/event is emitted on Sepolia.
2. Attestcoin produces Merkle and continuity proof material.
3. An AEOS ASC on Creditcoin verifies the source transaction through `0x0FD2`, validates the exact event/success condition, prevents replay, and anchors an Evidence commitment.
4. AEOS reads the confirmed Creditcoin event into an immutable organization-scoped Evidence record.
5. The eight-Agent Decision Room produces a fully cited HOLD or `INSUFFICIENT_EVIDENCE` recommendation.
6. A human/DAO may review the recommendation, but AI never signs, broadcasts, or receives asset authority.

This makes Attestcoin a core security dependency rather than an ornamental API call.

## Competition readiness matrix

| Requirement or judging signal | Current evidence | Status | Required acceptance evidence |
| --- | --- | --- | --- |
| Clear track and real-world problem | AI-native DAO treasury governance; DeFi secondary framing | Strong | Use one consistent entry sentence and user story in README, deck and video |
| Meaningful functional ASC integration | EvidenceAnchorASC, proof-job boundary, deterministic handoff and confirmation path exist; real proof-backed anchor sample remains absent | Partial/strong | Complete one real Sepolia → USC proof → `verifyAndAnchor` → Evidence/Decision trace |
| Working ASC code inside project | EvidenceAnchorASC source, interface pinning, unit/fuzz/invariant/surface tests and deployment/readback tooling exist | **Pass** | Preserve reproducible test and setup documentation |
| Testnet deployment | Verified Creditcoin Testnet contract `0x5DE8...62C2`, transaction `0xf8ef...4dd2`, exact init-code/getter/receipt/finality readback | **Pass** | Keep Blockscout links and immutable verification artifact in submission materials |
| End-to-end cross-chain demo | Real backend flow stops before user-submitted CC3 confirmation | Partial | Record Sepolia source tx, proof/query identifiers, CC3 verification tx and resulting immutable Evidence ID |
| AI differentiation | All eight PRD roles run with distinct least-privilege tools, immutable A2A messages, Risk/Compliance challenges, fixed schema, citation coverage, refusal and 21/21 evals | Strong local slice / overall partial | Integrate PRD/09 RAG/memory, then demonstrate a good Evidence case and a tampered/stale refusal using live ASC-backed Evidence |
| Safety and governance | RLS, immutable snapshots, append-only audit, no signer/broadcast authority, TreasuryGuard tests | Strong | Explain the authority boundary in the first minute of the demo; do not over-focus on infrastructure |
| Product/demo UX | Cockpit, Evidence Explorer and Decision Room are runnable | Partial/strong | Add a guided one-click demo narrative and surface live testnet provenance prominently |
| Public GitHub with README | Local directory is not a Git repository | **Fail** | Confirm eligibility, initialize the authorized repository, preserve provenance, push public code and verify clean-clone setup |
| Technical ASC documentation | Backend/runbooks exist but no contest-focused ASC setup guide | **Fail** | Add architecture diagram, exact contract flow, network config, deployment address and reproduction steps |
| Deck or whitepaper PDF | None found | **Fail** | Produce a concise 8–10 slide English deck or short whitepaper PDF |
| Prototype demo video | None found | **Fail** | Record a 2–3 minute English-subtitled demo with visible source and destination Explorer evidence |
| Originality during event window | Repository work predates the 2026-08-13 start date | **Eligibility risk** | Ask organizer whether pre-event foundation is allowed and what portion must be built during the event; retain truthful dated provenance |
| Team/submission metadata | Not stored in project | Open | Prepare member name, email, bio, role, residence/citizenship and optional social/resume URLs |

## Competitive advantages to preserve

1. **Evidence-first AI instead of autonomous AI finance.** Every material claim cites immutable Evidence; refusal is deterministic when evidence is stale, low-quality, conflicting or injection-tainted.
2. **Attestcoin as a trust root.** The intended ASC anchors verified source-chain facts on Creditcoin before they are promoted into a governance recommendation.
3. **DAO in control.** Approval is auditable but never becomes AI execution authority; AEOS contains no private key, signer or broadcast capability.
4. **Judge-visible adversarial demo.** The same flow can prove both success and safe refusal, which is stronger than a happy-path-only bridge demo.
5. **Production-shaped security.** Organization RLS, immutable snapshots, idempotency, bounded recovery, Agent evals, Foundry fuzzing, SBOM and secret scans support CEIP due diligence.
6. **Auditable AI organization.** The concept's A2A collaboration becomes an immutable request/challenge ledger across the PRD's eight Agents; Risk and Compliance can visibly block an unsupported recommendation.
7. **Governed institutional memory.** Four memory layers preserve approved organizational learning while current verified Evidence always outranks historical conclusions.
8. **Explainable closed loop.** Attestcoin-backed observations feed deterministic deviation/PID calculations, cited Agent advice and DAO-controlled action, making feedback measurable without autonomous asset authority.

The detailed concept-to-PRD adoption and the ten-role-to-eight-Agent mapping are in [concept-competition-reconciliation.md](concept-competition-reconciliation.md).

## Priority override for the competition

The event hard requirements override broad product completeness. Until all P0 competition gates pass, development order is:

1. Obtain organizer clarification on pre-event code eligibility; do not misrepresent creation dates.
2. Implement the minimal non-asset-moving AEOS Evidence Anchor ASC and its unit/fuzz tests.
3. Build a wallet-explicit Sepolia → proof → Creditcoin ASC → immutable Evidence vertical slice.
4. Deploy and record the testnet address/transactions/Explorer links.
5. Initialize and publish the GitHub repository only after local acceptance and user approval.
6. Add contest-focused README/ASC technical documentation and a reproducible judge demo mode.
7. Produce deck/whitepaper and demo video.
8. Resume Strategy, Governance, Audit and Settings cockpit breadth after the required contest path is demonstrably live.

## Definition of competition-ready

AEOS must not be described as competition-ready until all of the following are true:

- Organizer eligibility clarification is recorded.
- A custom AEOS ASC is in the repository and tested.
- The ASC is deployed on the required Creditcoin testnet.
- A real source transaction and real Creditcoin verification/anchor transaction are linked.
- The resulting immutable Evidence is visible in the cockpit and cited by a Decision.
- A public GitHub URL with clean-clone instructions exists.
- Deck/whitepaper and demo video URLs exist.
- All existing release gates still pass and `assetExecutionAuthorized` remains `false`.
## 2026-08-22 source-semantic hardening

Competition readiness improved with a live, read-back-verified project-owned Sepolia source contract rather than an unrelated transaction. The hash-only, reporter-bound contract and deterministic wallet handoff preserve Evidence-first and DAO-control boundaries. This is meaningful technical differentiation, but it is not eligibility completion: the Sepolia observation event and full Attestcoin → Creditcoin `verifyAndAnchor` → immutable Evidence → eight-Agent Decision path are not live yet. The immediate next step is the frozen source observation call, not another deployment or an Attestcoin API key.
