# AEOS final demo video script

Target duration: **3:00 (180 seconds)**. Narration and burned-in judge-facing subtitles: English (`aeos-demo-en.srt`). Chinese translation reference: `aeos-demo-zh.srt`. Primary footage: **Judge Mode (`/dashboard`)**. The narration must remain at its native playback rate (`1.0`) with no time-compression or pitch shift.

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
| 00:00–00:17 | Deck cover for 3 seconds, cut to `/dashboard`; show Judge Mode title and ten-stage timeline. | “Multi-chain DAO treasury decisions depend on data scattered across networks, block explorers and external APIs. This data is difficult to verify independently, and AI can amplify treasury risk when it relies on incorrect or stale information.” |
| 00:17–00:34 | Judge Mode steps 01–03. Cut to the prepared Sepolia source transaction, then the preserved failed Creditcoin verification attempt `0xabee...2c55`. Keep the failure status legible. | “AEOS is an evidence-first AI governance system. It turns cryptographically verified cross-chain treasury events into cited, auditable institutional recommendations, while every asset action remains controlled by DAO voting and a Timelock.” |
| 00:34–00:53 | Cut to the fresh successful Creditcoin Blockscout `TransactionVerified` transaction `0x1011...f860`. Keep status, hash and event/log area legible; no live search. | “Attestcoin is the factual verification boundary. It is neither an asset-custody bridge nor an AI decision-maker. It lets Creditcoin verify that a supported source-chain transaction was included. Only successfully verified data may become immutable AEOS Evidence.” |
| 00:53–01:11 | Return to Judge Mode steps 04–05, then open Evidence Explorer detail `ev_aa0b...60bf`. | “When a continuity proof was stale, AEOS failed closed and preserved the audit trail. After refreshing the Merkle and continuity proof, Creditcoin's native BlockProver verified inclusion, and AEOS checked sender, target, calldata, receipt and event logs.” |
| 01:11–01:35 | Judge Mode step 06; open Decision Room. Show exactly eight roles, frozen RAG citations and the Risk/Compliance challenges. | “The result becomes organization-scoped immutable Evidence. Exactly eight institutional roles analyze one frozen snapshot through approved RAG partitions. Research explains, Strategy proposes, Quant refuses unsupported numbers, and Risk and Compliance challenge independently. Every output cites Evidence and its Retrieval Manifest.” |
| 01:35–01:54 | In Decision Room show the child comparison for inflow and Balance Observer Evidence; keep HOLD/insufficient context visible. | “AEOS then verified a test-USDC inflow and twenty test USDC at one Sepolia block. But a point-in-time balance does not prove current price, liquidity or authorization. When Evidence is stale or insufficient, all eight Agents keep HOLD instead of inventing a trade.” |
| 01:54–02:12 | Return to Judge Mode steps 07–09. Briefly show the Creditcoin `EvidenceAnchored` tab, then the Governance page timeline and canonical Proposal projection. | “Even after the AI Decision and Evidence Snapshot were anchored, they could not bypass DAO governance. Attempt three reached one million For votes, exceeded the forty-thousand quorum, entered a sixty-second Timelock, and executed only after human wallet confirmations.” |
| 02:12–02:29 | Governance Outcome panel and Execute receipt. Keep `CANONICAL CHAIN FINALITY`, `EXECUTED`, zero value and Guard HOLD visible. | “Execution kept TreasuryGuard paused, moved zero native value and created immutable Outcome Evidence. This proves deterministic withholding based on Evidence, not autonomous trading, investment performance or causal economic benefit from AI.” |
| 02:29–02:45 | Keep the Outcome/feedback surface visible, then show the Deck adoption-path frame naming the initial target users. | “AEOS initially serves multi-chain DAO treasuries, protocol foundations, on-chain funds and institutional digital-asset teams, turning fragmented cross-chain activity into verifiable, cited and auditable governance decisions.” |
| 02:45–03:00 | `/verification` summary showing 14 checks and final authority banner. End on the AEOS logo. | “Future research will use zero-knowledge proofs to protect sensitive balances, positions and risk parameters. Attestcoin proves what happened, AI explains what should happen, and the DAO always decides what may execute.” |

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
- Keep final duration between 2:40 and 3:00; the accepted candidate target is exactly 3:00 so narration can remain at native speed and pitch.
- Burn in the supplied English subtitles. A separately attached SRT is useful but does not replace visible English subtitles for silent judging.
- Keep browser zoom at a level where hashes, status and boundary text remain readable at 1080p.
- Mask bookmarks, notifications, unrelated tabs and personally identifying UI.
- Use hard cuts or short dissolves; never record long page loads, RPC waits, Timelock waits, wallet confirmation or Faucet activity.
- Listen once with sound off and confirm the visual story remains understandable.
- Run `npm run verify:video-package`; after export, use `npm run verify:video-package -- --require-video <absolute-mp4-path>` on a machine with `ffprobe` available.
