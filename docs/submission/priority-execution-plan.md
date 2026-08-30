# BUIDL CTC submission priority execution plan

Status: `ONE LIVE 11-STEP SAMPLE VERIFIED / WHOLE PRD PARTIAL`.

Development disclosure: AEOS is AI-assisted. AI coding agents support requirements analysis, implementation, testing, failure investigation and documentation; the human owner controls product/risk decisions and every wallet or DAO confirmation. AI has no signer, broadcaster, private-key custody or treasury authority.

## P0 — eligibility evidence

1. **Complete:** generate and review the deterministic `EvidenceAnchorASC` deployment handoff.
2. **Complete:** human wallet confirmed the zero-value contract-creation transaction on Creditcoin Testnet.
3. **Complete:** readback observed five confirmations, exceeding the two-confirmation floor.
4. **Complete:** `verify:evidence-anchor-deployment` passed all 11 checks against transaction `0xf8ef...4dd2` and address `0x5DE8...62C2`.
5. **Complete:** Blockscout links, transaction hash, constructor readback and verification report are preserved in README and `reports/deployment/`.
6. **Complete for one sample:** a real Sepolia transaction passed ChainInfo coverage, Proof Builder, BlockProver, immutable Evidence, eight-Agent Decision and the Evidence Anchor handoff.
7. **Complete for one sample:** the human wallet confirmed `verifyAndAnchor`; AEOS validated exact calldata, sender, zero value, receipt, canonical block and `EvidenceAnchored` event.

The competition proof-to-anchor sample and bounded P0-1 governance-withholding slice are complete. The approved five-source `DEMO_ADVISORY_RUBRIC_V1` corpus drove contentful Decision `decision_6967...7101a` with eight `SUPPORTED` role Manifests. A separate Sepolia test-USDC inflow passed ChainInfo, Proof Builder, static BlockProver and canonical Creditcoin `TransactionVerified` verification; duplicate wallet submission remains disclosed and is not counted twice. The SIWE tenant imported the fact as immutable `asset.transfer.inflow` Evidence `ev_1fa9...c0d8`, then froze child Snapshot `snap_dffc...051f` and child Decision `decision_15bd...f759`. A later block-specific Balance Observer lineage produced immutable `asset.balance` Evidence `ev_8e74...0095`, Snapshot `snap_a2ff...8a99` and Decision `decision_8047...b990`. Every role cites the new Evidence and inherits the exact RAG bundle. The correct result did not change: a stale single-block balance does not prove current price, liquidity, volatility or authority. Strategy remains HOLD, Risk/Compliance preserve their challenges and Treasury produces no transaction. Judge Mode now presents one accepted lineage as a ten-stage, one-click, read-only replay with public receipts and explicit truth/authority limits. Under the organizer FAQ's five judging pillars, the immediate gap is external user/market validation rather than more test-count work. The currently supported second source is Ethereum Mainnet `chainKey=3`; it remains unimplemented and must not be confused with Creditcoin as the execution chain.

Current-balance work is now `BLOCK_SPECIFIC_BALANCE CHILD REVISION ACCEPTED`: `AEOSBalanceObserver` read the actual ERC-20 `balanceOf` return through `STATICCALL` and froze it with token runtime identity, source block and tenant/Treasury commitments. Deployment `0x7ba8...3a88`, observation `0x627a...6837`, canonical Creditcoin verification `0xee31...29c1b`, Evidence `ev_8e74...0095`, child Snapshot `snap_a2ff...8a99` and child Decision `decision_8047...b990` passed their scoped checks. All eight roles cite the new fact and inherit the exact RAG bundle. The correct outcome remains HOLD because the 300-second freshness window expired and no price, liquidity or authorization Evidence exists. A copied calldata value is never accepted as balance truth.

