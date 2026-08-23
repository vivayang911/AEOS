const { createServer } = require("node:http");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");

const HOST = "127.0.0.1";
const PORT = Number(process.env.AEOS_GOVERNANCE_WALLET_PORT || 4183);
const PLAN_PATH = resolve(process.env.GOVERNANCE_STACK_PLAN_PATH || resolve(__dirname, "../reports/deployment/governance-stack-deployment-plan.json"));
const SUBMISSION_DIRECTORY = resolve(process.env.GOVERNANCE_STACK_SUBMISSION_DIRECTORY || resolve(__dirname, "../reports/deployment/governance-stack-submissions"));
const EXPECTED_CHAIN_ID = 102031;

function transactions(plan) {
  return [...plan.deploymentTransactions, ...plan.roleTransactions];
}

function validatePlan(plan) {
  if (plan?.schemaVersion !== "aeos.governance-stack.deployment-plan.v1" || plan.chainId !== EXPECTED_CHAIN_ID) throw new Error("Unsupported governance deployment plan");
  if (plan.signed || plan.submitted || plan.containsPrivateKey || plan.aeosSigningCapability || plan.aeosBroadcastCapability || plan.assetExecutionAuthorized) throw new Error("Governance deployment authority boundary invalid");
  if (!/^0x[0-9a-f]{64}$/i.test(plan.planHash || "") || !/^0x[0-9a-f]{40}$/i.test(plan.deployer || "")) throw new Error("Governance deployment identity invalid");
  const all = transactions(plan);
  if (all.length !== 8 || plan.deploymentTransactions.length !== 5 || plan.roleTransactions.length !== 3) throw new Error("Governance deployment must contain exactly eight sequential requests");
  all.forEach((tx, index) => {
    if (tx.sequence !== index + 1 || tx.nonce !== plan.observedPendingNonce + index || tx.value !== "0x0") throw new Error("Governance deployment nonce/value sequence invalid");
    if (!/^0x[0-9a-f]+$/i.test(tx.data || "") || !/^0x[0-9a-f]{64}$/i.test(tx.dataHash || "") || !/^0x[0-9a-f]{64}$/i.test(tx.requestHash || "")) throw new Error("Governance deployment request hash invalid");
    if (index < 5 && (tx.to !== null || !/^0x[0-9a-f]{40}$/i.test(tx.predictedAddress || "") || !/^0x[0-9a-f]{64}$/i.test(tx.initCodeHash || ""))) throw new Error("Contract-creation request invalid");
    if (index >= 5 && tx.to?.toLowerCase() !== plan.addresses.timelock?.toLowerCase()) throw new Error("Role request target invalid");
    if (tx.signed || tx.submitted || tx.requiresUserWalletConfirmation !== true) throw new Error("Governance request authority marker invalid");
  });
  return plan;
}

function readPlan() {
  return validatePlan(JSON.parse(readFileSync(PLAN_PATH, "utf8")));
}

function recordPath(sequence, suffix) {
  return resolve(SUBMISSION_DIRECTORY, `${String(sequence).padStart(2, "0")}-${suffix}.json`);
}

function readProgress(plan) {
  const all = transactions(plan);
  const submissions = all.flatMap((tx) => {
    const path = recordPath(tx.sequence, "submitted");
    return existsSync(path) ? [JSON.parse(readFileSync(path, "utf8"))] : [];
  });
  const receipts = all.flatMap((tx) => {
    const path = recordPath(tx.sequence, "receipt");
    return existsSync(path) ? [JSON.parse(readFileSync(path, "utf8"))] : [];
  });
  return { submissions, receipts };
}

