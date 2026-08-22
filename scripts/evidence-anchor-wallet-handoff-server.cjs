const { createServer } = require("node:http");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");

const HOST = "127.0.0.1";
const PORT = Number(process.env.AEOS_WALLET_HANDOFF_PORT || 4177);
const HANDOFF_PATH = resolve(
  process.env.AEOS_WALLET_HANDOFF_PATH || process.env.EVIDENCE_ANCHOR_HANDOFF_PATH ||
    resolve(__dirname, "../reports/deployment/evidence-anchor-wallet-handoff.json"),
);
const SUBMISSION_PATH = resolve(
  process.env.AEOS_WALLET_SUBMISSION_PATH || process.env.EVIDENCE_ANCHOR_SUBMISSION_PATH ||
    resolve(__dirname, "../reports/deployment/evidence-anchor-wallet-submission.json"),
);

function readHandoff() {
  const value = JSON.parse(readFileSync(HANDOFF_PATH, "utf8"));
  if (!["evidence-anchor.wallet-deployment-handoff.v1", "aeos-evidence-source.wallet-deployment-handoff.v1"].includes(value.schemaVersion)) {
    throw new Error("Unsupported wallet handoff schema");
  }
  if (value.confirmation?.submitted || value.confirmation?.signed) {
    throw new Error("Wallet handoff must be unsigned and unsubmitted");
  }
  if (value.plan?.unsignedTransaction?.to !== null || value.plan?.unsignedTransaction?.value !== "0") {
    throw new Error("Wallet handoff is not a zero-value contract creation");
  }
  return value;
}

function send(response, status, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self'; connect-src 'self' https://rpc.cc3-testnet.creditcoin.network; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'",
    "Content-Type": contentType,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function recordSubmission(payload, handoff) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(payload.transactionHash || "")) {
    throw new Error("Invalid transaction hash");
  }
  if ((payload.from || "").toLowerCase() !== handoff.deployer.toLowerCase()) {
    throw new Error("Submission wallet mismatch");
  }
  const record = {
    schemaVersion: handoff.schemaVersion === "aeos-evidence-source.wallet-deployment-handoff.v1" ? "aeos-evidence-source.wallet-submission.v1" : "evidence-anchor.wallet-submission.v1",
    recordedAt: new Date().toISOString(),
    chainId: handoff.chain.chainId,
    from: handoff.deployer,
    transactionHash: payload.transactionHash,
    predictedContractAddress: handoff.predictedContractAddress,
    planHash: handoff.plan.planHash,
    initCodeHash: handoff.plan.unsignedTransaction.initCodeHash,
    walletConfirmed: true,
    privateKeyReceived: false,
  };
  mkdirSync(dirname(SUBMISSION_PATH), { recursive: true });
  if (existsSync(SUBMISSION_PATH)) {
    const existing = JSON.parse(readFileSync(SUBMISSION_PATH, "utf8"));
    if (existing.transactionHash !== record.transactionHash) {
      throw new Error("Immutable submission record already exists with a different transaction hash");
    }
    return existing;
  }
  writeFileSync(SUBMISSION_PATH, `${JSON.stringify(record, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  return record;
}

function createWalletHandoffServer() {
  return createServer(async (request, response) => {
    try {
      const handoff = readHandoff();
      if (request.method === "GET" && request.url === "/") {
        return send(response, 200, readFileSync(resolve(__dirname, "evidence-anchor-wallet-handoff.html"), "utf8"), "text/html; charset=utf-8");
      }
      if (request.method === "GET" && request.url === "/app.js") {
        return send(response, 200, readFileSync(resolve(__dirname, "evidence-anchor-wallet-handoff.js"), "utf8"), "text/javascript; charset=utf-8");
      }
      if (request.method === "GET" && request.url === "/styles.css") {
        return send(response, 200, readFileSync(resolve(__dirname, "evidence-anchor-wallet-handoff.css"), "utf8"), "text/css; charset=utf-8");
      }
      if (request.method === "GET" && request.url === "/handoff") {
        return send(response, 200, JSON.stringify(handoff), "application/json; charset=utf-8");
      }
      if (request.method === "POST" && request.url === "/submission") {
        const record = recordSubmission(JSON.parse(await readBody(request)), handoff);
        return send(response, 201, JSON.stringify(record), "application/json; charset=utf-8");
      }
      return send(response, 404, "Not found");
    } catch (error) {
      return send(response, 400, JSON.stringify({ error: error.message }), "application/json; charset=utf-8");
    }
  });
}

if (require.main === module) {
  readHandoff();
  const server = createWalletHandoffServer();
  server.listen(PORT, HOST, () => {
    console.log(`AEOS deterministic wallet handoff: http://${HOST}:${PORT}`);
    console.log("The server cannot sign or broadcast without an explicit wallet action in the page.");
  });
}

module.exports = { createWalletHandoffServer, readHandoff, recordSubmission };
