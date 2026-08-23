const { createHash } = require("node:crypto");
const { writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { Contract, Interface, JsonRpcProvider, getAddress, toQuantity } = require("ethers");
const { Pool } = require("pg");

require("dotenv").config({ path: resolve(__dirname, "../../../.env") });
const { buildLiveGovernanceHoldProposal } = require("../dist/live-governance-hold-proposal.js");

const rpcUrl = process.env.CREDITCOIN_TESTNET_RPC_URL || "https://rpc.cc3-testnet.creditcoin.network";
const decisionId = process.env.LIVE_GOVERNANCE_DECISION_ID || "decision_a9a37c5bd3ff43c68f5b0af32a13b8ed";
const outputPath = resolve(process.env.LIVE_GOVERNANCE_HOLD_PROPOSAL_OUTPUT || resolve(__dirname, "../../../reports/live-demo/p0-1-governance-hold-proposal.json"));
const finalityReport = require(resolve(__dirname, "../../../reports/deployment/governance-stack-finality-verification.json"));
const deployer = getAddress(process.env.LIVE_GOVERNANCE_DEPLOYER || "0x444D510728FB8072351cB5d0E88432e6a8501DFA").toLowerCase();
const guardInterface = new Interface(["function setPaused(bool value)"]);
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}` : JSON.stringify(value);
const commitment = (value) => `0x${createHash("sha256").update(canonical(value)).digest("hex")}`;

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
  if (!/^https:\/\//u.test(rpcUrl)) throw new Error("CREDITCOIN_HTTPS_RPC_REQUIRED");
  if (finalityReport.allPassed !== true || finalityReport.chainId !== 102031) throw new Error("GOVERNANCE_STACK_FINALITY_REQUIRED");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const decisionResult = await pool.query(
      `SELECT d.id,d.organization_id,d.status,d.output_hash,d.evidence_snapshot_id,d.recommendation,
              s.manifest_hash,s.evidence_ids
       FROM decisions d JOIN evidence_snapshots s
         ON s.organization_id=d.organization_id AND s.id=d.evidence_snapshot_id
       WHERE d.id=$1`,
      [decisionId],
    );
    if (decisionResult.rowCount !== 1) throw new Error("LIVE_GOVERNANCE_DECISION_NOT_FOUND");
    const decision = decisionResult.rows[0];
    const reviewResult = await pool.query(
      `SELECT id,outcome,actor_id,rationale,payload_hash FROM decision_reviews
       WHERE organization_id=$1 AND decision_id=$2 AND outcome='APPROVED'
       ORDER BY created_at DESC,id DESC LIMIT 1`,
      [decision.organization_id, decision.id],
    );
    if (decision.status !== "APPROVED" || reviewResult.rowCount !== 1) throw new Error("GOVERNANCE_HOLD_HUMAN_APPROVAL_REQUIRED");
    const review = reviewResult.rows[0];
    const expectedReviewHash = commitment({
      decisionId: decision.id,
      outcome: review.outcome,
      actorId: review.actor_id,
      rationale: review.rationale,
      outputHash: decision.output_hash,
    });
    if (review.payload_hash !== expectedReviewHash) throw new Error("GOVERNANCE_HOLD_REVIEW_HASH_MISMATCH");

    const provider = new JsonRpcProvider(rpcUrl, 102031, { staticNetwork: true });
    const [network, latest] = await Promise.all([provider.getNetwork(), provider.getBlockNumber()]);
    if (Number(network.chainId) !== 102031) throw new Error("GOVERNANCE_HOLD_CHAIN_MISMATCH");
    const safeBlockNumber = latest - 2;
    const block = await provider.getBlock(safeBlockNumber);
    if (!block?.hash) throw new Error("GOVERNANCE_HOLD_SAFE_BLOCK_UNAVAILABLE");
    const { addresses } = finalityReport;
    const [codes, guardPaused, guardGovernance, governorTimelock, proposalThreshold, deployerVotes] = await Promise.all([
      Promise.all(Object.values(addresses).map((address) => provider.getCode(address, safeBlockNumber))),
      new Contract(addresses.treasuryGuard, ["function paused() view returns(bool)"], provider).paused({ blockTag: safeBlockNumber }),
      new Contract(addresses.treasuryGuard, ["function governance() view returns(address)"], provider).governance({ blockTag: safeBlockNumber }),
      new Contract(addresses.governor, ["function timelock() view returns(address)"], provider).timelock({ blockTag: safeBlockNumber }),
      new Contract(addresses.governor, ["function proposalThreshold() view returns(uint256)"], provider).proposalThreshold({ blockTag: safeBlockNumber }),
      new Contract(addresses.token, ["function getVotes(address) view returns(uint256)"], provider).getVotes(deployer, { blockTag: safeBlockNumber }),
    ]);
    const actionData = guardInterface.encodeFunctionData("setPaused", [true]);
    const simulationRequest = { from: addresses.timelock, to: addresses.treasuryGuard, value: "0x0", data: actionData };
    const blockTag = toQuantity(safeBlockNumber);
    await provider.send("eth_call", [simulationRequest, blockTag]);
    const gasEstimate = BigInt(await provider.send("eth_estimateGas", [simulationRequest, blockTag]));

    const artifact = buildLiveGovernanceHoldProposal({
      recordedAt: new Date().toISOString(),
      decision: { id: decision.id, status: decision.status, outputHash: decision.output_hash, evidenceSnapshotId: decision.evidence_snapshot_id, recommendation: decision.recommendation },
      review: { id: review.id, outcome: review.outcome, outputHash: decision.output_hash, actorType: "human" },
      snapshot: { id: decision.evidence_snapshot_id, manifestHash: decision.manifest_hash, evidenceIds: decision.evidence_ids },
      tenantCommitment: commitment({ organizationId: decision.organization_id }),
      chain: { chainId: 102031, blockNumber: safeBlockNumber, blockHash: block.hash.toLowerCase(), confirmations: 2 },
      contracts: { deployer, token: addresses.token, timelock: addresses.timelock, governor: addresses.governor, treasuryGuard: addresses.treasuryGuard },
      readback: { allContractsHaveCode: codes.every((code) => code !== "0x"), guardPaused, guardGovernance, governorTimelock, proposalThreshold: proposalThreshold.toString(), deployerVotes: deployerVotes.toString() },
      simulation: { from: addresses.timelock, to: addresses.treasuryGuard, value: "0x0", data: actionData, callSucceeded: true, gasEstimate: gasEstimate.toString() },
    });
    writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, { flag: "wx" });
    console.log(JSON.stringify({ status: artifact.status, decisionId: artifact.lineage.decisionId, proposalId: artifact.proposal.proposalId, artifactHash: artifact.artifactHash, chain: artifact.chain, controls: artifact.controls, truthBoundary: artifact.truthBoundary }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
