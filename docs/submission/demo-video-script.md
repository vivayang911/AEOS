# AEOS final demo video script

Target duration: **2:50 (170 seconds)**. Language: English. Subtitle file: `aeos-demo-en.srt`. Primary footage: **Judge Mode (`/dashboard`)**.

## Recording boundary

- Record only canonical testnet evidence, public explorers and the authenticated local cockpit.
- Use the active demo organization, but do not expose session cookies, API keys, environment variables, browser notifications or unrelated tabs.
- Never show a private key, seed phrase, signature payload or wallet extension. The already-public demo address may appear in explorer data.
- Keep `ASSET EXECUTION AUTHORIZED / false` visible whenever an AI, RAG or governance result is shown.
- Describe the governance result as deterministic withholding, not an asset trade or proof of economic benefit.
- Record prepared pages only. Do not wait for RPC, Proof Builder, Timelock or Faucet operations on camera.

## Final shot list and narration

| Time | Screen and exact action | Narration |
| --- | --- | --- |
| 00:00–00:14 | Deck cover for 3 seconds, cut to `/dashboard`; show Judge Mode title and ten-stage timeline. | "Treasury AI has two dangerous failure modes: unverified data can create hallucinated advice, and wallet control can create unsafe authority. AEOS separates evidence, advice and execution." |
| 00:14–00:31 | Judge Mode steps 01–03. Cut to the prepared Sepolia source transaction, then the preserved failed Creditcoin verification attempt `0xabee...2c55`. Keep the failure status legible. | "AEOS uses Attestcoin as its verification boundary. A stale continuity proof failed closed and remained auditable; AEOS did not convert that failed attempt into Evidence." |
| 00:31–00:48 | Cut to the fresh successful Creditcoin Blockscout `TransactionVerified` transaction `0x1011...f860`. Keep status, hash and event/log area legible; no live search. | "After refreshing the Merkle and continuity proof, Creditcoin's native BlockProver accepted the exact source transaction inclusion. AEOS then verified sender, target, calldata, zero value, receipt and event." |
| 00:48–01:05 | Return to Judge Mode steps 04–05, then open Evidence Explorer detail `ev_aa0b...60bf`. | "The result becomes organization-scoped immutable Evidence. Its hash, freshness, quality and source lineage remain visible under tenant isolation. A duplicate verification never becomes a second economic fact." |
| 01:05–01:29 | Judge Mode step 06; open Decision Room. Show exactly eight roles, frozen RAG citations and the Risk/Compliance challenges. | "Exactly eight institutional roles analyze one frozen snapshot through different approved RAG partitions. Research explains, Strategy proposes, Quant refuses unsupported numbers, and Risk and Compliance challenge independently. Every output cites Evidence and its Retrieval Manifest." |
| 01:29–01:47 | In Decision Room show the child comparison for inflow and Balance Observer Evidence; keep HOLD/insufficient context visible. | "A verified inflow still leaves current market state unknown. A later observer proved twenty test USDC at one Sepolia block, but that balance became stale. All eight agents cite it and correctly keep HOLD instead of inventing a trade." |
| 01:47–02:09 | Return to Judge Mode steps 07–09. Briefly show the Creditcoin `EvidenceAnchored` tab, then the Governance page timeline and canonical Proposal projection. | "The Decision and Snapshot were anchored, but advice still could not bypass governance. Attempt three reached one million For votes against forty-thousand quorum, entered a sixty-second Timelock, and executed only after human wallet confirmations." |
| 02:09–02:29 | Governance Outcome panel and Execute receipt. Keep `CANONICAL CHAIN FINALITY`, `EXECUTED`, zero value and Guard HOLD visible. | "Execution kept TreasuryGuard paused, moved zero native value and created immutable Outcome Evidence. This proves deterministic withholding, not autonomous trading, investment performance or causal AI benefit." |
| 02:29–02:41 | Judge Mode step 10, then briefly show RAG/Skill/PID advisory surfaces. | "Outcome Evidence can inform new PID, RAG and Skill candidates, but promotion remains governed and advisory. Historical Evidence, snapshots and Decisions are never rewritten." |
| 02:41–02:50 | `/verification` summary showing 14 checks and final authority banner. End on the AEOS logo. | "Attestcoin establishes what happened. The AI committee explains what should happen. The DAO decides what may happen. AEOS is evidence first, with the DAO in control." |

