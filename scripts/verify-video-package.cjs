const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const scriptPath = path.join(root, "docs", "submission", "demo-video-script.md");
const subtitlePath = path.join(root, "docs", "submission", "aeos-demo-en.srt");

function fail(message) {
  process.stderr.write(`${JSON.stringify({ status: "FAIL", message })}\n`);
  process.exit(1);
}

function timestampToMs(value) {
  const match = /^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/.exec(value);
  if (!match) fail(`Invalid SRT timestamp: ${value}`);
  return (((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000) + Number(match[4]);
}

function validatePreproduction() {
  const script = fs.readFileSync(scriptPath, "utf8");
  const subtitles = fs.readFileSync(subtitlePath, "utf8").trim();
  const requiredScriptFacts = [
    "Judge Mode (`/dashboard`)",
    "https://sepolia.etherscan.io/tx/0xf035fdf437b434629087abf81bdf4100997c45e95f97ce8b945985f33291abab",
    "https://creditcoin-testnet.blockscout.com/tx/0xabee56d376bfa486236c02c16eb438097a12c2ec07a636b330290f3861d42c55",
    "https://creditcoin-testnet.blockscout.com/tx/0x1011f237c21733a59472b82c7a14c01e79d99e23ffb3fba1ce4905655a4fb860",
    "http://localhost:3000/evidence/ev_aa0b5dbc6fdf431aa6d9f20789c160bf",
    "http://localhost:3000/decisions?decision=decision_8047c40b442940c8a1b2ea268681b990",
    "http://localhost:3000/governance",
    "ASSET EXECUTION AUTHORIZED / false",
    "1920×1080",
    "30 fps",
    "Do not wait for RPC, Proof Builder, Timelock or Faucet operations on camera.",
  ];
  for (const fact of requiredScriptFacts) {
    if (!script.includes(fact)) fail(`Video script is missing required fact: ${fact}`);
  }

  const blocks = subtitles.split(/\r?\n\r?\n/);
  if (blocks.length !== 10) fail(`Expected 10 SRT cues; found ${blocks.length}`);
  let previousEnd = 0;
  const cues = blocks.map((block, offset) => {
    const lines = block.split(/\r?\n/);
    if (Number(lines[0]) !== offset + 1) fail(`SRT cue index mismatch at cue ${offset + 1}`);
    const timing = /^(\S+) --> (\S+)$/.exec(lines[1] || "");
    if (!timing) fail(`Missing SRT timing at cue ${offset + 1}`);
    const startMs = timestampToMs(timing[1]);
    const endMs = timestampToMs(timing[2]);
    if (startMs !== previousEnd) fail(`SRT gap or overlap before cue ${offset + 1}`);
    if (endMs <= startMs) fail(`Non-positive SRT cue duration at cue ${offset + 1}`);
    if (!lines.slice(2).join(" ").trim()) fail(`Empty SRT text at cue ${offset + 1}`);
    previousEnd = endMs;
    return { index: offset + 1, startMs, endMs };
  });
  if (cues[0].startMs !== 0 || previousEnd !== 170000) fail(`SRT must span exactly 170 seconds; observed ${previousEnd / 1000}`);
  return { cueCount: cues.length, durationSeconds: previousEnd / 1000, requiredFacts: requiredScriptFacts.length };
}

function validateVideo(videoPath) {
  const absolutePath = path.resolve(videoPath);
  if (!fs.existsSync(absolutePath)) fail(`Final video does not exist: ${absolutePath}`);
  if (path.extname(absolutePath).toLowerCase() !== ".mp4") fail("Final video must use an MP4 container");
  const sizeBytes = fs.statSync(absolutePath).size;
  if (sizeBytes < 1_000_000) fail(`Final video is unexpectedly small: ${sizeBytes} bytes`);

  const probe = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_name,codec_type,width,height,avg_frame_rate",
    "-of", "json",
    absolutePath,
  ], { encoding: "utf8", windowsHide: true });
  if (probe.error?.code === "ENOENT") fail("ffprobe is required for strict final-video validation but is not installed");
  if (probe.status !== 0) fail(`ffprobe failed: ${(probe.stderr || "unknown error").trim()}`);
  const metadata = JSON.parse(probe.stdout);
  const video = metadata.streams?.find((stream) => stream.codec_type === "video");
  const audio = metadata.streams?.find((stream) => stream.codec_type === "audio");
  const durationSeconds = Number(metadata.format?.duration);
  const [numerator, denominator] = String(video?.avg_frame_rate || "0/1").split("/").map(Number);
  const frameRate = denominator ? numerator / denominator : 0;
  if (!video || video.codec_name !== "h264") fail("Final video codec must be H.264");
  if (video.width !== 1920 || video.height !== 1080) fail(`Final video must be 1920x1080; observed ${video.width}x${video.height}`);
  if (Math.abs(frameRate - 30) > 0.1) fail(`Final video must be 30 fps; observed ${frameRate}`);
  if (!audio || audio.codec_name !== "aac") fail("Final audio codec must be AAC");
  if (!(durationSeconds >= 160 && durationSeconds <= 180)) fail(`Final duration must be 160-180 seconds; observed ${durationSeconds}`);
  return { absolutePath, sizeBytes, durationSeconds, frameRate, videoCodec: video.codec_name, audioCodec: audio.codec_name, width: video.width, height: video.height };
}

const args = process.argv.slice(2);
const requireVideoIndex = args.indexOf("--require-video");
const preproduction = validatePreproduction();
const video = requireVideoIndex >= 0 ? validateVideo(args[requireVideoIndex + 1] || "") : null;

process.stdout.write(`${JSON.stringify({
  status: video ? "FINAL_VIDEO_TECHNICAL_PASS" : "PREPRODUCTION_PASS",
  preproduction,
  video,
  visualContentReviewed: false,
  publishedUrlVerified: false,
  assetExecutionAuthorized: false,
}, null, 2)}\n`);
