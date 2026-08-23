const { createServer } = require("node:http");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");

const HOST = "127.0.0.1";
const PORT = Number(process.env.AEOS_WALLET_HANDOFF_PORT || 4182);
const HANDOFF_PATH = resolve(process.env.AEOS_WALLET_HANDOFF_PATH || resolve(__dirname, "../reports/live-demo/step-9-evidence-anchor-request.json"));
const SUBMISSION_PATH = resolve(process.env.AEOS_WALLET_SUBMISSION_PATH || resolve(__dirname, "../reports/live-demo/step-10-wallet-submission.json"));
const EXPECTED_CHAIN_ID = 102031;
const EXPECTED_ASC = "0x5de85313c5622e3707c3fed8932f51e5991e62c2";

function readHandoff() {
  const value = JSON.parse(readFileSync(HANDOFF_PATH, "utf8"));
  const tx = value.unsignedTransaction;
  if (value.schemaVersion !== "aeos.live-attestcoin-step.v1" || value.step !== 9 || value.status !== "ANCHOR_REQUEST_PREPARED") throw new Error("Unsupported Step 9 Evidence Anchor handoff");
  if (value.controls?.signed || value.controls?.submitted || value.controls?.signerCustody || value.controls?.broadcastCapability || value.controls?.assetExecutionAuthorized !== false) throw new Error("Step 9 authority boundary invalid");
  if (tx?.chainId !== EXPECTED_CHAIN_ID || tx?.to?.toLowerCase() !== EXPECTED_ASC || tx?.value !== "0x0" || !/^0x[0-9a-f]+$/i.test(tx?.data || "") || !/^0x[0-9a-f]{64}$/i.test(tx?.dataHash || "")) throw new Error("Step 9 anchor transaction invalid");
  return value;
}

function recordSubmission(payload, handoff) {
  const tx = handoff.unsignedTransaction;
  if (!/^0x[0-9a-fA-F]{64}$/.test(payload.transactionHash || "")) throw new Error("Invalid transaction hash");
  if ((payload.from || "").toLowerCase() !== tx.from.toLowerCase()) throw new Error("Submission wallet mismatch");
  const record = {
    schemaVersion: "aeos.live-attestcoin-step.v1",
    step: 10,
    status: "ANCHOR_WALLET_SUBMITTED",
    recordedAt: new Date().toISOString(),
    chainId: tx.chainId,
    from: tx.from,
    to: tx.to,
    value: tx.value,
    transactionHash: payload.transactionHash.toLowerCase(),
    step9ArtifactHash: handoff.artifactHash,
    handoffId: handoff.handoff.id,
    commitmentId: handoff.handoff.commitmentId,
    calldataHash: tx.dataHash,
    walletConfirmed: true,
    receiptVerified: false,
    evidenceAnchoredEventObserved: false,
    privateKeyReceived: false,
    signerCustody: false,
    broadcastCapability: false,
    assetExecutionAuthorized: false,
  };
  mkdirSync(dirname(SUBMISSION_PATH), { recursive: true });
  if (existsSync(SUBMISSION_PATH)) {
    const existing = JSON.parse(readFileSync(SUBMISSION_PATH, "utf8"));
    if (existing.transactionHash !== record.transactionHash || existing.step9ArtifactHash !== record.step9ArtifactHash) throw new Error("Immutable Step 10 submission already exists with different identity");
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
      if (request.method === "GET" && request.url === "/") return send(response, 200, readFileSync(resolve(__dirname, "live-evidence-anchor-wallet-handoff.html"), "utf8"), "text/html; charset=utf-8");
      if (request.method === "GET" && request.url === "/app.js") return send(response, 200, readFileSync(resolve(__dirname, "live-evidence-anchor-wallet-handoff.js"), "utf8"), "text/javascript; charset=utf-8");
      if (request.method === "GET" && request.url === "/styles.css") return send(response, 200, readFileSync(resolve(__dirname, "evidence-anchor-wallet-handoff.css"), "utf8"), "text/css; charset=utf-8");
      if (request.method === "GET" && request.url === "/handoff") return send(response, 200, JSON.stringify(handoff), "application/json; charset=utf-8");
      if (request.method === "POST" && request.url === "/submission") return send(response, 201, JSON.stringify(recordSubmission(JSON.parse(await readBody(request)), handoff)), "application/json; charset=utf-8");
      return send(response, 404, "Not found");
    } catch (error) { return send(response, 400, JSON.stringify({ error: error.message }), "application/json; charset=utf-8"); }
  });
}

if (require.main === module) {
  readHandoff();
  createServerInstance().listen(PORT, HOST, () => console.log(`AEOS Evidence Anchor wallet handoff: http://${HOST}:${PORT}`));
}

module.exports = { createServerInstance, readHandoff, recordSubmission };
