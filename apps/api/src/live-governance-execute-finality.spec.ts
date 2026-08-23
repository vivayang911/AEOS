import { keccak256 } from "ethers";
import { ExecuteArtifact, ExecuteObservation, verifyRecoveryExecuteFinality } from "./live-governance-execute-finality";

const h = (c: string) => `0x${c.repeat(64)}`;
const governor = "0x1111111111111111111111111111111111111111";
const timelock = "0x2222222222222222222222222222222222222222";
const guard = "0x3333333333333333333333333333333333333333";
const from = "0x4444444444444444444444444444444444444444";
const actionData = "0xe540d01d00000000000000000000000000000000000000000000000000000000000000f0";
const executeData = "0x1234";
const frozen: ExecuteArtifact = {
  artifactHash: h("a"),
  lineage: { queueArtifactHash: h("b"), queueTransactionHash: h("c"), proposalId: "123", timelockOperationId: h("d") },
  proposal: { targets: [governor], values: ["0"], calldatas: [actionData], descriptionHash: h("e"), action: { previousVotingPeriodBlocks: 8, newVotingPeriodBlocks: 240 } },
  unsignedTransaction: { chainId: 102031, from, to: governor, value: "0x0", data: executeData, dataHash: keccak256(executeData) },
};
const observation = (): ExecuteObservation => ({
  chainId: 102031,
  latestBlock: 110,
  transaction: { hash: h("f"), from, to: governor, value: "0", data: executeData, status: 1, blockNumber: 100, blockHash: h("1"), canonicalBlockHash: h("1"), canonicalTransactionHashes: [h("f")] },
  proposalExecuted: { address: governor, proposalId: "123" },
  callExecuted: { address: timelock, operationId: h("d"), index: "0", target: governor, value: "0", data: actionData },
  governance: { state: 7, votingPeriodBlocks: "240" },
  timelock: { address: timelock, timestamp: "1", pending: false, ready: false, done: true },
  treasuryGuard: { address: guard, paused: true },
});
describe("recovery Execute finality", () => {
  it("verifies exact Execute, Timelock completion and period readback", () => {
    expect(verifyRecoveryExecuteFinality(frozen, observation())).toMatchObject({
      status: "RECOVERY_EXECUTED",
      governance: { state: "Executed", votingPeriodBlocks: 240 },
      timelock: { done: true },
      treasuryGuard: { paused: true },
      checks: { treasuryAssetMovement: false },
      controls: { assetExecutionAuthorized: false },
    });
  });
  it("rejects mutated execution events", () => {
    expect(() => verifyRecoveryExecuteFinality(frozen, { ...observation(), callExecuted: { ...observation().callExecuted, data: "0x5678" } })).toThrow("GOVERNANCE_EXECUTE_TIMELOCK_EVENT_INVALID");
  });
  it("rejects incomplete Timelock and unsafe Guard state", () => {
    expect(() => verifyRecoveryExecuteFinality(frozen, { ...observation(), timelock: { ...observation().timelock, done: false, timestamp: "2" } })).toThrow("GOVERNANCE_EXECUTE_STATE_INVALID");
    expect(() => verifyRecoveryExecuteFinality(frozen, { ...observation(), treasuryGuard: { address: guard, paused: false } })).toThrow("GOVERNANCE_EXECUTE_GUARD_NOT_PAUSED");
  });
});
