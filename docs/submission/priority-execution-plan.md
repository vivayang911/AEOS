# BUIDL CTC submission priority execution plan

Status: `ASC DEPLOYMENT VERIFIED / LIVE PROOF ROUND-TRIP PENDING`.

## P0 — eligibility evidence

1. **Complete:** generate and review the deterministic `EvidenceAnchorASC` deployment handoff.
2. **Complete:** human wallet confirmed the zero-value contract-creation transaction on Creditcoin Testnet.
3. **Complete:** readback observed five confirmations, exceeding the two-confirmation floor.
4. **Complete:** `verify:evidence-anchor-deployment` passed all 11 checks against transaction `0xf8ef...4dd2` and address `0x5DE8...62C2`.
5. **Complete:** Blockscout links, transaction hash, constructor readback and verification report are preserved in README and `reports/deployment/`.
6. Run one real Sepolia transaction through ChainInfo coverage, Proof Builder, BlockProver, immutable Evidence, eight-Agent Decision and unsigned Evidence Anchor handoff.
7. Human wallet confirms `verifyAndAnchor`; AEOS validates exact calldata, sender, zero value, receipt, canonical block and `EvidenceAnchored` event.

P0 is not complete until steps 6–7 have non-Mock testnet evidence.

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
