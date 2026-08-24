const { readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { Contract, Interface, JsonRpcProvider } = require("ethers");
const { normalizeProposalCreatedEventArgs, verifyLiveGovernanceProposalFinality } = require("../dist/live-governance-proposal-finality");
const { buildDecisionBoundHoldVote } = require("../dist/live-governance-hold-vote");

const ROOT = resolve(__dirname, "../../..");
const FROZEN_PATH = resolve(ROOT, "reports/live-demo/p0-1-governance-hold-proposal-attempt-3.json");
const SUBMISSION_PATH = resolve(ROOT, "reports/live-demo/p0-1-governance-proposal-attempt-3-wallet-submission.json");
const OUTPUT_PATH = resolve(ROOT, "reports/live-demo/p0-1-governance-hold-attempt-3-proposal-finality.json");
const VOTE_PATH = resolve(ROOT, "reports/live-demo/p0-1-governance-hold-attempt-3-vote.json");
const RECOVERY_PROPOSAL_ID = "53157830901067299467529326670610865264746812708370915092221485481106446599323";

async function main() {
  const rpcUrl = process.argv[2];
  if (!/^https:\/\//u.test(rpcUrl || "")) throw new Error("PUBLIC_HTTPS_RPC_REQUIRED");
  const frozen = JSON.parse(readFileSync(FROZEN_PATH, "utf8"));
  const submission = JSON.parse(readFileSync(SUBMISSION_PATH, "utf8"));
  if (
    frozen.schemaVersion !== "aeos.live-governance-hold-proposal.v2"
    || frozen.lineage?.attempt?.attemptNumber !== 3
    || submission.schemaVersion !== "aeos.live-governance-proposal-submission.v2"
    || submission.attemptNumber !== 3
    || submission.proposalArtifactHash !== frozen.artifactHash
    || submission.calldataHash !== frozen.unsignedTransaction.dataHash
    || submission.attemptIdentity !== frozen.lineage.attempt.attemptIdentity
  ) throw new Error("GOVERNANCE_HOLD_ATTEMPT_3_SUBMISSION_LINEAGE_MISMATCH");

  const governorArtifact = JSON.parse(readFileSync(resolve(ROOT, "contracts/out/AEOSGovernor.sol/AEOSGovernor.json"), "utf8"));
  const provider = new JsonRpcProvider(rpcUrl, 102031, { staticNetwork: true });
  const governor = new Contract(frozen.contracts.governor, governorArtifact.abi, provider);
  const token = new Contract(frozen.contracts.token, ["function getPastVotes(address,uint256) view returns(uint256)", "function delegates(address) view returns(address)"], provider);
  const iface = new Interface(governorArtifact.abi);
  const proposalId = BigInt(frozen.proposal.proposalId);
  const [network, transaction, receipt, latestBlock] = await Promise.all([
    provider.getNetwork(),
    provider.getTransaction(submission.transactionHash),
    provider.getTransactionReceipt(submission.transactionHash),
    provider.getBlockNumber(),
  ]);
  if (!transaction || !receipt) throw new Error("GOVERNANCE_HOLD_ATTEMPT_3_TRANSACTION_OR_RECEIPT_MISSING");
  const canonicalBlock = await provider.getBlock(receipt.blockNumber, true);
  if (!canonicalBlock) throw new Error("GOVERNANCE_HOLD_ATTEMPT_3_CANONICAL_BLOCK_MISSING");
  const parsed = receipt.logs
    .map((log) => { try { return { log, event: iface.parseLog(log) }; } catch { return null; } })
    .find((value) => value?.event?.name === "ProposalCreated");
  if (!parsed?.event) throw new Error("GOVERNANCE_HOLD_ATTEMPT_3_PROPOSAL_EVENT_MISSING");
  const [state, snapshot, deadline, votes, votingPeriod, previousState, recoveryState] = await Promise.all([
    governor.state(proposalId),
    governor.proposalSnapshot(proposalId),
    governor.proposalDeadline(proposalId),
    governor.proposalVotes(proposalId),
    governor.votingPeriod(),
    governor.state(BigInt(frozen.lineage.attempt.previousProposalId)),
    governor.state(BigInt(RECOVERY_PROPOSAL_ID)),
  ]);
  const decoded = normalizeProposalCreatedEventArgs(parsed.event.args);
  const generic = verifyLiveGovernanceProposalFinality(frozen, {
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
    event: { address: parsed.log.address, name: parsed.event.name, ...decoded },
    state: Number(state),
    proposalSnapshot: snapshot.toString(),
    proposalDeadline: deadline.toString(),
    votes: { against: votes.againstVotes.toString(), for: votes.forVotes.toString(), abstain: votes.abstainVotes.toString() },
  });
  if (Number(state) !== 1) throw new Error(`GOVERNANCE_HOLD_ATTEMPT_3_NOT_ACTIVE:${state}`);
  if (
    deadline - snapshot !== 240n
    || votingPeriod !== 240n
    || Number(previousState) !== 3
    || Number(recoveryState) !== 7
    || latestBlock > Number(deadline)
  ) throw new Error("GOVERNANCE_HOLD_ATTEMPT_3_WINDOW_OR_RECOVERY_INVALID");
  const [observedBlock, quorumVotes, voterVotes, voterDelegate] = await Promise.all([
    provider.getBlock(latestBlock),
    governor.quorum(snapshot),
    token.getPastVotes(frozen.unsignedTransaction.from, snapshot),
    token.delegates(frozen.unsignedTransaction.from),
  ]);
  if (!observedBlock) throw new Error("GOVERNANCE_HOLD_ATTEMPT_3_OBSERVED_BLOCK_MISSING");
  const output = {
    ...generic,
    status: "PROPOSAL_ACTIVE",
    governance: { ...generic.governance, state: "Active", stateCode: 1, votingWindowBlocks: 240 },
    recoveryLineage: { previousProposalState: "Defeated", recoveryProposalState: "Executed", currentVotingPeriodBlocks: 240 },
    verifiedAt: new Date().toISOString(),
    truthBoundary: { proposalTransactionSucceeded: true, proposalCreatedEventObserved: true, voteSubmitted: false, quorumMet: false, queued: false, executed: false, assetExecutionAuthorized: false },
  };
  const vote = buildDecisionBoundHoldVote(frozen, output, {
    voter: frozen.unsignedTransaction.from,
    voterDelegate,
    voterVotes: voterVotes.toString(),
    quorumVotes: quorumVotes.toString(),
    observedBlockNumber: latestBlock,
    observedBlockHash: observedBlock.hash,
  }, new Date().toISOString());
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, { flag: "wx" });
  writeFileSync(VOTE_PATH, `${JSON.stringify(vote, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({
    status: output.status,
    transactionHash: output.transactionHash,
    confirmations: output.confirmations,
    proposalId: output.proposalId,
    snapshotBlock: output.governance.snapshotBlock,
    deadlineBlock: output.governance.deadlineBlock,
    votingWindowBlocks: output.governance.votingWindowBlocks,
    blocksRemaining: vote.activeWindow.blocksRemaining,
    voterVotes: vote.votingCapacity.voterVotes,
    quorumVotes: vote.votingCapacity.quorumVotes,
    voteArtifactHash: vote.artifactHash,
    voteSigned: false,
    voteSubmitted: false,
    assetExecutionAuthorized: false,
  }, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exit(1); });
