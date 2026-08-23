const { createServer } = require("node:http");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");

const HOST = "127.0.0.1";
const PORT = Number(process.env.AEOS_GOVERNANCE_RECOVERY_HANDOFF_PORT || 4186);
const HANDOFF_PATH = resolve(process.env.AEOS_GOVERNANCE_RECOVERY_HANDOFF_PATH || resolve(__dirname, "../reports/live-demo/p0-1-governance-voting-period-recovery.json"));
const PROPOSAL_SUBMISSION_PATH = resolve(process.env.AEOS_GOVERNANCE_RECOVERY_PROPOSAL_SUBMISSION_PATH || resolve(__dirname, "../reports/live-demo/p0-1-governance-recovery-proposal-submission.json"));
const VOTE_SUBMISSION_PATH = resolve(process.env.AEOS_GOVERNANCE_RECOVERY_VOTE_SUBMISSION_PATH || resolve(__dirname, "../reports/live-demo/p0-1-governance-recovery-vote-submission.json"));

function readHandoff() {
  const value = JSON.parse(readFileSync(HANDOFF_PATH, "utf8"));
  if (value.schemaVersion !== "aeos.live-governance-voting-period-recovery.v1" || value.status !== "RECOVERY_PROPOSAL_PREPARED") throw new Error("Unsupported governance recovery handoff");
  if (value.failedProposal?.state !== "Defeated" || value.failedProposal?.failureReason !== "NO_VOTES_BEFORE_DEADLINE" || value.failedProposal?.totalVotes !== "0") throw new Error("Recovery failure lineage invalid");
  if (value.votingCapacity?.singleWalletMeetsQuorum !== true || value.votingCapacity?.additionalVotingAddressesRequired !== false || BigInt(value.votingCapacity.voterVotes) < BigInt(value.votingCapacity.quorumVotes)) throw new Error("Recovery voting capacity invalid");
  if (value.proposal?.proposalType !== "TESTNET_GOVERNANCE_SETTINGS_RECOVERY" || value.proposal?.action?.function !== "setVotingPeriod(uint32)" || value.proposal?.action?.previousVotingPeriodBlocks !== 8 || value.proposal?.action?.newVotingPeriodBlocks !== 240) throw new Error("Recovery action invalid");
  if (value.controls?.testnetDemoOnly !== true || value.controls?.requiresTwoSeparateWalletConfirmations !== true || value.controls?.signed || value.controls?.submitted || value.controls?.voteSubmitted || value.controls?.broadcastCapability || value.controls?.assetExecutionAuthorized !== false) throw new Error("Recovery authority boundary invalid");
  const requests = value.unsignedRequests;
  for (const request of [requests?.propose, requests?.voteFor]) {
    if (request?.chainId !== 102031 || request?.from?.toLowerCase() !== "0x444d510728fb8072351cb5d0e88432e6a8501dfa" || request?.to?.toLowerCase() !== "0xfe90b087fae789e043514b6ac3dbd7fd2d970268" || request?.value !== "0x0" || !/^0x[0-9a-f]+$/i.test(request?.data || "") || !/^0x[0-9a-f]{64}$/i.test(request?.dataHash || "")) throw new Error("Recovery unsigned request invalid");
  }
  if (requests.voteFor.support !== 1 || requests.voteFor.validOnlyWhenProposalState !== "Active") throw new Error("Recovery vote request invalid");
  return value;
}

function readOptional(path) { return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null; }

function recordSubmission(payload, handoff) {
  const stage = payload.stage;
  if (stage !== "PROPOSE" && stage !== "VOTE_FOR") throw new Error("Invalid recovery stage");
  const request = stage === "PROPOSE" ? handoff.unsignedRequests.propose : handoff.unsignedRequests.voteFor;
  const outputPath = stage === "PROPOSE" ? PROPOSAL_SUBMISSION_PATH : VOTE_SUBMISSION_PATH;
  if (!/^0x[0-9a-f]{64}$/i.test(payload.transactionHash || "")) throw new Error("Invalid transaction hash");
  if ((payload.from || "").toLowerCase() !== request.from.toLowerCase()) throw new Error("Submission wallet mismatch");
  if (stage === "VOTE_FOR" && !existsSync(PROPOSAL_SUBMISSION_PATH)) throw new Error("Proposal submission must be recorded before vote");
  const record = {
    schemaVersion: "aeos.live-governance-recovery-wallet-submission.v1",
    status: stage === "PROPOSE" ? "RECOVERY_PROPOSAL_WALLET_SUBMITTED" : "RECOVERY_VOTE_WALLET_SUBMITTED",
    stage,
    recordedAt: new Date().toISOString(),
    chainId: request.chainId,
    from: request.from,
    to: request.to,
    value: request.value,
    transactionHash: payload.transactionHash.toLowerCase(),
    calldataHash: request.dataHash,
    recoveryArtifactHash: handoff.artifactHash,
    proposalId: handoff.proposal.proposalId,
    support: stage === "VOTE_FOR" ? 1 : null,
    walletConfirmed: true,
    receiptVerified: false,
    eventVerified: false,
    privateKeyReceived: false,
    signerCustody: false,
    broadcastCapability: false,
    assetExecutionAuthorized: false,
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  const existing = readOptional(outputPath);
  if (existing) {
    if (existing.transactionHash !== record.transactionHash || existing.recoveryArtifactHash !== record.recoveryArtifactHash) throw new Error("Immutable recovery submission already exists with different identity");
    return existing;
  }
  writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return record;
}

function send(response, status, body, type = "text/plain; charset=utf-8") {
  response.writeHead(status, { "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'", "Content-Type": type, "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" }); response.end(body);
}
async function readBody(request) { const chunks=[];let size=0;for await(const chunk of request){size+=chunk.length;if(size>16384)throw new Error("Request body too large");chunks.push(chunk)}return Buffer.concat(chunks).toString("utf8") }
function createServerInstance() {
  return createServer(async (request, response) => {
    try {
      const handoff = readHandoff();
      if (request.method === "GET" && request.url === "/") return send(response, 200, readFileSync(resolve(__dirname, "live-governance-recovery-wallet-handoff.html"), "utf8"), "text/html; charset=utf-8");
      if (request.method === "GET" && request.url === "/app.js") return send(response, 200, readFileSync(resolve(__dirname, "live-governance-recovery-wallet-handoff.js"), "utf8"), "text/javascript; charset=utf-8");
      if (request.method === "GET" && request.url === "/styles.css") return send(response, 200, readFileSync(resolve(__dirname, "evidence-anchor-wallet-handoff.css"), "utf8"), "text/css; charset=utf-8");
      if (request.method === "GET" && request.url === "/handoff") return send(response, 200, JSON.stringify({ handoff, submissions: { proposal: readOptional(PROPOSAL_SUBMISSION_PATH), vote: readOptional(VOTE_SUBMISSION_PATH) } }), "application/json; charset=utf-8");
      if (request.method === "POST" && request.url === "/submission") return send(response, 201, JSON.stringify(recordSubmission(JSON.parse(await readBody(request)), handoff)), "application/json; charset=utf-8");
      return send(response, 404, "Not found");
    } catch (error) {
      return send(response, 400, JSON.stringify({ error: error.message }), "application/json; charset=utf-8");
    }
  });
}
if(require.main===module){readHandoff();createServerInstance().listen(PORT,HOST,()=>console.log(`AEOS governance recovery wallet handoff: http://${HOST}:${PORT}`))}
module.exports={createServerInstance,readHandoff,recordSubmission};