P0-1 accepted checkpoint: earlier deadline failures remain preserved and are not rewritten. Attempt 3 Artifact `0x9649...a48a`, Proposal `0x60ae...211e`, For vote `0x8242...a8c9`, Queue `0x3ce6...bfc5` and Execute `0xeecd...1160` have separate canonical reports. The chain verifies 1,000,000 For votes, zero Against/Abstain, 40,000 quorum, the 60-second Timelock, exact `ProposalExecuted`/`CallExecuted`/`PauseChanged(true)` events and operation `0xc504...b85f` Done. The final state maintains TreasuryGuard pause, moves zero native value and performs no PolicyRegistry mutation. Frozen candidate `0xef29...eeb1` was imported as tenant-scoped immutable Evidence `ev_govout_fd6c...b8d6` and Outcome lineage `govout_ef29...2936`; active probes verify RLS hiding and UPDATE rejection. P0-1 is `ACCEPTED` only for this deterministic withholding slice. No economic benefit or causal AI claim is made, and PID/RAG/Skill feedback is still pending.

## P1 — award evidence

- **Deck prepared locally:** `docs/submission/aeos-buidl-ctc-2026-fall.pptx` and `.pdf` contain 10 English slides. The current revision replaces test-count emphasis with an honest adoption path aligned to user-base expansion and market fit; test results remain available in README and Judge Verification.
- **Revised narrated video prepared locally:** human review rejected v3 because variable cue compression produced rushed, pitch-shifted narration at excessive volume. `LOCAL-MANUALS/submission/AEOS-Judge-Mode-180s-Narrated-v4-final.mp4` is the replacement 180-second, 1920×1080 candidate with fixed `1.0` narration playback and `0.42` gain. It retains the three-act route, product pain, Attestcoin verification role, target users and future-only ZK direction. Normal-speed human acceptance, strict `ffprobe` codec confirmation and a hosted URL remain pending.
- **ASC integration summary updated:** `docs/submission/asc-integration-summary.md` now distinguishes completed live samples from remaining second-chain/market-state/production work.
- **User discovery is now the highest open judging gap:** publish the owner-reviewed LinkedIn call stored locally at `LOCAL-MANUALS/submission/linkedin-dao-validation-call.md`; obtain 2-3 consented interviews. Likes, impressions, connections and unanswered messages are not interviews, users or product-market fit.

### P1 validation acceptance

1. Record the participant's role category, existing workflow, trusted sources, pain, objections and minimum pilot requirements.
2. Keep names/contact details local unless separately authorized for quotation.
3. Separate direct quotes from AEOS interpretation and do not infer partnership or pilot intent.
4. Add only consented anonymized findings to the public Deck/submission.

### P1.5 supported second source — after submission safety

- The organizer FAQ supplied by the owner identifies Sepolia `chainKey=1` and Ethereum Mainnet `chainKey=3` as current sources. Creditcoin Testnet is the execution chain, not a second source.
- Select an already-finalized public Ethereum Mainnet transaction with narrow economic semantics; do not spend mainnet gas or represent an unrelated address as the AEOS treasury.
- Acceptance still requires Proof Builder output, Creditcoin Testnet `verifyAndEmit`, independent `TransactionVerified` finality, immutable tenant Evidence and eight-Agent citation. A block-explorer screenshot or RPC read alone is insufficient.

## P2 — submission completeness

- Founder/team profile, project description, category/track mapping, repository, demo URL, contract/transaction links, video URL, deck URL, security disclaimer and testnet-only status.
- Perform a final eligibility/rules review against the current official event page immediately before submission.
## 2026-08-22 source-transaction readiness update

- `DONE / LOCAL_VERIFIED`: project-owned `AEOSTreasuryEvidenceSource`, Solidity/fuzz tests, compiled no-asset/no-call surface gate, deterministic unsigned Sepolia deployment, deployment readback and tenant/Treasury/Evidence-bound observation calldata preparation.
- `BLOCKED / USER ACTION`: fund `0x444D510728FB8072351cB5d0E88432e6a8501DFA` with enough Sepolia ETH. The latest read-only balance was zero; do not submit until the balance and gas estimate are re-read.
- `COMPLETE FOR ONE SAMPLE`: the user-wallet source deployment/observation, canonical receipt/event, USC proof, Creditcoin verification, immutable tenant Evidence, cited eight-Agent Decision and `EvidenceAnchorASC.verifyAndAnchor` reconciliation are recorded.
- `NEXT`: finalize public repository consistency, Deck/PDF, video and judge-facing continuous browser narrative; then add fresh price/liquidity/authorization Evidence only if it does not displace submission completion.
