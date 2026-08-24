const { createServer } = require("node:http");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");

const HOST = "127.0.0.1";
const PORT = Number(process.env.AEOS_GOVERNANCE_HOLD_QUEUE_PORT || 4194);
const HANDOFF_PATH = resolve(process.env.AEOS_GOVERNANCE_HOLD_QUEUE_PATH || resolve(__dirname, "../reports/live-demo/p0-1-governance-hold-attempt-3-queue.json"));
const SUBMISSION_PATH = resolve(process.env.AEOS_GOVERNANCE_HOLD_QUEUE_SUBMISSION_PATH || resolve(__dirname, "../reports/live-demo/p0-1-governance-hold-attempt-3-queue-submission.json"));
const EXPECTED_FROM = "0x444d510728fb8072351cb5d0e88432e6a8501dfa";
const EXPECTED_GOVERNOR = "0xfe90b087fae789e043514b6ac3dbd7fd2d970268";
const EXPECTED_GUARD = "0x3c0cb960f32e6a222149a664a552ffc23e92c628";
const SET_PAUSED_TRUE = "0x16c38b3c0000000000000000000000000000000000000000000000000000000000000001";

function readHandoff() {
  const value = JSON.parse(readFileSync(HANDOFF_PATH, "utf8"));
  const tx = value.unsignedTransaction;
  if (value.schemaVersion !== "aeos.live-governance-hold-queue.v1" || value.status !== "HOLD_QUEUE_REQUEST_PREPARED") throw new Error("Unsupported HOLD Queue handoff");
  if (value.lineage?.voteFinalityStatus !== "HOLD_VOTE_SUCCEEDED" || value.lineage?.attemptNumber !== 3 || !/^0x[0-9a-f]{64}$/i.test(value.lineage?.proposalArtifactHash || "") || !/^[1-9][0-9]*$/.test(value.lineage?.proposalId || "")) throw new Error("HOLD Queue lineage invalid");
  if (value.proposal?.action?.function !== "setPaused(bool)" || value.proposal.action.paused !== true || value.proposal.action.target?.toLowerCase() !== EXPECTED_GUARD || value.proposal.action.value !== "0" || value.proposal.targets?.[0]?.toLowerCase() !== EXPECTED_GUARD || value.proposal.values?.[0] !== "0" || value.proposal.calldatas?.[0]?.toLowerCase() !== SET_PAUSED_TRUE) throw new Error("HOLD Queue action invalid");
  if (value.controls?.requiresUserWalletConfirmation !== true || value.controls?.signed || value.controls?.submitted || value.controls?.privateKeyReceived || value.controls?.signerCustody || value.controls?.broadcastCapability || value.controls?.treasuryAssetMovement !== false || value.controls?.assetExecutionAuthorized !== false) throw new Error("HOLD Queue authority boundary invalid");
  if (tx?.chainId !== 102031 || tx?.from?.toLowerCase() !== EXPECTED_FROM || tx?.to?.toLowerCase() !== EXPECTED_GOVERNOR || tx?.value !== "0x0" || !/^0x[0-9a-f]+$/i.test(tx?.data || "") || !/^0x[0-9a-f]{64}$/i.test(tx?.dataHash || "")) throw new Error("HOLD Queue transaction invalid");
  return value;
}

function recordSubmission(payload, handoff) {
  const tx = handoff.unsignedTransaction;
  if (!/^0x[0-9a-f]{64}$/i.test(payload.transactionHash || "")) throw new Error("Invalid transaction hash");
  if ((payload.from || "").toLowerCase() !== tx.from.toLowerCase()) throw new Error("Submission wallet mismatch");
  const record = { schemaVersion: "aeos.live-governance-hold-queue-submission.v1", status: "HOLD_QUEUE_WALLET_SUBMITTED", recordedAt: new Date().toISOString(), chainId: tx.chainId, from: tx.from, to: tx.to, value: tx.value, transactionHash: payload.transactionHash.toLowerCase(), calldataHash: tx.dataHash, queueArtifactHash: handoff.artifactHash, proposalArtifactHash: handoff.lineage.proposalArtifactHash, voteTransactionHash: handoff.lineage.voteTransactionHash, proposalId: handoff.lineage.proposalId, attemptNumber: handoff.lineage.attemptNumber, walletConfirmed: true, receiptVerified: false, proposalQueuedEventVerified: false, timelockScheduledEventVerified: false, privateKeyReceived: false, signerCustody: false, broadcastCapability: false, assetExecutionAuthorized: false };
  mkdirSync(dirname(SUBMISSION_PATH), { recursive: true });
  if (existsSync(SUBMISSION_PATH)) {
    const existing = JSON.parse(readFileSync(SUBMISSION_PATH, "utf8"));
    if (existing.transactionHash !== record.transactionHash || existing.queueArtifactHash !== record.queueArtifactHash) throw new Error("Immutable HOLD Queue submission already exists with different identity");
    return existing;
  }
  writeFileSync(SUBMISSION_PATH, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return record;
}

function send(res, status, body, type = "text/plain; charset=utf-8") { res.writeHead(status, { "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'", "Content-Type": type, "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" }); res.end(body); }
async function body(req) { const chunks = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > 16384) throw new Error("Request body too large"); chunks.push(chunk); } return Buffer.concat(chunks).toString("utf8"); }
function createServerInstance() { return createServer(async (req, res) => { try { const handoff = readHandoff(); if (req.method === "GET" && req.url === "/") return send(res, 200, readFileSync(resolve(__dirname, "live-governance-hold-queue-wallet-handoff.html"), "utf8"), "text/html; charset=utf-8"); if (req.method === "GET" && req.url === "/app.js") return send(res, 200, readFileSync(resolve(__dirname, "live-governance-hold-queue-wallet-handoff.js"), "utf8"), "text/javascript; charset=utf-8"); if (req.method === "GET" && req.url === "/styles.css") return send(res, 200, readFileSync(resolve(__dirname, "evidence-anchor-wallet-handoff.css"), "utf8"), "text/css; charset=utf-8"); if (req.method === "GET" && req.url === "/health") return send(res, 200, JSON.stringify({ status: "PASS", artifactHash: handoff.artifactHash, proposalId: handoff.lineage.proposalId, attemptNumber: 3, chainId: 102031, value: "0x0", assetExecutionAuthorized: false }), "application/json; charset=utf-8"); if (req.method === "GET" && req.url === "/handoff") return send(res, 200, JSON.stringify({ handoff, submission: existsSync(SUBMISSION_PATH) ? JSON.parse(readFileSync(SUBMISSION_PATH, "utf8")) : null }), "application/json; charset=utf-8"); if (req.method === "POST" && req.url === "/submission") return send(res, 201, JSON.stringify(recordSubmission(JSON.parse(await body(req)), handoff)), "application/json; charset=utf-8"); return send(res, 404, "Not found"); } catch (error) { return send(res, 400, JSON.stringify({ error: error.message }), "application/json; charset=utf-8"); } }); }
if (require.main === module) { readHandoff(); createServerInstance().listen(PORT, HOST, () => console.log(`AEOS Decision-bound HOLD Queue handoff: http://${HOST}:${PORT}`)); }
module.exports = { createServerInstance, readHandoff, recordSubmission };