## Tabs prepared before recording

Open these tabs in this exact order so recording uses cuts instead of live loading or search:

1. `http://localhost:3000/dashboard`
2. `https://sepolia.etherscan.io/tx/0xf035fdf437b434629087abf81bdf4100997c45e95f97ce8b945985f33291abab`
3. `https://creditcoin-testnet.blockscout.com/tx/0xabee56d376bfa486236c02c16eb438097a12c2ec07a636b330290f3861d42c55`
4. `https://creditcoin-testnet.blockscout.com/tx/0x1011f237c21733a59472b82c7a14c01e79d99e23ffb3fba1ce4905655a4fb860`
5. `http://localhost:3000/evidence/ev_aa0b5dbc6fdf431aa6d9f20789c160bf`
6. `http://localhost:3000/decisions?decision=decision_8047c40b442940c8a1b2ea268681b990`
7. `https://creditcoin-testnet.blockscout.com/tx/0x181ab1d51085f845b76cdc5c4971622f550dafd33ed2e501dcc6c284c8bb9731`
8. `http://localhost:3000/governance`
9. `https://creditcoin-testnet.blockscout.com/tx/0xeecd79baabd81d23000ef36791384c1919615d8c4a609fc8215819c970c01160`
10. `http://localhost:3000/strategies`
11. `http://localhost:3000/knowledge`
12. `http://localhost:3000/skills`
13. `http://localhost:3000/verification`

If the exact Decision deep link does not restore the intended child Decision, select `decision_8047...b990` before recording and keep that tab open. Do not repair session state during the recording.

## Required visible facts

1. Judge Mode is the primary narrative surface.
2. Sepolia observation: `0xf035fdf437b434629087abf81bdf4100997c45e95f97ce8b945985f33291abab`.
3. Preserved fail-closed verification attempt: `0xabee56d376bfa486236c02c16eb438097a12c2ec07a636b330290f3861d42c55`; it is not Evidence and is not counted as a successful fact.
4. Fresh successful Creditcoin `TransactionVerified`: `0x1011f237c21733a59472b82c7a14c01e79d99e23ffb3fba1ce4905655a4fb860`.
5. `EvidenceAnchorASC.verifyAndAnchor`: `0x181ab1d51085f845b76cdc5c4971622f550dafd33ed2e501dcc6c284c8bb9731`.
6. Governance Attempt 3 Proposal/Vote/Queue/Execute: `0x60ae…211e`, `0x8242…a8c9`, `0x3ce6…bfc5`, `0xeecd…1160`.
7. Evidence IDs: base `ev_aa0b…60bf`, inflow `ev_1fa9…c0d8`, balance `ev_8e74…0095`, Outcome `ev_govout_fd6c…b8d6`.
8. Final safety frame: `HUMAN APPROVAL REQUIRED / true` and `ASSET EXECUTION AUTHORIZED / false`.

## Export checklist

- Export `1920×1080`, 30 fps, H.264 video and AAC audio in an MP4 container.
- Keep final duration between 2:40 and 3:00; the target is exactly 2:50.
- Burn in the supplied English subtitles. A separately attached SRT is useful but does not replace visible English subtitles for silent judging.
- Keep browser zoom at a level where hashes, status and boundary text remain readable at 1080p.
- Mask bookmarks, notifications, unrelated tabs and personally identifying UI.
- Use hard cuts or short dissolves; never record long page loads, RPC waits, Timelock waits, wallet confirmation or Faucet activity.
- Listen once with sound off and confirm the visual story remains understandable.
- Run `npm run verify:video-package`; after export, use `npm run verify:video-package -- --require-video <absolute-mp4-path>` on a machine with `ffprobe` available.
