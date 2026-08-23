const { readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { Contract, JsonRpcProvider } = require("ethers");
const { buildVotingPeriodRecovery } = require("../dist/live-governance-voting-period-recovery");

const ROOT = resolve(__dirname, "../../..");
const FINALITY_PATH = resolve(ROOT, "reports/live-demo/p0-1-governance-proposal-finality.json");
const OUTPUT_PATH = resolve(ROOT, "reports/live-demo/p0-1-governance-voting-period-recovery.json");
const GOVERNOR = "0xfe90b087fae789e043514b6ac3dbd7fd2d970268";
const TOKEN = "0x3c5d22d53776ab288d25892e34bda0d9a895e252";
const VOTER = "0x444d510728fb8072351cb5d0e88432e6a8501dfa";

async function main() {
  const rpcUrl = process.argv[2];
  if (!/^https:\/\//u.test(rpcUrl || "")) throw new Error("PUBLIC_HTTPS_RPC_REQUIRED");
  const finality = JSON.parse(readFileSync(FINALITY_PATH, "utf8"));
  const provider = new JsonRpcProvider(rpcUrl, 102031, { staticNetwork: true });
  const governor = new Contract(GOVERNOR, ["function clock() view returns(uint48)", "function CLOCK_MODE() view returns(string)", "function votingDelay() view returns(uint256)", "function votingPeriod() view returns(uint256)", "function quorumNumerator() view returns(uint256)", "function quorumDenominator() view returns(uint256)", "function quorum(uint256) view returns(uint256)"], provider);
  const token = new Contract(TOKEN, ["function getVotes(address) view returns(uint256)", "function delegates(address) view returns(address)"], provider);
  const latest = await provider.getBlockNumber();
  const safeBlockNumber = latest - 1;
  const safeBlock = await provider.getBlock(safeBlockNumber);
  if (!safeBlock) throw new Error("GOVERNANCE_RECOVERY_SAFE_BLOCK_MISSING");
  const timepoint = BigInt(safeBlockNumber - 1);
  const options = { blockTag: safeBlockNumber };
  const [clock, clockMode, votingDelay, votingPeriod, quorumNumerator, quorumDenominator, quorumVotes, voterVotes, voterDelegate] = await Promise.all([
    governor.clock(options), governor.CLOCK_MODE(options), governor.votingDelay(options), governor.votingPeriod(options), governor.quorumNumerator(options), governor.quorumDenominator(options), governor.quorum(timepoint, options), token.getVotes(VOTER, options), token.delegates(VOTER, options),
  ]);
  if (BigInt(clock) !== BigInt(safeBlockNumber)) throw new Error("GOVERNANCE_RECOVERY_CLOCK_MISMATCH");
  const artifact = buildVotingPeriodRecovery({
    recordedAt: new Date().toISOString(),
    chain: { chainId: 102031, blockNumber: safeBlockNumber, blockHash: safeBlock.hash, confirmations: latest - safeBlockNumber + 1 },
    governor: GOVERNOR,
    voter: VOTER,
    failedProposal: finality,
    voting: { clockMode, currentVotingDelayBlocks: votingDelay.toString(), currentVotingPeriodBlocks: votingPeriod.toString(), targetVotingPeriodBlocks: 240, quorumNumerator: quorumNumerator.toString(), quorumDenominator: quorumDenominator.toString(), quorumVotes: quorumVotes.toString(), voterVotes: voterVotes.toString(), voterDelegate },
    humanDirectiveApproved: true,
  });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ status: artifact.status, outputPath: OUTPUT_PATH, artifactHash: artifact.artifactHash, proposalId: artifact.proposal.proposalId, currentVotingPeriodBlocks: artifact.proposal.action.previousVotingPeriodBlocks, targetVotingPeriodBlocks: artifact.proposal.action.newVotingPeriodBlocks, quorumVotes: artifact.votingCapacity.quorumVotes, voterVotes: artifact.votingCapacity.voterVotes, singleWalletMeetsQuorum: true, separateWalletConfirmationsRequired: 2, assetExecutionAuthorized: false }, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exit(1); });
