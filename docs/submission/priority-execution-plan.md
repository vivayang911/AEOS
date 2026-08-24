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

The competition proof-to-anchor sample is complete. The product P0 is not complete: next is the smallest real DAO Proposal → vote/quorum → queue → Timelock → Guard/Policy outcome, followed by immutable Outcome Evidence. An Evidence anchor is not a treasury asset action.

Current P0-1 checkpoint: the first exact Proposal transaction `0x37b0...2d02` has frozen canonical finality but ended `Defeated / NO_VOTES_BEFORE_DEADLINE`. The recovery Proposal/Vote `0x3cf2...e0d83` / `0x56b9...570df`, Queue `0x1f88...c7a1d` and Execute `0x8bba...fe91` have separate formal canonical reports and established `votingPeriod=240`. HOLD attempt 2 (`0x0284...52ff`) was also preserved as a zero-vote defeat rather than hidden or overwritten. Attempt 3 Artifact `0x9649...a48a`, Proposal `0x60ae...211e` and For vote `0x8242...a8c9` now have separate canonical reports. The exact `VoteCast` records 1,000,000 For votes against 40,000 quorum, but the Governor remains `Active` until deadline `5363236`; quorum does not shorten the voting period. Queue is intentionally absent until state `Succeeded`. Queue/Timelock/Execute, Policy/Guard result and Outcome Evidence remain incomplete; P0-1 remains `PARTIAL`.

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
