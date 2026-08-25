const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { buildBalanceObserverDeploymentPlan, BALANCE_OBSERVER_CHAIN_ID } = require("../dist/balance-observer-engine");

function required(name) { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; }
const artifactPath = resolve(process.env.AEOS_BALANCE_OBSERVER_ARTIFACT_PATH || resolve(__dirname, "../../../contracts/out/AEOSBalanceObserver.sol/AEOSBalanceObserver.json"));
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
const plan = buildBalanceObserverDeploymentPlan({
  chainId: Number(process.env.AEOS_BALANCE_OBSERVER_CHAIN_ID || BALANCE_OBSERVER_CHAIN_ID),
  reporter: required("AEOS_BALANCE_OBSERVER_REPORTER_ADDRESS"),
  creationBytecode: artifact.bytecode?.object,
  runtimeBytecode: artifact.deployedBytecode?.object,
  artifactCompiler: artifact.metadata?.compiler?.version || "unknown",
  artifactSource: "contracts/src/AEOSBalanceObserver.sol",
});
console.log(JSON.stringify(process.env.AEOS_BALANCE_OBSERVER_PLAN_SUMMARY_ONLY === "1" ? {
  chainId: plan.chainId, planHash: plan.planHash, initCodeHash: plan.unsignedTransaction.initCodeHash,
  reporter: plan.constructor.reporter, signed: plan.signed, submitted: plan.submitted,
  assetExecutionAuthorized: plan.assetExecutionAuthorized,
} : plan, null, 2));
