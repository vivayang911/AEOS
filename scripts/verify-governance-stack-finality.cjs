const { writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const {
  Contract,
  Interface,
  JsonRpcProvider,
  ZeroAddress,
  keccak256,
} = require("ethers");

const ROOT = resolve(__dirname, "..");
const PLAN_PATH = resolve(ROOT, "reports/deployment/governance-stack-deployment-plan.json");
const SUBMISSION_PATH = resolve(ROOT, "reports/deployment/governance-stack-submissions/08-submitted.json");
const RECEIPT_PATH = resolve(ROOT, "reports/deployment/governance-stack-submissions/08-receipt.json");
const REPORT_PATH = resolve(ROOT, "reports/deployment/governance-stack-finality-verification.json");

function load(relativePath) {
  return require(resolve(ROOT, relativePath));
}

function lower(value) {
  return value.toLowerCase();
}

async function verifyGovernanceStackFinality(rpcUrl) {
  if (!/^https:\/\//u.test(rpcUrl)) {
    throw new Error("A public HTTPS Creditcoin RPC URL is required");
  }

  const plan = require(PLAN_PATH);
  const submission = require(SUBMISSION_PATH);
  const localReceipt = require(RECEIPT_PATH);
  const expected = plan.roleTransactions.find(({ sequence }) => sequence === 8);
  if (!expected) throw new Error("Frozen sequence 8 is missing");

  const timelockArtifact = load("contracts/out/TimelockController.sol/TimelockController.json");
  const governorArtifact = load("contracts/out/AEOSGovernor.sol/AEOSGovernor.json");
  const policyArtifact = load("contracts/out/PolicyRegistry.sol/PolicyRegistry.json");
  const guardArtifact = load("contracts/out/TreasuryGuard.sol/TreasuryGuard.json");
  const provider = new JsonRpcProvider(rpcUrl, plan.chainId, { staticNetwork: true });

  const [network, transaction, receipt, canonicalBlock, latestBlock, pendingNonce, codes] =
    await Promise.all([
      provider.getNetwork(),
      provider.getTransaction(submission.transactionHash),
      provider.getTransactionReceipt(submission.transactionHash),
      provider.getBlock(localReceipt.blockNumber, true),
      provider.getBlockNumber(),
      provider.getTransactionCount(plan.deployer, "pending"),
      Promise.all(Object.values(plan.addresses).map((address) => provider.getCode(address))),
    ]);

  if (!transaction || !receipt || !canonicalBlock) {
    throw new Error("Transaction, receipt, or canonical block is unavailable");
  }

  const timelock = new Contract(plan.addresses.timelock, timelockArtifact.abi, provider);
  const governor = new Contract(plan.addresses.governor, governorArtifact.abi, provider);
  const policy = new Contract(plan.addresses.policyRegistry, policyArtifact.abi, provider);
  const guard = new Contract(plan.addresses.treasuryGuard, guardArtifact.abi, provider);
  const timelockInterface = new Interface(timelockArtifact.abi);
  const blockTag = receipt.blockNumber;

  const [adminRole, proposerRole, cancellerRole, executorRole, minDelay] = await Promise.all([
    timelock.DEFAULT_ADMIN_ROLE({ blockTag }),
    timelock.PROPOSER_ROLE({ blockTag }),
    timelock.CANCELLER_ROLE({ blockTag }),
    timelock.EXECUTOR_ROLE({ blockTag }),
    timelock.getMinDelay({ blockTag }),
  ]);

  const [
    governorProposer,
    governorCanceller,
    governorAdmin,
    deployerAdmin,
    timelockSelfAdmin,
    openExecutor,
    deployerProposer,
    deployerCanceller,
    governorToken,
    governorTimelock,
    policyGovernance,
    guardGovernance,
    guardPolicyRegistry,
    guardPaused,
  ] = await Promise.all([
    timelock.hasRole(proposerRole, plan.addresses.governor, { blockTag }),
    timelock.hasRole(cancellerRole, plan.addresses.governor, { blockTag }),
    timelock.hasRole(adminRole, plan.addresses.governor, { blockTag }),
    timelock.hasRole(adminRole, plan.deployer, { blockTag }),
    timelock.hasRole(adminRole, plan.addresses.timelock, { blockTag }),
    timelock.hasRole(executorRole, ZeroAddress, { blockTag }),
    timelock.hasRole(proposerRole, plan.deployer, { blockTag }),
    timelock.hasRole(cancellerRole, plan.deployer, { blockTag }),
    governor.token({ blockTag }),
    governor.timelock({ blockTag }),
    policy.governance({ blockTag }),
    guard.governance({ blockTag }),
    guard.policyRegistry({ blockTag }),
    guard.paused({ blockTag }),
  ]);

  const roleRevocations = receipt.logs
    .map((log) => {
      try {
        return timelockInterface.parseLog(log);
      } catch {
        return null;
      }
    })
    .filter((event) => event?.name === "RoleRevoked")
    .map((event) => ({
      role: event.args[0],
      account: event.args[1],
      sender: event.args[2],
    }));

  const checks = {
    chainId: Number(network.chainId) === plan.chainId,
    transactionHash: lower(transaction.hash) === lower(submission.transactionHash),
    sender: lower(transaction.from) === lower(plan.deployer),
    nonce: transaction.nonce === expected.nonce,
    target: lower(transaction.to) === lower(expected.to),
    zeroValue: transaction.value === 0n,
    exactCalldata: lower(transaction.data) === lower(expected.data),
    calldataHash: lower(keccak256(transaction.data)) === lower(expected.dataHash),
    receiptSuccess: receipt.status === 1,
    noContractCreation: receipt.contractAddress === null,
    localBlockNumber: receipt.blockNumber === Number(BigInt(localReceipt.blockNumber)),
    localBlockHash: lower(receipt.blockHash) === lower(localReceipt.blockHash),
    canonicalBlock: lower(canonicalBlock.hash) === lower(receipt.blockHash),
    canonicalInclusion: canonicalBlock.transactions.some((item) =>
      lower(typeof item === "string" ? item : item.hash) === lower(transaction.hash)),
    adminRoleRevokedEvent: roleRevocations.some(({ role, account, sender }) =>
      lower(role) === lower(adminRole)
        && lower(account) === lower(plan.deployer)
        && lower(sender) === lower(plan.deployer)),
    governorProposer,
    governorCanceller,
    governorNotAdmin: governorAdmin === false,
    deployerAdminRenounced: deployerAdmin === false,
    timelockSelfAdmin,
    openExecutor,
    deployerNotProposer: deployerProposer === false,
    deployerNotCanceller: deployerCanceller === false,
    minimumDelay: minDelay === BigInt(plan.settings.timelockDelaySeconds),
    allContractsHaveCode: codes.every((code) => code !== "0x"),
    governorTokenWiring: lower(governorToken) === lower(plan.addresses.token),
    governorTimelockWiring: lower(governorTimelock) === lower(plan.addresses.timelock),
    policyGovernanceWiring: lower(policyGovernance) === lower(plan.addresses.timelock),
    guardGovernanceWiring: lower(guardGovernance) === lower(plan.addresses.timelock),
    guardPolicyRegistryWiring: lower(guardPolicyRegistry) === lower(plan.addresses.policyRegistry),
    guardInitiallyPaused: guardPaused === true,
    immutablePlanLink:
      submission.planHash === plan.planHash && localReceipt.planHash === plan.planHash,
    immutableRequestLink:
      submission.requestHash === expected.requestHash
      && localReceipt.requestHash === expected.requestHash,
    nextPendingNonce: pendingNonce === expected.nonce + 1,
  };

  const report = {
    schemaVersion: "aeos.governance-stack.finality-verification.v1",
    verifiedAt: new Date().toISOString(),
    chainId: plan.chainId,
    planHash: plan.planHash,
    transactionHash: transaction.hash,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    latestBlock,
    confirmations: latestBlock - receipt.blockNumber + 1,
    pendingNonce,
    addresses: plan.addresses,
    roles: {
      governorProposer,
      governorCanceller,
      governorAdmin,
      deployerAdmin,
      timelockSelfAdmin,
      openExecutor,
      deployerProposer,
      deployerCanceller,
      minimumDelaySeconds: minDelay.toString(),
    },
    wiring: {
      governorToken,
      governorTimelock,
      policyGovernance,
      guardGovernance,
      guardPolicyRegistry,
      guardPaused,
    },
    roleRevocations,
    checks,
    allPassed: Object.values(checks).every(Boolean),
    privateKeyReceived: false,
    signerCustody: false,
    aeosBroadcastCapability: false,
    assetExecutionAuthorized: false,
  };

  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  return report;
}

if (require.main === module) {
  const rpcUrl = process.argv[2];
  verifyGovernanceStackFinality(rpcUrl)
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (!report.allPassed) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = { verifyGovernanceStackFinality };
