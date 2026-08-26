# AEOS demo video script

Target duration: **2:50 (170 seconds)**. Language: English. Subtitle file: `aeos-demo-en.srt`.

## Recording boundary

- Record only canonical testnet evidence and the authenticated local cockpit.
- Use the active demo organization, but do not expose raw session cookies, API keys, environment variables or private identifiers.
- Never show a private key, seed phrase, signature payload or browser extension account details beyond the already-public demo address.
- Keep `assetExecutionAuthorized=false` visible whenever an AI or RAG result is shown.
- Describe the Governance result as deterministic withholding, not an asset trade or proof of economic benefit.

## Shot list and narration

| Time | Screen | Narration |
| --- | --- | --- |
| 00:00–00:15 | Deck cover, then AEOS cockpit | "Treasury AI has a trust problem. If its data is unverified, its advice can hallucinate. If it controls a wallet, its authority is unsafe. AEOS separates evidence, advice and execution." |
| 00:15–00:32 | Attestcoin Flow page | "AEOS uses Attestcoin as the verification boundary. A project-owned Sepolia observation is covered by the attestation network and verified by Creditcoin's native BlockProver." |
| 00:32–00:50 | Blockscout transaction and `TransactionVerified` event | "This is not a mocked API response. The canonical Creditcoin transaction emitted TransactionVerified for the exact source block. AEOS checks the sender, target, calldata, zero value, receipt and event before accepting it." |
| 00:50–01:08 | Evidence Explorer, open immutable Evidence | "The verified result becomes organization-scoped immutable Evidence. Content hashes, freshness, quality, source lineage and duplicate attempts remain visible. A duplicate verification transaction never becomes a second economic fact." |
| 01:08–01:32 | Decision Room, role list and RAG citations | "Eight institutional roles analyze the same frozen snapshot through different approved RAG partitions. Research explains the evidence. Strategy proposes. Quant refuses unsupported numbers. Risk and Compliance challenge independently. Every output cites Evidence and its Retrieval Manifest." |
| 01:32–01:50 | Parent/child comparison | "A verified inflow still leaves the current state unknown. A later Balance Observer proves twenty test USDC at one Sepolia block, but its freshness window has expired. All eight agents cite it, and the committee correctly keeps HOLD instead of inventing a trade." |
| 01:50–02:14 | Governance page and Attempt 3 lineage | "Advice cannot bypass governance. The accepted Decision produced a proposal, one million votes for against a forty-thousand quorum, a sixty-second Timelock and a Guard outcome. Every on-chain transaction was confirmed by the human wallet." |
| 02:14–02:31 | Outcome Evidence and Audit Log | "Execution maintained the Treasury Guard pause, moved zero native value and created immutable Outcome Evidence. This proves deterministic withholding—not autonomous asset execution or investment performance." |
| 02:31–02:42 | Strategy/PID and RAG/Skill candidate surfaces | "Outcome feedback can inform PID, RAG and Skill candidates, but promotion remains governed and advisory. Historical Decisions are never rewritten." |
| 02:42–02:50 | Closing slide | "Attestcoin establishes what happened. The AI committee explains what should happen. The DAO decides what may happen. AEOS is evidence first, with the DAO in control." |

## Required inserts

1. Creditcoin `TransactionVerified` transaction: `0x1011f237c21733a59472b82c7a14c01e79d99e23ffb3fba1ce4905655a4fb860`.
2. `EvidenceAnchorASC.verifyAndAnchor`: `0x181ab1d51085f845b76cdc5c4971622f550dafd33ed2e501dcc6c284c8bb9731`.
3. Governance Attempt 3 Proposal/Vote/Queue/Execute: `0x60ae…211e`, `0x8242…a8c9`, `0x3ce6…bfc5`, `0xeecd…1160`.
4. Evidence IDs shown in the cockpit: base `ev_aa0b…60bf`, inflow `ev_1fa9…c0d8`, balance `ev_8e74…0095`, Outcome `ev_govout_fd6c…b8d6`.
5. Final safety frame: `HUMAN APPROVAL REQUIRED / true`, `ASSET EXECUTION AUTHORIZED / false`.

## Editing checklist

- Export 1920×1080, 30 fps, H.264 MP4.
- Keep the final duration between 2:40 and 3:00.
- Burn in the supplied English subtitles or attach the SRT to the upload.
- Mask browser bookmarks, notifications and unrelated tabs.
- Use cuts rather than long loading sequences; do not accelerate text so much that hashes become unreadable.
- Verify every displayed hash against README and the submission consistency manifest before export.
