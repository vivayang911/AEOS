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

The competition proof-to-anchor sample and bounded P0-1 governance-withholding slice are complete. The approved five-source `DEMO_ADVISORY_RUBRIC_V1` corpus drove contentful Decision `decision_6967...7101a` with eight `SUPPORTED` role Manifests. A separate Sepolia test-USDC inflow passed ChainInfo, Proof Builder, static BlockProver and canonical Creditcoin `TransactionVerified` verification; duplicate wallet submission remains disclosed and is not counted twice. The SIWE tenant imported the fact as immutable `asset.transfer.inflow` Evidence `ev_1fa9...c0d8`, then froze child Snapshot `snap_dffc...051f` and child Decision `decision_15bd...f759`. All eight parent RAG Manifests/citations were inherited exactly and every role added the new Evidence citation. The correct result did not change: a transfer event does not prove current balance, price, liquidity, volatility or authority, while inherited stale Evidence remains. Strategy therefore stays operational HOLD, Risk/Compliance preserve their challenges and Treasury adds the Evidence to preflight without drafting a transaction. The existing Mock `asset.balance` request is not falsely marked satisfied. Next priorities are a truly current balance/market-state proof, governed Outcome feedback into PID/RAG/Skills, a genuinely second source chain, complete browser P0 E2E, final Deck/video and public repository refresh.

Current-balance work is now `LOCAL_PREPARED / EXTERNAL_PENDING`: `AEOSBalanceObserver` reads the actual ERC-20 `balanceOf` return through `STATICCALL` and freezes it with token runtime identity, source block and tenant/Treasury commitments. The deployment plan, observation-request engine, exact receipt/event/storage verifier and contract-surface gate are local only. Do not count this as Evidence until the human wallet deploys and calls it on Sepolia, Attestcoin verifies the observation transaction, and AEOS independently imports the resulting immutable tenant fact. A copied calldata value is never acceptable as balance truth.

P0-1 accepted checkpoint: earlier deadline failures remain preserved and are not rewritten. Attempt 3 Artifact `0x9649...a48a`, Proposal `0x60ae...211e`, For vote `0x8242...a8c9`, Queue `0x3ce6...bfc5` and Execute `0xeecd...1160` have separate canonical reports. The chain verifies 1,000,000 For votes, zero Against/Abstain, 40,000 quorum, the 60-second Timelock, exact `ProposalExecuted`/`CallExecuted`/`PauseChanged(true)` events and operation `0xc504...b85f` Done. The final state maintains TreasuryGuard pause, moves zero native value and performs no PolicyRegistry mutation. Frozen candidate `0xef29...eeb1` was imported as tenant-scoped immutable Evidence `ev_govout_fd6c...b8d6` and Outcome lineage `govout_ef29...2936`; active probes verify RLS hiding and UPDATE rejection. P0-1 is `ACCEPTED` only for this deterministic withholding slice. No economic benefit or causal AI claim is made, and PID/RAG/Skill feedback is still pending.

## P1 — award evidence

- Deck: problem, verified-data architecture, live transaction trace, eight-Agent interaction, deterministic guardrails, DAO authority boundary, measured demo and roadmap.
- Video: show Explorer first; then trace source transaction → Attestcoin/USC → Evidence → RAG/Agents → Decision → wallet-confirmed anchor. Never show fixture data as live.
- ASC integration summary: use `docs/submission/asc-integration-summary.md`; replace every pending marker only with verified transaction evidence.

## P2 — submission completeness

- Founder/team profile, project description, category/track mapping, repository, demo URL, contract/transaction links, video URL, deck URL, security disclaimer and testnet-only status.
- Perform a final eligibility/rules review against the current official event page immediately before submission.
## 2026-08-22 source-transaction readiness update

- `DONE / LOCAL_VERIFIED`: project-owned `AEOSTreasuryEvidenceSource`, Solidity/fuzz tests, compiled no-asset/no-call surface gate, deterministic unsigned Sepolia deployment, deployment readback and tenant/Treasury/Evidence-bound observation calldata preparation.
- `BLOCKED / USER ACTION`: fund `0x444D510728FB8072351cB5d0E88432e6a8501DFA` with enough Sepolia ETH. The latest read-only balance was zero; do not submit until the balance and gas estimate are re-read.
- `NEXT`: user-wallet deploy source contract, verify receipt/finality, submit the exact observation call, validate its event, request the USC proof, then user-confirm deployed Creditcoin `EvidenceAnchorASC.verifyAndAnchor`.
- `NOT YET DONE`: immutable live Evidence creation and cited eight-Agent Decision from that event. Deployment of the Creditcoin ASC alone does not satisfy the end-to-end Demo gate.
