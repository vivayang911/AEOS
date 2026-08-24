const { readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { Contract, Interface, JsonRpcProvider } = require("ethers");
const { normalizeProposalCreatedEventArgs, verifyLiveGovernanceProposalFinality } = require("../dist/live-governance-proposal-finality");

const ROOT = resolve(__dirname, "../../..");
const FROZEN_PATH = resolve(ROOT, "reports/live-demo/p0-1-governance-hold-proposal-attempt-2.json");
const SUBMISSION_PATH = resolve(ROOT, "reports/live-demo/p0-1-governance-proposal-attempt-2-wallet-submission.json");
const OUTPUT_PATH = resolve(ROOT, "reports/live-demo/p0-1-governance-hold-attempt-2-defeat-finality.json");

async function main() {
  const rpcUrl = process.argv[2];
  if (!/^https:\/\//u.test(rpcUrl || "")) throw new Error("PUBLIC_HTTPS_RPC_REQUIRED");
  const frozen = JSON.parse(readFileSync(FROZEN_PATH, "utf8"));
  const submission = JSON.parse(readFileSync(SUBMISSION_PATH, "utf8"));
  if (
    frozen.schemaVersion !== "aeos.live-governance-hold-proposal.v2"
    || frozen.lineage?.attempt?.attemptNumber !== 2
    || submission.schemaVersion !== "aeos.live-governance-proposal-submission.v2"
    || submission.proposalArtifactHash !== frozen.artifactHash
    || submission.calldataHash !== frozen.unsignedTransaction.dataHash
    || submission.attemptIdentity !== frozen.lineage.attempt.attemptIdentity
  ) throw new Error("GOVERNANCE_HOLD_ATTEMPT_2_SUBMISSION_LINEAGE_MISMATCH");

  const artifact = JSON.parse(readFileSync(resolve(ROOT, "contracts/out/AEOSGovernor.sol/AEOSGovernor.json"), "utf8"));
  const provider = new JsonRpcProvider(rpcUrl, 102031, { staticNetwork: true });
  const governor = new Contract(frozen.contracts.governor, artifact.abi, provider);
  const iface = new Interface(artifact.abi);
  const [network, transaction, receipt, latestBlock] = await Promise.all([
    provider.getNetwork(),
    provider.getTransaction(submission.transactionHash),
    provider.getTransactionReceipt(submission.transactionHash),
    provider.getBlockNumber(),
  ]);
  if (!transaction || !receipt) throw new Error("GOVERNANCE_HOLD_ATTEMPT_2_TRANSACTION_OR_RECEIPT_MISSING");
  const canonicalBlock = await provider.getBlock(receipt.blockNumber, true);
  if (!canonicalBlock) throw new Error("GOVERNANCE_HOLD_ATTEMPT_2_CANONICAL_BLOCK_MISSING");
  const parsed = receipt.logs
    .map((log) => { try { return { log, event: iface.parseLog(log) }; } catch { return null; } })
    .find((value) => value?.event?.name === "ProposalCreated");
  if (!parsed?.event) throw new Error("GOVERNANCE_HOLD_ATTEMPT_2_PROPOSAL_EVENT_MISSING");
  const proposalId = BigInt(frozen.proposal.proposalId);
  const [state, snapshot, deadline, votes, votingPeriod] = await Promise.all([
    governor.state(proposalId),
    governor.proposalSnapshot(proposalId),
    governor.proposalDeadline(proposalId),
    governor.proposalVotes(proposalId),
    governor.votingPeriod(),
  ]);
  const event = normalizeProposalCreatedEventArgs(parsed.event.args);
  const report = verifyLiveGovernanceProposalFinality(frozen, {
    transactionHash: transaction.hash,
    chainId: Number(network.chainId),
    from: transaction.from,
    to: transaction.to,
    value: transaction.value.toString(),
    data: transaction.data,
    receiptStatus: receipt.status,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    canonicalBlockHash: canonicalBlock.hash,
    canonicalTransactionHashes: canonicalBlock.transactions.map((item) => typeof item === "string" ? item : item.hash),
    latestBlock,
    event: { address: parsed.log.address, name: parsed.event.name, ...event },
    state: Number(state),
    proposalSnapshot: snapshot.toString(),
    proposalDeadline: deadline.toString(),
    votes: {
      against: votes.againstVotes.toString(),
      for: votes.forVotes.toString(),
      abstain: votes.abstainVotes.toString(),
    },
  });
  if (
    report.status !== "PROPOSAL_DEFEATED"
    || report.failureReason !== "NO_VOTES_BEFORE_DEADLINE"
    || report.governance.stateCode !== 3
    || report.governance.totalVotes !== "0"
    || BigInt(report.governance.deadlineBlock) >= BigInt(latestBlock)
    || BigInt(report.governance.deadlineBlock) - BigInt(report.governance.snapshotBlock) !== 240n
    || votingPeriod !== 240n
  ) throw new Error("GOVERNANCE_HOLD_ATTEMPT_2_DEFEAT_NOT_PROVEN");

  const output = {
    ...report,
    verifiedAt: new Date().toISOString(),
    retryEligibility: {
      eligible: true,
      reason: "NO_VOTES_BEFORE_DEADLINE",
      nextAttemptNumber: 3,
      preservesPreviousProposal: true,
    },
    truthBoundary: {
      proposalTransactionSucceeded: true,
      proposalCreatedEventObserved: true,
      voteSubmitted: false,
      quorumMet: false,
      queued: false,
      executed: false,
      assetExecutionAuthorized: false,
    },
  };
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({
    status: output.status,
    failureReason: output.failureReason,
    transactionHash: output.transactionHash,
    proposalId: output.proposalId,
    snapshotBlock: output.governance.snapshotBlock,
    deadlineBlock: output.governance.deadlineBlock,
    latestBlock,
    totalVotes: output.governance.totalVotes,
    nextAttemptNumber: 3,
    assetExecutionAuthorized: false,
  }, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exit(1); });
