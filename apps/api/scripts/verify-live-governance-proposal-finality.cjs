const { readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { Contract, Interface, JsonRpcProvider } = require("ethers");
const { verifyLiveGovernanceProposalFinality } = require("../dist/live-governance-proposal-finality");

const ROOT = resolve(__dirname, "../../..");
const FROZEN_PATH = resolve(ROOT, "reports/live-demo/p0-1-governance-hold-proposal.json");
const SUBMISSION_PATH = resolve(ROOT, "reports/live-demo/p0-1-governance-proposal-wallet-submission.json");
const OUTPUT_PATH = resolve(ROOT, "reports/live-demo/p0-1-governance-proposal-finality.json");

async function main() {
  const rpcUrl = process.argv[2];
  if (!/^https:\/\//u.test(rpcUrl || "")) throw new Error("PUBLIC_HTTPS_RPC_REQUIRED");
  const frozen = JSON.parse(readFileSync(FROZEN_PATH, "utf8"));
  const submission = JSON.parse(readFileSync(SUBMISSION_PATH, "utf8"));
  if (submission.proposalArtifactHash !== frozen.artifactHash || submission.calldataHash !== frozen.unsignedTransaction.dataHash) throw new Error("GOVERNANCE_PROPOSAL_SUBMISSION_LINEAGE_MISMATCH");

  const artifact = JSON.parse(readFileSync(resolve(ROOT, "contracts/out/AEOSGovernor.sol/AEOSGovernor.json"), "utf8"));
  const provider = new JsonRpcProvider(rpcUrl, frozen.unsignedTransaction.chainId, { staticNetwork: true });
  const governor = new Contract(frozen.contracts.governor, artifact.abi, provider);
  const iface = new Interface(artifact.abi);
  const [network, transaction, receipt, latestBlock] = await Promise.all([
    provider.getNetwork(), provider.getTransaction(submission.transactionHash), provider.getTransactionReceipt(submission.transactionHash), provider.getBlockNumber(),
  ]);
  if (!transaction || !receipt) throw new Error("GOVERNANCE_PROPOSAL_TRANSACTION_OR_RECEIPT_MISSING");
  const canonicalBlock = await provider.getBlock(receipt.blockNumber, true);
  if (!canonicalBlock) throw new Error("GOVERNANCE_PROPOSAL_CANONICAL_BLOCK_MISSING");
  const parsed = receipt.logs.map((log) => { try { return { log, event: iface.parseLog(log) }; } catch { return null; } }).find((value) => value?.event?.name === "ProposalCreated");
  if (!parsed?.event) throw new Error("GOVERNANCE_PROPOSAL_EVENT_MISSING");
  const proposalId = BigInt(frozen.proposal.proposalId);
  const [state, snapshot, deadline, votes] = await Promise.all([
    governor.state(proposalId), governor.proposalSnapshot(proposalId), governor.proposalDeadline(proposalId), governor.proposalVotes(proposalId),
  ]);
  const event = parsed.event;
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
    event: {
      address: parsed.log.address,
      name: event.name,
      proposalId: event.args.proposalId.toString(),
      proposer: event.args.proposer,
      targets: [...event.args.targets],
      values: [...event.args.values].map(String),
      signatures: [...event.args.signatures],
      calldatas: [...event.args.calldatas],
      voteStart: event.args.voteStart.toString(),
      voteEnd: event.args.voteEnd.toString(),
      description: event.args.description,
    },
    state: Number(state),
    proposalSnapshot: snapshot.toString(),
    proposalDeadline: deadline.toString(),
    votes: { against: votes.againstVotes.toString(), for: votes.forVotes.toString(), abstain: votes.abstainVotes.toString() },
  });
  const output = { ...report, verifiedAt: new Date().toISOString(), truthBoundary: { proposalTransactionSucceeded: true, proposalCreatedEventObserved: true, voteOrQuorumPassed: report.lifecyclePassed, queued: report.governance.state === "Queued", executed: report.governance.state === "Executed", fullGovernanceLifecycleComplete: report.governance.state === "Executed" } };
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify(output, null, 2));
  if (!output.lifecyclePassed) process.exitCode = 2;
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exit(1); });