function recordSubmission(payload, plan) {
  const all = transactions(plan);
  const tx = all.find((candidate) => candidate.sequence === payload.sequence);
  if (!tx) throw new Error("Unknown governance deployment sequence");
  const progress = readProgress(plan);
  if (progress.receipts.length !== tx.sequence - 1 || progress.receipts.some((record, index) => record.sequence !== index + 1 || record.planHash !== plan.planHash)) throw new Error("Earlier governance transaction receipts must be recorded first");
  if (progress.submissions.some((record) => record.sequence === tx.sequence)) throw new Error("Immutable wallet submission already exists");
  if ((payload.from || "").toLowerCase() !== plan.deployer.toLowerCase() || payload.requestHash !== tx.requestHash) throw new Error("Governance submission identity mismatch");
  if (!/^0x[0-9a-f]{64}$/i.test(payload.transactionHash || "")) throw new Error("Valid wallet transaction hash is required");
  const record = {
    schemaVersion: "aeos.governance-stack.wallet-submission.v1",
    status: "WALLET_SUBMITTED",
    recordedAt: new Date().toISOString(),
    planHash: plan.planHash,
    sequence: tx.sequence,
    nonce: tx.nonce,
    operation: tx.contract || tx.operation,
    chainId: plan.chainId,
    from: plan.deployer,
    to: tx.to,
    value: tx.value,
    requestHash: tx.requestHash,
    dataHash: tx.dataHash,
    transactionHash: payload.transactionHash.toLowerCase(),
    walletRpcReceiptObserved: false,
    independentCanonicalFinalityVerified: false,
    privateKeyReceived: false,
    signerCustody: false,
    aeosBroadcastCapability: false,
    assetExecutionAuthorized: false,
  };
  mkdirSync(dirname(recordPath(tx.sequence, "submitted")), { recursive: true });
  writeFileSync(recordPath(tx.sequence, "submitted"), `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  return record;
}

function recordReceipt(payload, plan) {
  const tx = transactions(plan).find((candidate) => candidate.sequence === payload.sequence);
  if (!tx) throw new Error("Unknown governance deployment sequence");
  const progress = readProgress(plan);
  const submission = progress.submissions.find((record) => record.sequence === tx.sequence);
  if (!submission || submission.transactionHash !== (payload.transactionHash || "").toLowerCase()) throw new Error("Receipt has no matching immutable wallet submission");
  if (progress.receipts.length !== tx.sequence - 1) throw new Error("Earlier governance receipts must be recorded first");
  if (payload.receiptStatus !== "0x1" || !/^0x[0-9a-f]{64}$/i.test(payload.blockHash || "") || !/^0x[0-9a-f]+$/i.test(payload.blockNumber || "")) throw new Error("Successful wallet-RPC receipt is required");
  if (tx.to === null && (payload.contractAddress || "").toLowerCase() !== tx.predictedAddress.toLowerCase()) throw new Error("Deployed contract address mismatch");
  if (tx.to !== null && payload.contractAddress) throw new Error("Role transaction cannot report a contract address");
  const record = {
    schemaVersion: "aeos.governance-stack.wallet-receipt.v1",
    status: "WALLET_RPC_RECEIPT_OBSERVED",
    recordedAt: new Date().toISOString(),
    planHash: plan.planHash,
    sequence: tx.sequence,
    nonce: tx.nonce,
    requestHash: tx.requestHash,
    transactionHash: submission.transactionHash,
    blockNumber: payload.blockNumber,
    blockHash: payload.blockHash.toLowerCase(),
    contractAddress: payload.contractAddress?.toLowerCase() || null,
    walletRpcReceiptObserved: true,
    independentCanonicalFinalityVerified: false,
    privateKeyReceived: false,
    signerCustody: false,
    aeosBroadcastCapability: false,
    assetExecutionAuthorized: false,
  };
  writeFileSync(recordPath(tx.sequence, "receipt"), `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  return record;
}

function send(response, status, body, type = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'",
    "Content-Type": type,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

async function readBody(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > 16_384) throw new Error("Request body too large"); chunks.push(chunk); }
  return Buffer.concat(chunks).toString("utf8");
}

function createWalletServer() {
  return createServer(async (request, response) => {
    try {
      const plan = readPlan();
      if (request.method === "GET" && request.url === "/") return send(response, 200, readFileSync(resolve(__dirname, "governance-stack-wallet-handoff.html"), "utf8"), "text/html; charset=utf-8");
      if (request.method === "GET" && request.url === "/app.js") return send(response, 200, readFileSync(resolve(__dirname, "governance-stack-wallet-handoff.js"), "utf8"), "text/javascript; charset=utf-8");
      if (request.method === "GET" && request.url === "/styles.css") return send(response, 200, readFileSync(resolve(__dirname, "governance-stack-wallet-handoff.css"), "utf8"), "text/css; charset=utf-8");
      if (request.method === "GET" && request.url === "/plan") return send(response, 200, JSON.stringify(plan), "application/json; charset=utf-8");
      if (request.method === "GET" && request.url === "/progress") return send(response, 200, JSON.stringify(readProgress(plan)), "application/json; charset=utf-8");
      if (request.method === "POST" && request.url === "/submission") return send(response, 201, JSON.stringify(recordSubmission(JSON.parse(await readBody(request)), plan)), "application/json; charset=utf-8");
      if (request.method === "POST" && request.url === "/receipt") return send(response, 201, JSON.stringify(recordReceipt(JSON.parse(await readBody(request)), plan)), "application/json; charset=utf-8");
      return send(response, 404, "Not found");
    } catch (error) { return send(response, 400, JSON.stringify({ error: error.message }), "application/json; charset=utf-8"); }
  });
}

if (require.main === module) {
  readPlan();
  createWalletServer().listen(PORT, HOST, () => console.log(`AEOS governance wallet handoff: http://${HOST}:${PORT}`));
}

module.exports = { createWalletServer, readPlan, readProgress, recordReceipt, recordSubmission, validatePlan };
