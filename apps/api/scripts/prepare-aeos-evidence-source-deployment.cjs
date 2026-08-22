const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { buildAEOSEvidenceSourceDeploymentPlan, AEOS_EVIDENCE_SOURCE_CHAIN_ID } = require("../dist/deployment-engine");

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const artifactPath = resolve(
  process.env.AEOS_EVIDENCE_SOURCE_ARTIFACT_PATH
    || resolve(__dirname, "../../../contracts/out/AEOSTreasuryEvidenceSource.sol/AEOSTreasuryEvidenceSource.json"),
);
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
const plan = buildAEOSEvidenceSourceDeploymentPlan({
  chainId: Number(process.env.AEOS_EVIDENCE_SOURCE_DEPLOY_CHAIN_ID ?? AEOS_EVIDENCE_SOURCE_CHAIN_ID),
  reporter: required("AEOS_EVIDENCE_SOURCE_REPORTER_ADDRESS"),
  creationBytecode: artifact.bytecode?.object,
  runtimeBytecode: artifact.deployedBytecode?.object,
  artifactCompiler: artifact.metadata?.compiler?.version || "unknown",
  artifactSource: "contracts/src/AEOSTreasuryEvidenceSource.sol",
});
console.log(JSON.stringify(
  process.env.AEOS_EVIDENCE_SOURCE_PLAN_SUMMARY_ONLY === "1"
    ? {
      chainId: plan.chainId,
      planHash: plan.planHash,
      initCodeHash: plan.unsignedTransaction.initCodeHash,
      reporter: plan.constructor.reporter,
      signed: plan.signed,
      submitted: plan.submitted,
      assetExecutionAuthorized: plan.assetExecutionAuthorized,
    }
    : plan,
  null,
  2,
));
