const { createServer } = require("node:http");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");

const HOST = "127.0.0.1";
const PORT = Number(process.env.AEOS_GOVERNANCE_PROPOSAL_HANDOFF_PORT || 4185);
const HANDOFF_PATH = resolve(process.env.AEOS_GOVERNANCE_PROPOSAL_HANDOFF_PATH || resolve(__dirname, "../reports/live-demo/p0-1-governance-hold-proposal-attempt-2.json"));
const SUBMISSION_PATH = resolve(process.env.AEOS_GOVERNANCE_PROPOSAL_SUBMISSION_PATH || resolve(__dirname, "../reports/live-demo/p0-1-governance-proposal-attempt-2-wallet-submission.json"));
const EXPECTED_CHAIN_ID = 102031;
const EXPECTED_FROM = "0x444d510728fb8072351cb5d0e88432e6a8501dfa";
const EXPECTED_GOVERNOR = "0xfe90b087fae789e043514b6ac3dbd7fd2d970268";
const EXPECTED_GUARD = "0x3c0cb960f32e6a222149a664a552ffc23e92c628";

function readHandoff() {
  const value = JSON.parse(readFileSync(HANDOFF_PATH, "utf8"));
  const tx = value.unsignedTransaction;
  if (!["aeos.live-governance-hold-proposal.v1", "aeos.live-governance-hold-proposal.v2"].includes(value.schemaVersion) || value.status !== "PROPOSAL_REQUEST_PREPARED") throw new Error("Unsupported live governance Proposal handoff");
  if (value.lineage?.decisionReviewOutcome !== "APPROVED" || value.proposal?.proposalType !== "SECURITY_HOLD" || value.proposal?.semanticConsistencyVerified !== true) throw new Error("Governance Proposal lineage or semantics invalid");
  if (value.truthBoundary?.decisionRecommendation !== "HOLD" || value.truthBoundary?.guardAlreadyPaused !== true || value.truthBoundary?.proposedEffect !== "MAINTAIN_PAUSE" || value.truthBoundary?.treasuryAssetMovement !== false || value.truthBoundary?.onchainProposalCreated !== false) throw new Error("Governance Proposal truth boundary invalid");
  if (value.simulation?.callSucceeded !== true || value.simulation?.assetDelta !== "NONE" || value.simulation?.assetExecutionAuthorized !== false) throw new Error("Governance Proposal simulation invalid");
  if (value.contracts?.treasuryGuard?.toLowerCase() !== EXPECTED_GUARD || value.proposal?.action?.target?.toLowerCase() !== EXPECTED_GUARD || value.proposal?.action?.paused !== true || value.proposal?.action?.value !== "0") throw new Error("Governance HOLD action invalid");
  if (value.controls?.signed || value.controls?.submitted || value.controls?.signerCustody || value.controls?.broadcastCapability || value.controls?.assetExecutionAuthorized !== false) throw new Error("Governance Proposal authority boundary invalid");
  if (tx?.chainId !== EXPECTED_CHAIN_ID || tx?.from?.toLowerCase() !== EXPECTED_FROM || tx?.to?.toLowerCase() !== EXPECTED_GOVERNOR || tx?.value !== "0x0" || !/^0x[0-9a-f]+$/i.test(tx?.data || "") || !/^0x[0-9a-f]{64}$/i.test(tx?.dataHash || "")) throw new Error("Governance Proposal transaction invalid");
  if (value.schemaVersion === "aeos.live-governance-hold-proposal.v2") {
    const attempt = value.lineage?.attempt;
    if (attempt?.attemptNumber !== 2 || attempt?.previousStatus !== "PROPOSAL_DEFEATED" || attempt?.previousFailureReason !== "NO_VOTES_BEFORE_DEADLINE" || attempt?.recoveryStatus !== "RECOVERY_EXECUTED" || attempt?.recoveredVotingPeriodBlocks !== 240 || value.safetyReadback?.currentVotingPeriodBlocks !== "240" || !/^0x[0-9a-f]{64}$/i.test(attempt?.attemptIdentity || "")) throw new Error("Governance Proposal retry lineage invalid");
  }
  return value;
}

