# P0-5 final video recording and publication runbook

Status: `PREPRODUCTION READY / RECORDING AND PUBLICATION PENDING`

## Acceptance rule

P0-5 is complete only when all of the following exist:

1. A final MP4 passes the technical gate: 1920×1080, 30 fps, H.264, AAC, 160–180 seconds.
2. English narration or burned-in English subtitles are present and readable.
3. Judge Mode is the main surface; Sepolia Etherscan, Creditcoin Blockscout, Evidence Explorer, Decision Room and Governance are visibly included.
4. The final frame visibly states `ASSET EXECUTION AUTHORIZED / false`.
5. No Faucet, live wallet confirmation, RPC wait, Proof Builder wait or Timelock wait appears.
6. A stable public or unlisted HTTPS video URL has been opened in a signed-out/private window and plays successfully.

## Before recording

1. Restart only the AEOS Web/API processes if required; verify `/health/live`, `/health/ready`, `/dashboard` and `/verification` before opening the recorder.
2. SIWE sign in and select `AEOS Hackathon Demo DAO` before recording. Do not show the signature prompt.
3. Open the twelve tabs listed in `demo-video-script.md`; wait for every page to finish loading.
4. Preselect child Decision `decision_8047...b990` and scroll each AEOS page to the exact panel used in the shot.
5. Collapse bookmarks, close unrelated tabs, enable Do Not Disturb and hide wallet-extension popovers.
6. Set the capture canvas and output to 1920×1080 at 30 fps. Record one ten-second test and confirm that hashes and subtitles are legible.

## Recording method

No supported desktop recorder was detected in the current environment. Use an already trusted recorder or install a reputable recorder separately. A recorder must capture the browser at native 1080p and the microphone at a stable level. Do not install or run newly downloaded software without explicit user approval.

Record the screen actions first using the fixed timecodes. Narration may be recorded live or added afterward; recording narration afterward usually produces fewer pauses and protects the 170-second timing. Capture two takes and retain the cleaner one.

## Edit and export

1. Remove all loading, cursor hunting and dead air.
2. Keep explorer status/hash/event sections on screen long enough to read; do not fake or replace them with fixture screenshots.
3. Burn in `aeos-demo-en.srt` using a high-contrast lower-third style with safe margins.
4. Normalize speech without clipping and keep background music absent or quiet enough not to reduce intelligibility.
5. Export H.264/AAC MP4 at 1920×1080, 30 fps, 160–180 seconds. Use a visually lossless-enough bitrate for small text; 8–16 Mbps is a reasonable 1080p range, not an acceptance guarantee.
6. Name the final file `AEOS-BUIDL-CTC-2026-Fall-Demo-v1.mp4` and retain the raw recording separately.

## Local verification

Run:

```powershell
npm run verify:video-package
npm run verify:video-package -- --require-video "C:\absolute\path\AEOS-BUIDL-CTC-2026-Fall-Demo-v1.mp4"
```

The strict command requires `ffprobe`. If it is unavailable, do not mark the technical video gate complete; verify the media on a machine with FFmpeg/ffprobe or install it through an approved process.

Then watch the entire export twice:

- once with audio, checking narration and subtitle synchronization;
- once muted, checking that the evidence-to-decision-to-governance story remains understandable.

## Publication

Recommended delivery is an **unlisted YouTube video** because judges can play it without downloading a large file and the link is stable. Public YouTube, Vimeo or another organizer-supported host is also acceptable if the event rules permit it.

Before upload, confirm that the file contains no secrets, wallet extension popovers, notifications or unrelated personal information. Uploading and publishing are external side effects; the human owner must confirm the exact file, account, visibility and title immediately before the upload/publish action.

Suggested metadata:

- Title: `AEOS — Evidence-First AI Governance on Attestcoin | BUIDL CTC 2026 Fall`
- Visibility: `Unlisted` until the submission is finalized.
- Description first line: `AEOS turns Attestcoin-verified cross-chain events into cited eight-agent decisions while keeping every asset action under deterministic DAO control.`
- Required disclaimer: `Testnet demonstration. AI has no private key, signer, broadcast capability or asset execution authority.`

After publication, open the link in a signed-out/private window, play the first and final 15 seconds, and record the stable HTTPS URL in `submission-consistency-manifest.md`, README and the DoraHacks form. Do not mark P0-5 complete until that external playback check passes.
