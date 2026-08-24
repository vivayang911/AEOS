const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { Contract, Interface, JsonRpcProvider } = require("ethers");
const { buildDecisionBoundHoldQueue, verifyDecisionBoundHoldVoteFinality } = require("../dist/live-governance-hold-vote-finality");

const ROOT = resolve(__dirname, "../../..");
const PROPOSAL_PATH = resolve(ROOT, "reports/live-demo/p0-1-governance-hold-proposal-attempt-3.json");
const VOTE_PATH = resolve(ROOT, "reports/live-demo/p0-1-governance-hold-attempt-3-vote.json");
const SUBMISSION_PATH = resolve(ROOT, "reports/live-demo/p0-1-governance-hold-attempt-3-vote-submission.json");
const ACTIVE_PATH = resolve(ROOT, "reports/live-demo/p0-1-governance-hold-attempt-3-vote-cast-finality.json");
const SUCCEEDED_PATH = resolve(ROOT, "reports/live-demo/p0-1-governance-hold-attempt-3-vote-succeeded-finality.json");
const QUEUE_PATH = resolve(ROOT, "reports/live-demo/p0-1-governance-hold-attempt-3-queue.json");

async function main() {
  const rpcUrl = process.argv[2];
  if (!/^https:\/\//u.test(rpcUrl || "")) throw new Error("PUBLIC_HTTPS_RPC_REQUIRED");
  const proposal = JSON.parse(readFileSync(PROPOSAL_PATH, "utf8"));
  const vote = JSON.parse(readFileSync(VOTE_PATH, "utf8"));
  const submission = JSON.parse(readFileSync(SUBMISSION_PATH, "utf8"));
  if (
    proposal.lineage?.attempt?.attemptNumber !== 3
    || vote.lineage?.attemptNumber !== 3
    || submission.attemptNumber !== 3
    || submission.voteArtifactHash !== vote.artifactHash
    || submission.proposalArtifactHash !== proposal.artifactHash
    || submission.proposalId !== proposal.proposal.proposalId
    || submission.calldataHash !== vote.unsignedTransaction.dataHash
    || submission.transactionHash !== "0x82428c71a329ccf18951d4b11d7db0ee2bbf7ad5ba36fe328626d1d2c543a8c9"
  ) throw new Error("GOVERNANCE_HOLD_ATTEMPT_3_VOTE_SUBMISSION_LINEAGE_MISMATCH");

  const abi = JSON.parse(readFileSync(resolve(ROOT, "contracts/out/AEOSGovernor.sol/AEOSGovernor.json"), "utf8")).abi;
  const provider = new JsonRpcProvider(rpcUrl, 102031, { staticNetwork: true });
  const governor = new Contract(proposal.contracts.governor, abi, provider);
  const iface = new Interface(abi);
  const proposalId = BigInt(proposal.proposal.proposalId);
  const [network, transaction, receipt, latestBlock] = await Promise.all([
    provider.getNetwork(),
    provider.getTransaction(submission.transactionHash),
    provider.getTransactionReceipt(submission.transactionHash),
    provider.getBlockNumber(),
  ]);
  if (!transaction || !receipt) throw new Error("GOVERNANCE_HOLD_ATTEMPT_3_VOTE_TRANSACTION_OR_RECEIPT_MISSING");
  const canonicalBlock = await provider.getBlock(receipt.blockNumber, true);
  if (!canonicalBlock) throw new Error("GOVERNANCE_HOLD_ATTEMPT_3_VOTE_CANONICAL_BLOCK_MISSING");
  const parsed = receipt.logs
    .map((log) => { try { return { log, event: iface.parseLog(log) }; } catch { return null; } })
    .find((value) => value?.event?.name === "VoteCast");
  if (!parsed?.event) throw new Error("GOVERNANCE_HOLD_ATTEMPT_3_VOTE_EVENT_MISSING");
  const args = parsed.event.args;
  const [state, snapshot, deadline, votes, quorum, needsQueuing, hasVoted, votingPeriod] = await Promise.all([
    governor.state(proposalId),
    governor.proposalSnapshot(proposalId),
    governor.proposalDeadline(proposalId),
    governor.proposalVotes(proposalId),
    governor.quorum(await governor.proposalSnapshot(proposalId)),
    governor.proposalNeedsQueuing(proposalId),
    governor.hasVoted(proposalId, vote.unsignedTransaction.from),
    governor.votingPeriod(),
  ]);
  const finality = verifyDecisionBoundHoldVoteFinality(proposal, vote, {
    chainId: Number(network.chainId),
    latestBlock,
    voteTransaction: {
      hash: transaction.hash,
      from: transaction.from,
      to: transaction.to,
      value: transaction.value.toString(),
      data: transaction.data,
      status: receipt.status,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      canonicalBlockHash: canonicalBlock.hash,
      canonicalTransactionHashes: canonicalBlock.transactions.map((item) => typeof item === "string" ? item : item.hash),
    },
    voteEvent: { address: parsed.log.address, voter: args[0], proposalId: args[1].toString(), support: Number(args[2]), weight: args[3].toString(), reason: args[4] },
    governance: { state: Number(state), snapshot: snapshot.toString(), deadline: deadline.toString(), quorum: quorum.toString(), againstVotes: votes.againstVotes.toString(), forVotes: votes.forVotes.toString(), abstainVotes: votes.abstainVotes.toString(), proposalNeedsQueuing: needsQueuing, hasVoted, currentVotingPeriodBlocks: votingPeriod.toString() },
  });
  const output = { ...finality, verifiedAt: new Date().toISOString() };
  const finalityPath = finality.status === "HOLD_VOTE_SUCCEEDED" ? SUCCEEDED_PATH : ACTIVE_PATH;
  if (!existsSync(finalityPath)) writeFileSync(finalityPath, `${JSON.stringify(output, null, 2)}\n`, { flag: "wx" });
  let queue = null;
  if (finality.status === "HOLD_VOTE_SUCCEEDED") {
    queue = buildDecisionBoundHoldQueue(proposal, finality, new Date().toISOString());
    if (!existsSync(QUEUE_PATH)) writeFileSync(QUEUE_PATH, `${JSON.stringify(queue, null, 2)}\n`, { flag: "wx" });
  }
  console.log(JSON.stringify({ status: finality.status, transactionHash: finality.voteTransaction.hash, confirmations: finality.voteTransaction.confirmations, proposalId: finality.proposalId, governorState: finality.governance.state, forVotes: finality.governance.votes.for, quorum: finality.governance.quorum, quorumMet: finality.governance.quorumMet, blocksRemaining: finality.governance.blocksRemaining, queuePrepared: Boolean(queue), queueArtifactHash: queue?.artifactHash || null, assetExecutionAuthorized: false }, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exit(1); });