function recordSubmission(payload, handoff) {
  const tx = handoff.unsignedTransaction;
  if (!/^0x[0-9a-fA-F]{64}$/.test(payload.transactionHash || "")) throw new Error("Invalid transaction hash");
  if ((payload.from || "").toLowerCase() !== tx.from.toLowerCase()) throw new Error("Submission wallet mismatch");
  const record = {
    schemaVersion: handoff.schemaVersion === "aeos.live-governance-hold-proposal.v2" ? "aeos.live-governance-proposal-submission.v2" : "aeos.live-governance-proposal-submission.v1",
    status: "PROPOSAL_WALLET_SUBMITTED",
    recordedAt: new Date().toISOString(),
    chainId: tx.chainId,
    from: tx.from,
    to: tx.to,
    value: tx.value,
    transactionHash: payload.transactionHash.toLowerCase(),
    proposalId: handoff.proposal.proposalId,
    proposalIdHex: handoff.proposal.proposalIdHex,
    proposalArtifactHash: handoff.artifactHash,
    decisionId: handoff.lineage.decisionId,
    decisionOutputHash: handoff.lineage.decisionOutputHash,
    calldataHash: tx.dataHash,
    ...(handoff.lineage.attempt ? {
      attemptNumber: handoff.lineage.attempt.attemptNumber,
      attemptIdentity: handoff.lineage.attempt.attemptIdentity,
      previousProposalId: handoff.lineage.attempt.previousProposalId,
      recoveryTransactionHash: handoff.lineage.attempt.recoveryTransactionHash,
    } : {}),
    walletConfirmed: true,
    receiptVerified: false,
    proposalCreatedEventObserved: false,
    privateKeyReceived: false,
    signerCustody: false,
    broadcastCapability: false,
    assetExecutionAuthorized: false,
  };
  mkdirSync(dirname(SUBMISSION_PATH), { recursive: true });
  if (existsSync(SUBMISSION_PATH)) {
    const existing = JSON.parse(readFileSync(SUBMISSION_PATH, "utf8"));
    if (existing.transactionHash !== record.transactionHash || existing.proposalArtifactHash !== record.proposalArtifactHash) throw new Error("Immutable Proposal submission already exists with different identity");
    return existing;
  }
  writeFileSync(SUBMISSION_PATH, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  return record;
}

function send(response, status, body, type = "text/plain; charset=utf-8") {
  response.writeHead(status, { "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'", "Content-Type": type, "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" });
  response.end(body);
}

async function readBody(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > 16_384) throw new Error("Request body too large"); chunks.push(chunk); }
  return Buffer.concat(chunks).toString("utf8");
}

function createServerInstance() {
  return createServer(async (request, response) => {
    try {
      const handoff = readHandoff();
      if (request.method === "GET" && request.url === "/") return send(response, 200, readFileSync(resolve(__dirname, "live-governance-proposal-wallet-handoff.html"), "utf8"), "text/html; charset=utf-8");
      if (request.method === "GET" && request.url === "/app.js") return send(response, 200, readFileSync(resolve(__dirname, "live-governance-proposal-wallet-handoff.js"), "utf8"), "text/javascript; charset=utf-8");
      if (request.method === "GET" && request.url === "/styles.css") return send(response, 200, readFileSync(resolve(__dirname, "evidence-anchor-wallet-handoff.css"), "utf8"), "text/css; charset=utf-8");
      if (request.method === "GET" && request.url === "/handoff") return send(response, 200, JSON.stringify(handoff), "application/json; charset=utf-8");
      if (request.method === "POST" && request.url === "/submission") return send(response, 201, JSON.stringify(recordSubmission(JSON.parse(await readBody(request)), handoff)), "application/json; charset=utf-8");
      return send(response, 404, "Not found");
    } catch (error) { return send(response, 400, JSON.stringify({ error: error.message }), "application/json; charset=utf-8"); }
  });
}

if (require.main === module) {
  readHandoff();
  createServerInstance().listen(PORT, HOST, () => console.log(`AEOS live governance Proposal wallet handoff: http://${HOST}:${PORT}`));
}

module.exports = { createServerInstance, readHandoff, recordSubmission };
