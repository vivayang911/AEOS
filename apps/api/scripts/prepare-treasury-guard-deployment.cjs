const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { buildTreasuryGuardDeploymentPlan } = require("../dist/deployment-engine");

function required(name) { const value=process.env[name]; if(!value) throw new Error(`${name} is required`); return value; }
const artifactPath=resolve(process.env.TREASURY_GUARD_ARTIFACT_PATH||resolve(__dirname,"../../../contracts/out/TreasuryGuard.sol/TreasuryGuard.json"));
const artifact=JSON.parse(readFileSync(artifactPath,"utf8"));const bytecode=artifact.bytecode?.object;
const plan=buildTreasuryGuardDeploymentPlan({chainId:Number(required("TREASURY_GUARD_DEPLOY_CHAIN_ID")),governance:required("TREASURY_GUARD_GOVERNANCE_ADDRESS"),guardian:required("TREASURY_GUARD_GUARDIAN_ADDRESS"),policyRegistry:required("POLICY_REGISTRY_ADDRESS"),creationBytecode:bytecode,runtimeBytecode:artifact.deployedBytecode?.object,artifactCompiler:artifact.metadata?.compiler?.version||"unknown",artifactSource:"contracts/src/TreasuryGuard.sol"});
console.log(JSON.stringify(process.env.TREASURY_GUARD_PLAN_SUMMARY_ONLY==="1"?{chainId:plan.chainId,planHash:plan.planHash,initCodeHash:plan.unsignedTransaction.initCodeHash,signed:plan.signed,submitted:plan.submitted,containsPrivateKey:plan.containsPrivateKey,assetExecutionAuthorized:plan.assetExecutionAuthorized}:plan,null,2));
