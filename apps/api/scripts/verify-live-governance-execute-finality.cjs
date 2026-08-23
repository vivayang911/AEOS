const { readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { Contract, Interface, JsonRpcProvider } = require("ethers");
const { verifyRecoveryExecuteFinality } = require("../dist/live-governance-execute-finality");

const ROOT = resolve(__dirname, "../../..");
const EXECUTE_PATH = resolve(ROOT, "reports/live-demo/p0-1-governance-recovery-execute.json");
const SUBMISSION_PATH = resolve(ROOT, "reports/live-demo/p0-1-governance-recovery-execute-submission.json");
const FINALITY_PATH = resolve(ROOT, "reports/live-demo/p0-1-governance-recovery-execute-finality.json");
const TIMELOCK_ADDRESS = "0x110780c95c487b93037016ea8cfae5552ce44092";
const GUARD_ADDRESS = "0x3c0cb960f32e6a222149a664a552ffc23e92c628";

async function main() {
  const rpcUrl = process.argv[2];
  if (!/^https:\/\//u.test(rpcUrl || "")) throw new Error("PUBLIC_HTTPS_RPC_REQUIRED");
  const frozen = JSON.parse(readFileSync(EXECUTE_PATH, "utf8"));
  const submission = JSON.parse(readFileSync(SUBMISSION_PATH, "utf8"));
  if (
    submission.executeArtifactHash !== frozen.artifactHash ||
    submission.calldataHash !== frozen.unsignedTransaction.dataHash ||
    submission.proposalId !== frozen.lineage.proposalId ||
    submission.timelockOperationId !== frozen.lineage.timelockOperationId
  ) throw new Error("GOVERNANCE_EXECUTE_SUBMISSION_LINEAGE_MISMATCH");

  const provider = new JsonRpcProvider(rpcUrl, 102031, { staticNetwork: true });
  const governorAbi = JSON.parse(readFileSync(resolve(ROOT, "contracts/out/AEOSGovernor.sol/AEOSGovernor.json"), "utf8")).abi;
  const timelockAbi = JSON.parse(readFileSync(resolve(ROOT, "contracts/out/TimelockController.sol/TimelockController.json"), "utf8")).abi;
  const governor = new Contract(frozen.unsignedTransaction.to, governorAbi, provider);
  const timelock = new Contract(TIMELOCK_ADDRESS, timelockAbi, provider);
  const guard = new Contract(GUARD_ADDRESS, ["function paused() view returns(bool)"], provider);
  const governorInterface = new Interface(governorAbi);
  const timelockInterface = new Interface(timelockAbi);
  const proposalId = BigInt(frozen.lineage.proposalId);

  const [network, tx, receipt, latest] = await Promise.all([
    provider.getNetwork(),
    provider.getTransaction(submission.transactionHash),
    provider.getTransactionReceipt(submission.transactionHash),
    provider.getBlockNumber(),
  ]);
  if (!tx || !receipt) throw new Error("GOVERNANCE_EXECUTE_TRANSACTION_OR_RECEIPT_MISSING");
  const block = await provider.getBlock(receipt.blockNumber, true);
  if (!block) throw new Error("GOVERNANCE_EXECUTE_CANONICAL_BLOCK_MISSING");

  let proposalExecuted = null;
  let callExecuted = null;
  for (const log of receipt.logs) {
    try {
      const event = governorInterface.parseLog(log);
      if (event.name === "ProposalExecuted") proposalExecuted = { address: log.address, proposalId: event.args[0].toString() };
    } catch {}
    try {
      const event = timelockInterface.parseLog(log);
      if (event.name === "CallExecuted" && event.args[1] === 0n) callExecuted = {
        address: log.address,
        operationId: event.args[0],
        index: event.args[1].toString(),
        target: event.args[2],
        value: event.args[3].toString(),
        data: event.args[4],
      };
    } catch {}
  }
  if (!proposalExecuted || !callExecuted) throw new Error("GOVERNANCE_EXECUTE_EVENTS_MISSING");

  const [state, votingPeriod, timestamp, pending, ready, done, paused] = await Promise.all([
    governor.state(proposalId),
    governor.votingPeriod(),
    timelock.getTimestamp(frozen.lineage.timelockOperationId),
    timelock.isOperationPending(frozen.lineage.timelockOperationId),
    timelock.isOperationReady(frozen.lineage.timelockOperationId),
    timelock.isOperationDone(frozen.lineage.timelockOperationId),
    guard.paused(),
  ]);
  const finality = verifyRecoveryExecuteFinality(frozen, {
    chainId: Number(network.chainId),
    latestBlock: latest,
    transaction: {
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value.toString(),
      data: tx.data,
      status: receipt.status,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      canonicalBlockHash: block.hash,
      canonicalTransactionHashes: block.transactions.map((item) => typeof item === "string" ? item : item.hash),
    },
    proposalExecuted,
    callExecuted,
    governance: { state: Number(state), votingPeriodBlocks: votingPeriod.toString() },
    timelock: { address: TIMELOCK_ADDRESS, timestamp: timestamp.toString(), pending, ready, done },
    treasuryGuard: { address: GUARD_ADDRESS, paused },
  });
  const output = { ...finality, verifiedAt: new Date().toISOString() };
  writeFileSync(FINALITY_PATH, `${JSON.stringify(output, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({
    status: output.status,
    proposalId: output.proposalId,
    executeTransactionHash: output.transaction.hash,
    confirmations: output.transaction.confirmations,
    governorState: output.governance.state,
    votingPeriodBlocks: output.governance.votingPeriodBlocks,
    timelockOperationDone: output.timelock.done,
    treasuryGuardPaused: output.treasuryGuard.paused,
    treasuryAssetMovement: false,
    assetExecutionAuthorized: false,
  }, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exit(1); });
