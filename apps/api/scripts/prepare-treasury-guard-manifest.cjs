const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { buildTreasuryGuardDeploymentManifest, buildTreasuryGuardDeploymentPlan } = require("../dist/deployment-engine");

function required(name) { const value=process.env[name]; if(!value) throw new Error(`${name} is required`); return value; }
const artifactPath=resolve(process.env.TREASURY_GUARD_ARTIFACT_PATH||resolve(__dirname,"../../../contracts/out/TreasuryGuard.sol/TreasuryGuard.json"));
const artifact=JSON.parse(readFileSync(artifactPath,"utf8"));
const plan=buildTreasuryGuardDeploymentPlan({chainId:Number(required("TREASURY_GUARD_DEPLOY_CHAIN_ID")),governance:required("TREASURY_GUARD_GOVERNANCE_ADDRESS"),guardian:required("TREASURY_GUARD_GUARDIAN_ADDRESS"),policyRegistry:required("POLICY_REGISTRY_ADDRESS"),creationBytecode:artifact.bytecode?.object,runtimeBytecode:artifact.deployedBytecode?.object,artifactCompiler:artifact.metadata?.compiler?.version||"unknown",artifactSource:"contracts/src/TreasuryGuard.sol"});
const deployment=buildTreasuryGuardDeploymentManifest(plan);
console.log(JSON.stringify({planHash:plan.planHash,...deployment},null,2));
