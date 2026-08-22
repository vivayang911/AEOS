const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");
const { JsonRpcProvider, formatEther, getAddress } = require("ethers");

async function main() {
  const artifactPath = resolve(process.env.AEOS_LIVE_OBSERVATION_ARTIFACT ?? resolve(__dirname, "../../../reports/live-demo/step-1-commit-observation-request.json"));
  const outputPath = resolve(process.env.AEOS_WALLET_HANDOFF_PATH ?? resolve(__dirname, "../../../reports/deployment/treasury-observation-wallet-handoff.json"));
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  if (artifact.step !== 1 || artifact.status !== "PREPARED_UNSIGNED") throw new Error("LIVE_OBSERVATION_ARTIFACT_INVALID");
  const transaction = artifact.commitRequest?.unsignedTransaction;
  const sender = getAddress(transaction?.from);
  const target = getAddress(transaction?.to);
  if (transaction.value !== "0" || artifact.commitRequest.chainId !== 11155111) throw new Error("LIVE_OBSERVATION_TRANSACTION_INVALID");
  const rpcUrl = process.env.AEOS_EVIDENCE_SOURCE_DEPLOY_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
  const rpc = new JsonRpcProvider(rpcUrl, 11155111, { staticNetwork: true });
  const [network, observedBlockNumber, balance, pendingNonce, feeData, code] = await Promise.all([rpc.getNetwork(), rpc.getBlockNumber(), rpc.getBalance(sender), rpc.getTransactionCount(sender, "pending"), rpc.getFeeData(), rpc.getCode(target)]);
  if (Number(network.chainId) !== 11155111 || code === "0x") throw new Error("LIVE_OBSERVATION_SOURCE_READBACK_INVALID");
  const gasEstimate = await rpc.estimateGas({ from: sender, to: target, data: transaction.data, value: 0n });
  const maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
  if (!maxFeePerGas) throw new Error("LIVE_OBSERVATION_FEE_DATA_UNAVAILABLE");
  const handoff = {schemaVersion:"aeos-treasury-observation.wallet-handoff.v1",generatedAt:new Date().toISOString(),observedBlockNumber,chain:{name:"Ethereum Sepolia",chainId:11155111,rpcUrl,explorerUrl:"https://sepolia.etherscan.io/",currencySymbol:"ETH"},sender,balance:{wei:balance.toString(),native:formatEther(balance)},pendingNonce,gas:{estimate:gasEstimate.toString(),observedMaxFeePerGas:maxFeePerGas.toString(),estimatedMaxCostWei:(gasEstimate*maxFeePerGas).toString()},request:{requestHash:artifact.commitRequest.requestHash,observationId:artifact.payload.observationId,evidencePayloadHash:artifact.evidencePayloadHash,transaction},confirmation:{requiresUserWalletConfirmation:true,transactionHash:null,signed:false,submitted:false},containsPrivateKey:false,aeosSigningCapability:false,aeosBroadcastCapability:false,assetExecutionAuthorized:false};
  mkdirSync(dirname(outputPath),{recursive:true});
  writeFileSync(outputPath,`${JSON.stringify(handoff,null,2)}\n`,{encoding:"utf8",mode:0o600});
  console.log(JSON.stringify({status:"PREPARED_UNSIGNED",outputPath,chainId:11155111,sender,target,balanceETH:handoff.balance.native,pendingNonce,gasEstimate:handoff.gas.estimate,estimatedMaxCostWei:handoff.gas.estimatedMaxCostWei,requestHash:handoff.request.requestHash,signed:false,submitted:false,assetExecutionAuthorized:false},null,2));
}
main().catch(error=>{console.error(error instanceof Error?error.message:"LIVE_OBSERVATION_HANDOFF_FAILED");process.exit(1)});
