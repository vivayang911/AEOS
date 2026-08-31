# BUIDL CTC 2026 Fall competition audit

Last reconciled: 2026-08-28

## Verified event baseline

Primary event page: <https://dorahacks.io/hackathon/buidl-ctc-2026-fall/detail>

The current event facts below were rechecked against the live official DoraHacks event page at <https://dorahacks.io/hackathon/buidl-ctc-2026-fall/detail>, the first-party Creditcoin Attestcoin page at <https://creditcoin.org/Deploy>, and the USC architecture documentation at <https://docs.creditcoin.org/usc/overview/usc-architecture-overview>.

- Submission deadline: **2026-09-13 23:59 ET (Extended)**. The live DoraHacks event body states this deadline, while its Asia/Shanghai timeline panel displays **2026-09-14 11:59**; these are the same instant. The former 2026-09-06 deadline is superseded. Recheck the live event page immediately before final submission because organizers may still update the schedule.
- Theme: Attestcoin Smart Contracts (ASCs) and cross-chain applications.
- Tracks: DeFi, RWA, DePIN, Gaming and AI.
- Prize pool: USD 15,000; the top three receive CEIP fast-track access.
- The official event page describes the CEIP benefit as fast-track entry to due diligence; it does not establish a guaranteed per-project investment amount.
- Winning teams receive 8K CertiK repository-audit credits and three months of Skynet Boost. These rewards are not a completed audit claim.
- A complete project must contain meaningful, functional ASC integration, working ASC code, and technical setup/use documentation.
- Submission requires project/team information, an ASC integration summary, a public GitHub repository with README, a deck or whitepaper PDF URL, and a prototype demo video URL.
- The project must be original work created during the hackathon, deployed on a testnet, and free of third-party IP infringement.
- The organizer FAQ supplied by the project owner identifies five judging pillars: user-base expansion, technical alignment, product vision, management-team quality and market fit. A permanent organizer-message URL is still required before treating the copied FAQ as a public citation.
- The same FAQ identifies the currently supported Testnet source chains as Sepolia `chainKey=1` and Ethereum Mainnet `chainKey=3`, with Creditcoin Testnet as the execution chain. AEOS has accepted only the Sepolia source slice; Ethereum Mainnet remains a genuine second-source-chain gap.

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
| Meaningful functional ASC integration | One real Sepolia → USC proof → immutable Evidence/Decision → user-confirmed `verifyAndAnchor` sample is canonically verified | **Pass / strong** | Keep exact transaction, event and truth-boundary evidence visible in the final demo |
| Working ASC code inside project | EvidenceAnchorASC source, interface pinning, unit/fuzz/invariant/surface tests and deployment/readback tooling exist | **Pass** | Preserve reproducible test and setup documentation |
| Testnet deployment | Verified Creditcoin Testnet contract `0x5DE8...62C2`, transaction `0xf8ef...4dd2`, exact init-code/getter/receipt/finality readback | **Pass** | Keep Blockscout links and immutable verification artifact in submission materials |
| End-to-end cross-chain demo | Source transaction, Proof Builder, Creditcoin verification, immutable Evidence, eight-Agent Decision and ASC anchor are recorded; inflow and balance child revisions are also verified | **Pass / strong technical slice** | Present the chain as one continuous judge-visible browser/video narrative |
| AI differentiation | Eight roles have distinct least-privilege tools, approved role-partitioned RAG, immutable A2A, independent Risk/Compliance challenges, citations, refusal, child revisions and 21/21 evals | Strong / overall partial | Show the evidence ladder and explain why stale balance correctly preserves HOLD; add a fresh market-state contrast only if time permits |
| Safety and governance | RLS, immutable snapshots, append-only audit, no signer/broadcast authority, deployed Governor/Timelock/Guard stack and one canonical zero-value withholding Outcome | Strong | Explain the authority boundary in the first minute of the demo; do not over-focus on infrastructure |
| Product/demo UX | Cockpit, Evidence Explorer and Decision Room are runnable | Partial/strong | Add a guided one-click demo narrative and surface live testnet provenance prominently |
| User-base expansion | Target users are defined, but no verified external interview, pilot or active organization user is claimed | **Open / high priority** | Obtain 2-3 consented DAO treasury, governance or DeFi risk interviews; distinguish replies from adoption |
| Market fit | The pain hypothesis is explicit; external validation is not yet recorded | **Open / high priority** | Record current workflow, trust sources, blocking costs and minimum pilot requirements without inventing demand |
| Management-team quality | Solo founder execution and AI-assisted responsibility boundaries are disclosed | Partial | Show founder accountability, domain decisions and the roles needed for a post-hackathon team; do not imply a larger team |
| Public GitHub with README | [`vivayang911/AEOS`](https://github.com/vivayang911/AEOS) is public; final-content checkpoint `3e7b374...31846` and acceptance metadata were pushed; a fresh clone of `25e4549...73aa1` passed the PRD gate and excluded `.tmp/`, `LOCAL-MANUALS/` and video | **Pass / fresh clone verified** | Repeat only after another public-content change |
| Technical ASC documentation | Contest-focused ASC summary, deployment/runbooks, addresses, transaction links and reproduction commands exist | **Pass / final consistency review pending** | Keep the final Deck/video/README terminology identical |
| Deck or whitepaper PDF | Ten-slide English PPTX and fixed-layout PDF exist; PPTX overflow and PDF page checks passed | **Prepared locally / URL pending** | Publish the final PDF and enter its stable URL in the submission form |
| Prototype demo video | The earlier 170-second v3 was rejected because variable time compression altered narration speed/pitch and its level was excessive. The replacement v4 uses native-rate narration and 0.42 gain, passed normal-speed human acceptance, and is published at [`71CnpHXIdgw`](https://www.youtube.com/watch?v=71CnpHXIdgw); YouTube oEmbed confirmed an embeddable `AEOS` video | **Pass / published** | Preserve the v4 hash locally; strict codec confirmation remains separate from URL availability |
| Fail-closed safety demonstration | A real stale-continuity-proof verification transaction is preserved and was not accepted as Evidence; the local video candidate contrasts it with the later canonical fresh-proof success | **Included in local candidate** | Keep both statuses legible and never count the failed attempt as an economic fact |
| Originality during event window | No organizer adjudication is recorded in the repository; AI-assisted development and human responsibility are disclosed without inventing a start date | **Open evidence item** | Preserve truthful Git/on-chain provenance and answer organizer questions factually if asked |
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

1. Preserve truthful Git/on-chain provenance and do not invent a project start date or organizer ruling.
2. Keep the completed non-asset-moving Evidence Anchor ASC and live 11-step evidence reproducible.
3. Preserve the verified public repository and repeat secret/history/clean-clone checks after the final content freeze.
4. Publish the prepared Deck PDF and narrated Judge Mode video.
5. Run a bounded user-discovery call and obtain 2-3 consented practitioner interviews; do not treat social engagement as adoption.
6. Update the Deck with the user-expansion path and keep technical test counts in the verification appendix rather than using them as the main judging story.
7. Add Ethereum Mainnet `chainKey=3` as the second real source only after the submission draft is safe and the selected public transaction has narrow, non-treasury ownership semantics.
8. Add fresh price/liquidity/authorization Evidence only if it does not displace submission completion.
9. Perform final clean-clone and material/URL consistency checks.
10. Resume broader PRD production, resilience and frontend breadth after submission gates are complete.

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

> Superseded status notice (2026-08-26): the path described above as not yet live subsequently completed one bounded 11-step sample. The paragraph is retained as a dated checkpoint. Final-content `main`, a fresh public clone, the accepted YouTube video and the extended deadline are now verified. The current blocker is DoraHacks draft/final submission and any optional public Demo hosting—not the original source observation, ASC anchor, governance outcome, GitHub, Deck or video.
