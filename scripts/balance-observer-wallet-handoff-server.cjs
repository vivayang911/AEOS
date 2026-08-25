const { createServer } = require("node:http");
const { createHash } = require("node:crypto");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");
const { AbiCoder, concat, keccak256, zeroPadValue } = require("ethers");

const HOST = "127.0.0.1";
const PORT = Number(process.env.AEOS_BALANCE_OBSERVER_WALLET_PORT || 4191);
const PLAN_PATH = resolve(process.env.AEOS_BALANCE_OBSERVER_WALLET_PLAN_PATH || resolve(__dirname, "../reports/deployment/balance-observer-wallet-plan.json"));
const SUBMISSION_DIRECTORY = resolve(process.env.AEOS_BALANCE_OBSERVER_SUBMISSION_DIRECTORY || resolve(__dirname, "../reports/deployment/balance-observer-wallet-submissions"));
const ARTIFACT_PATH = resolve(process.env.AEOS_BALANCE_OBSERVER_ARTIFACT_PATH || resolve(__dirname, "../contracts/out/AEOSBalanceObserver.sol/AEOSBalanceObserver.json"));
const EXPECTED_CHAIN_ID = 11155111;

const hash = (value) => /^0x[0-9a-f]{64}$/i.test(value || "");
const address = (value) => /^0x[0-9a-f]{40}$/i.test(value || "") && !/^0x0{40}$/i.test(value);
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}` : JSON.stringify(value);
const sha256 = (value) => `0x${createHash("sha256").update(canonical(value)).digest("hex")}`;
const requestIdentity = (tx) => ({ sequence: tx.sequence, nonce: tx.nonce, to: tx.to, value: tx.value, data: tx.data });
function computePlanHash(plan) { const { generatedAt, planHash, ...frozen } = plan; return sha256(frozen); }
function deriveRuntimeIdentity(plan) {
  const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));
  const creationBytecode = artifact.bytecode?.object;
  const runtimeTemplate = artifact.deployedBytecode?.object;
  if (!/^0x[0-9a-f]+$/i.test(creationBytecode || "") || !/^0x[0-9a-f]+$/i.test(runtimeTemplate || "")) throw new Error("Balance Observer compiler artifact invalid");
  const expectedInitCode = concat([creationBytecode, AbiCoder.defaultAbiCoder().encode(["address"], [plan.reporter])]);
  if (expectedInitCode.toLowerCase() !== plan.transactions[0].data.toLowerCase()) throw new Error("Balance Observer artifact/init-code mismatch");
  const templateHash = keccak256(runtimeTemplate);
  const frozenTemplateHash = (plan.observer.runtimeBytecodeTemplateHash || plan.observer.runtimeBytecodeHash || "").toLowerCase();
  if (templateHash.toLowerCase() !== frozenTemplateHash) throw new Error("Balance Observer runtime template mismatch");
  const replacement = zeroPadValue(plan.reporter, 32).slice(2);
  let body = runtimeTemplate.slice(2);
  const references = Object.values(artifact.deployedBytecode?.immutableReferences || {}).flat();
  if (references.length === 0) throw new Error("Balance Observer reporter immutable references missing");
  for (const reference of references) {
    if (!Number.isSafeInteger(reference.start) || reference.start < 0 || reference.length !== 32 || (reference.start + reference.length) * 2 > body.length) throw new Error("Balance Observer reporter immutable reference invalid");
    body = `${body.slice(0, reference.start * 2)}${replacement}${body.slice((reference.start + reference.length) * 2)}`;
  }
  return { templateHash, runtimeBytecodeHash: keccak256(`0x${body}`), immutableReferenceCount: references.length };
}

function validatePlan(plan) {
  if (plan?.schemaVersion !== "aeos-balance-observer.wallet-plan.v1" || plan.chainId !== EXPECTED_CHAIN_ID) throw new Error("Unsupported Balance Observer wallet plan");
  if (!hash(plan.planHash) || !address(plan.reporter) || plan.account?.toLowerCase() !== plan.reporter.toLowerCase()) throw new Error("Balance Observer plan identity invalid");
  if (computePlanHash(plan) !== plan.planHash) throw new Error("Balance Observer plan hash mismatch");
  if (plan.authority?.requiresTwoSeparateUserConfirmations !== true || plan.authority?.automaticContinuation !== false || plan.authority?.privateKeyReceived || plan.authority?.signerCustody || plan.authority?.aeosSigningCapability || plan.authority?.aeosBroadcastCapability || plan.authority?.assetExecutionAuthorized) throw new Error("Balance Observer authority boundary invalid");
  if (!address(plan.observer?.predictedAddress) || !hash(plan.observer?.runtimeBytecodeHash) || !address(plan.token?.address) || !hash(plan.token?.runtimeCodeHash)) throw new Error("Balance Observer contract/token identity invalid");
  if (plan.tenantBinding?.rawTenantIdentifiersDisclosed !== false || !hash(plan.tenantBinding?.organizationCommitment) || !hash(plan.tenantBinding?.treasuryCommitment)) throw new Error("Balance Observer tenant commitment invalid");
  if (!Array.isArray(plan.transactions) || plan.transactions.length !== 2) throw new Error("Balance Observer plan must contain exactly two transactions");
  plan.transactions.forEach((tx, index) => {
    if (tx.sequence !== index + 1 || tx.nonce !== plan.observedPendingNonce + index || tx.value !== "0x0" || !/^0x[0-9a-f]+$/i.test(tx.data || "") || !hash(tx.dataHash) || !hash(tx.requestHash) || tx.requiresUserWalletConfirmation !== true || tx.signed || tx.submitted) throw new Error("Balance Observer transaction sequence invalid");
    if (keccak256(tx.data).toLowerCase() !== tx.dataHash.toLowerCase() || sha256(requestIdentity(tx)) !== tx.requestHash) throw new Error("Balance Observer transaction hash mismatch");
  });
  const [deployment, observation] = plan.transactions;
  if (deployment.operation !== "DEPLOY_AEOS_BALANCE_OBSERVER" || deployment.to !== null || deployment.predictedAddress?.toLowerCase() !== plan.observer.predictedAddress.toLowerCase() || deployment.expectedRuntimeBytecodeHash?.toLowerCase() !== plan.observer.runtimeBytecodeHash.toLowerCase() || deployment.initCodeHash?.toLowerCase() !== deployment.dataHash.toLowerCase()) throw new Error("Balance Observer deployment request invalid");
  if (observation.operation !== "OBSERVE_SEPOLIA_USDC_BALANCE" || observation.to?.toLowerCase() !== plan.observer.predictedAddress.toLowerCase() || observation.token?.toLowerCase() !== plan.token.address.toLowerCase() || observation.account?.toLowerCase() !== plan.account.toLowerCase() || observation.tokenCodeHash?.toLowerCase() !== plan.token.runtimeCodeHash.toLowerCase() || observation.organizationCommitment?.toLowerCase() !== plan.tenantBinding.organizationCommitment.toLowerCase() || observation.treasuryCommitment?.toLowerCase() !== plan.tenantBinding.treasuryCommitment.toLowerCase() || !hash(observation.observationId) || !hash(observation.observationRequestHash)) throw new Error("Balance Observer observation request invalid");
  return plan;
}

function readPlan() {
  const frozenPlan = validatePlan(JSON.parse(readFileSync(PLAN_PATH, "utf8")));
  const derived = deriveRuntimeIdentity(frozenPlan);
  if (frozenPlan.observer.runtimeBytecodeTemplateHash && frozenPlan.observer.runtimeBytecodeHash.toLowerCase() !== derived.runtimeBytecodeHash.toLowerCase()) throw new Error("Balance Observer expected runtime mismatch");
  return { ...frozenPlan, observer: { ...frozenPlan.observer, runtimeBytecodeTemplateHash: derived.templateHash, runtimeBytecodeHash: derived.runtimeBytecodeHash }, runtimeDerivation: { schemaVersion: "aeos-balance-observer.runtime-derivation.v1", basePlanHash: frozenPlan.planHash, reporter: frozenPlan.reporter, immutableReferenceCount: derived.immutableReferenceCount, runtimeBytecodeTemplateHash: derived.templateHash, runtimeBytecodeHash: derived.runtimeBytecodeHash } };
}
function recordPath(sequence, suffix) { return resolve(SUBMISSION_DIRECTORY, `${String(sequence).padStart(2, "0")}-${suffix}.json`); }
function readProgress(plan) {
  const submissions = plan.transactions.flatMap((tx) => { const path = recordPath(tx.sequence, "submitted"); return existsSync(path) ? [JSON.parse(readFileSync(path, "utf8"))] : []; });
  const receipts = plan.transactions.flatMap((tx) => { const path = recordPath(tx.sequence, "receipt"); return existsSync(path) ? [JSON.parse(readFileSync(path, "utf8"))] : []; });
  return { submissions, receipts };
}
function recordSubmission(payload, plan) {
  const tx = plan.transactions.find((candidate) => candidate.sequence === payload.sequence); if (!tx) throw new Error("Unknown Balance Observer sequence");
  const progress = readProgress(plan);
  if (progress.receipts.length !== tx.sequence - 1 || progress.receipts.some((record, index) => record.sequence !== index + 1 || record.planHash !== plan.planHash)) throw new Error("Earlier wallet receipt must be recorded first");
  if (progress.submissions.some((record) => record.sequence === tx.sequence)) throw new Error("Immutable wallet submission already exists");
  if ((payload.from || "").toLowerCase() !== plan.reporter.toLowerCase() || payload.requestHash !== tx.requestHash || !hash(payload.transactionHash)) throw new Error("Wallet submission identity invalid");
  const record = { schemaVersion: "aeos-balance-observer.wallet-submission.v1", status: "WALLET_SUBMITTED", recordedAt: new Date().toISOString(), planHash: plan.planHash, sequence: tx.sequence, operation: tx.operation, nonce: tx.nonce, chainId: plan.chainId, from: plan.reporter, to: tx.to, value: tx.value, requestHash: tx.requestHash, dataHash: tx.dataHash, transactionHash: payload.transactionHash.toLowerCase(), walletRpcReceiptObserved: false, independentCanonicalFinalityVerified: false, privateKeyReceived: false, signerCustody: false, aeosBroadcastCapability: false, assetExecutionAuthorized: false };
  mkdirSync(dirname(recordPath(tx.sequence, "submitted")), { recursive: true }); writeFileSync(recordPath(tx.sequence, "submitted"), `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 }); return record;
}
function recordReceipt(payload, plan) {
  const tx = plan.transactions.find((candidate) => candidate.sequence === payload.sequence); if (!tx) throw new Error("Unknown Balance Observer sequence");
  const progress = readProgress(plan); const submission = progress.submissions.find((record) => record.sequence === tx.sequence);
  if (!submission || submission.transactionHash !== (payload.transactionHash || "").toLowerCase() || progress.receipts.length !== tx.sequence - 1) throw new Error("Receipt has no matching ordered submission");
  if (payload.receiptStatus !== "0x1" || !hash(payload.blockHash) || !/^0x[0-9a-f]+$/i.test(payload.blockNumber || "")) throw new Error("Successful wallet-RPC receipt required");
  if (tx.to === null && (payload.contractAddress || "").toLowerCase() !== tx.predictedAddress.toLowerCase()) throw new Error("Deployed observer address mismatch");
  if (tx.to !== null && payload.contractAddress) throw new Error("Observation cannot report a created contract");
  const record = { schemaVersion: "aeos-balance-observer.wallet-receipt.v1", status: "WALLET_RPC_RECEIPT_OBSERVED", recordedAt: new Date().toISOString(), planHash: plan.planHash, sequence: tx.sequence, operation: tx.operation, nonce: tx.nonce, requestHash: tx.requestHash, transactionHash: submission.transactionHash, blockNumber: payload.blockNumber, blockHash: payload.blockHash.toLowerCase(), contractAddress: payload.contractAddress?.toLowerCase() || null, walletRpcReceiptObserved: true, independentCanonicalFinalityVerified: false, privateKeyReceived: false, signerCustody: false, aeosBroadcastCapability: false, assetExecutionAuthorized: false };
  writeFileSync(recordPath(tx.sequence, "receipt"), `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 }); return record;
}
function send(response, status, body, type = "text/plain; charset=utf-8") { response.writeHead(status, { "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'", "Content-Type": type, "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" }); response.end(body); }
async function readBody(request) { const chunks = []; let size = 0; for await (const chunk of request) { size += chunk.length; if (size > 16_384) throw new Error("Request body too large"); chunks.push(chunk); } return Buffer.concat(chunks).toString("utf8"); }
function createWalletServer() { return createServer(async (request, response) => { try { const plan = readPlan(); if (request.method === "GET" && request.url === "/") return send(response, 200, readFileSync(resolve(__dirname, "balance-observer-wallet-handoff.html"), "utf8"), "text/html; charset=utf-8"); if (request.method === "GET" && request.url === "/app.js") return send(response, 200, readFileSync(resolve(__dirname, "balance-observer-wallet-handoff.js"), "utf8"), "text/javascript; charset=utf-8"); if (request.method === "GET" && request.url === "/styles.css") return send(response, 200, readFileSync(resolve(__dirname, "balance-observer-wallet-handoff.css"), "utf8"), "text/css; charset=utf-8"); if (request.method === "GET" && request.url === "/plan") return send(response, 200, JSON.stringify(plan), "application/json; charset=utf-8"); if (request.method === "GET" && request.url === "/progress") return send(response, 200, JSON.stringify(readProgress(plan)), "application/json; charset=utf-8"); if (request.method === "POST" && request.url === "/submission") return send(response, 201, JSON.stringify(recordSubmission(JSON.parse(await readBody(request)), plan)), "application/json; charset=utf-8"); if (request.method === "POST" && request.url === "/receipt") return send(response, 201, JSON.stringify(recordReceipt(JSON.parse(await readBody(request)), plan)), "application/json; charset=utf-8"); return send(response, 404, "Not found"); } catch (error) { return send(response, 400, JSON.stringify({ error: error.message }), "application/json; charset=utf-8"); } }); }
if (require.main === module) { readPlan(); createWalletServer().listen(PORT, HOST, () => console.log(`AEOS Balance Observer wallet handoff: http://${HOST}:${PORT}`)); }
module.exports = { computePlanHash, createWalletServer, readPlan, readProgress, recordReceipt, recordSubmission, sha256, validatePlan };
