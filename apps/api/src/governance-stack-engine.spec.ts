import { AbiCoder, Interface, getCreateAddress, keccak256 } from "ethers";
import {
  CANCELLER_ROLE,
  DEFAULT_ADMIN_ROLE,
  GOVERNANCE_STACK_CHAIN_ID,
  OPEN_EXECUTOR,
  PROPOSER_ROLE,
  buildGovernanceStackDeploymentPlan,
} from "./governance-stack-engine";

const artifact = (contract: string) => ({
  contract,
  source: `contracts/src/${contract}.sol`,
  compiler: "0.8.28",
  creationBytecode: `0x60${contract.length.toString(16).padStart(2, "0")}6000`,
  runtimeBytecode: `0x61${contract.length.toString(16).padStart(4, "0")}6000`,
});

const input = () => ({
  chainId: GOVERNANCE_STACK_CHAIN_ID,
  deployer: "0x1111111111111111111111111111111111111111",
  guardian: "0x2222222222222222222222222222222222222222",
  pendingNonce: 7,
  initialSupply: "1000000000000000000000000",
  timelockDelaySeconds: 60,
  votingDelayBlocks: 1,
  votingPeriodBlocks: 8,
  proposalThreshold: "0",
  quorumNumerator: 4,
  artifacts: {
    token: artifact("AEOSGovernanceToken"),
    timelock: artifact("TimelockController"),
    governor: artifact("AEOSGovernor"),
    policyRegistry: artifact("PolicyRegistry"),
    treasuryGuard: artifact("TreasuryGuard"),
  },
});

describe("governance stack deployment plan", () => {
  it("freezes five deployments and fail-closed role handoffs without authority", () => {
    const plan = buildGovernanceStackDeploymentPlan(input());
    expect(plan.deploymentTransactions).toHaveLength(5);
    expect(plan.roleTransactions).toHaveLength(3);
    expect(plan.deploymentTransactions.map((tx) => tx.nonce)).toEqual([7, 8, 9, 10, 11]);
    expect(plan.roleTransactions.map((tx) => tx.nonce)).toEqual([12, 13, 14]);
    expect(plan.addresses.governor).toBe(
      getCreateAddress({ from: input().deployer, nonce: 9 }).toLowerCase(),
    );
    expect(plan.deploymentTransactions.every((tx) => tx.to === null && tx.value === "0x0")).toBe(true);
    expect(plan.roleTransactions.every((tx) => tx.to === plan.addresses.timelock && tx.value === "0x0")).toBe(true);
    expect(plan.safe.status).toBe("EXTERNAL_PENDING");
    expect(plan.signed).toBe(false);
    expect(plan.submitted).toBe(false);
    expect(plan.containsPrivateKey).toBe(false);
    expect(plan.aeosSigningCapability).toBe(false);
    expect(plan.aeosBroadcastCapability).toBe(false);
    expect(plan.assetExecutionAuthorized).toBe(false);
  });

  it("encodes exact timelock constructor and terminal admin renunciation", () => {
    const plan = buildGovernanceStackDeploymentPlan(input());
    const timelockArtifact = input().artifacts.timelock.creationBytecode;
    const constructorData = `0x${plan.deploymentTransactions[1].data.slice(timelockArtifact.length)}`;
    const decoded = AbiCoder.defaultAbiCoder().decode(
      ["uint256", "address[]", "address[]", "address"],
      constructorData,
    );
    expect(decoded[0]).toBe(60n);
    expect(Array.from(decoded[1])).toEqual([]);
    expect(Array.from(decoded[2]).map(String)).toEqual([OPEN_EXECUTOR]);
    expect(String(decoded[3]).toLowerCase()).toBe(input().deployer.toLowerCase());

    const access = new Interface([
      "function grantRole(bytes32 role,address account)",
      "function renounceRole(bytes32 role,address callerConfirmation)",
    ]);
    const first = access.decodeFunctionData("grantRole", plan.roleTransactions[0].data);
    const second = access.decodeFunctionData("grantRole", plan.roleTransactions[1].data);
    const last = access.decodeFunctionData("renounceRole", plan.roleTransactions[2].data);
    expect(first[0]).toBe(PROPOSER_ROLE);
    expect(String(first[1]).toLowerCase()).toBe(plan.addresses.governor);
    expect(second[0]).toBe(CANCELLER_ROLE);
    expect(last[0]).toBe(DEFAULT_ADMIN_ROLE);
    expect(String(last[1]).toLowerCase()).toBe(input().deployer.toLowerCase());
  });

  it("is deterministic and every nonce drift changes the plan", () => {
    const first = buildGovernanceStackDeploymentPlan(input());
    const second = buildGovernanceStackDeploymentPlan(input());
    expect(second.planHash).toBe(first.planHash);
    expect(second.deploymentTransactions.map((tx) => keccak256(tx.data))).toEqual(
      first.deploymentTransactions.map((tx) => keccak256(tx.data)),
    );
    const drifted = input();
    drifted.pendingNonce += 1;
    const changed = buildGovernanceStackDeploymentPlan(drifted);
    expect(changed.planHash).not.toBe(first.planHash);
    expect(changed.addresses).not.toEqual(first.addresses);
  });

  it.each([
    ["wrong chain", { chainId: 1 }],
    ["zero guardian", { guardian: OPEN_EXECUTOR }],
    ["short timelock", { timelockDelaySeconds: 59 }],
    ["zero voting delay", { votingDelayBlocks: 0 }],
    ["zero voting period", { votingPeriodBlocks: 0 }],
    ["zero quorum", { quorumNumerator: 0 }],
    ["invalid nonce", { pendingNonce: -1 }],
  ])("rejects %s", (_name, override) => {
    expect(() => buildGovernanceStackDeploymentPlan({ ...input(), ...override })).toThrow();
  });
});
