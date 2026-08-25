import { AbiCoder, Interface, keccak256 } from "ethers";
import { buildBalanceObservationRequest, buildBalanceObservationRequestFromCommitments, buildBalanceObserverDeploymentPlan, verifyBalanceObservationReceipt, verifyBalanceObserverDeploymentReadback } from "./balance-observer-engine";

const reporter = "0x1111111111111111111111111111111111111111";
const observer = "0x2222222222222222222222222222222222222222";
const token = "0x3333333333333333333333333333333333333333";
const account = "0x4444444444444444444444444444444444444444";
const runtime = "0x60016000";

describe("AEOS Balance Observer deployment", () => {
  const base = { chainId: 11155111, reporter, creationBytecode: "0x60006000", runtimeBytecode: runtime, artifactCompiler: "0.8.28", artifactSource: "contracts/src/AEOSBalanceObserver.sol" };
  it("builds deterministic zero-value unsigned init code", () => {
    const first = buildBalanceObserverDeploymentPlan(base);
    expect(first).toEqual(buildBalanceObserverDeploymentPlan(base));
    expect(first).toEqual(expect.objectContaining({ chainId: 11155111, signed: false, submitted: false, aeosSigningCapability: false, aeosBroadcastCapability: false, assetExecutionAuthorized: false }));
    expect(first.unsignedTransaction).toEqual(expect.objectContaining({ to: null, value: "0" }));
  });
  it("rejects wrong chain, zero reporter, and malformed bytecode", () => {
    expect(() => buildBalanceObserverDeploymentPlan({ ...base, chainId: 1 })).toThrow("CHAIN_INVALID");
    expect(() => buildBalanceObserverDeploymentPlan({ ...base, reporter: "0x0000000000000000000000000000000000000000" })).toThrow("REPORTER_INVALID");
    expect(() => buildBalanceObserverDeploymentPlan({ ...base, runtimeBytecode: "0x" })).toThrow("BYTECODE_INVALID");
  });
  it("fails deployment readback closed on runtime, reporter, value, receipt, or finality drift", () => {
    const plan = buildBalanceObserverDeploymentPlan(base);
    const readback = { expectedChainId: 11155111, actualChainId: 11155111, expectedReporter: reporter, actualReporter: reporter, expectedInitCodeHash: plan.unsignedTransaction.initCodeHash, expectedRuntimeBytecodeHash: plan.artifact.runtimeBytecodeTemplateHash, deploymentTransactionData: plan.unsignedTransaction.data, deploymentTransactionTo: null, deploymentTransactionValue: "0", deploymentTransactionHash: `0x${"55".repeat(32)}`, receiptStatus: 1, receiptTo: null, receiptContractAddress: observer, receiptBlockNumber: 10, latestBlockNumber: 11, minimumConfirmations: 2, address: observer, runtimeBytecode: runtime };
    expect(verifyBalanceObserverDeploymentReadback(readback)).toEqual(expect.objectContaining({ status: "VERIFIED", assetExecutionAuthorized: false }));
    for (const changed of [{ actualChainId: 1 }, { actualReporter: account }, { runtimeBytecode: "0x60026000" }, { deploymentTransactionValue: "1" }, { receiptStatus: 0 }, { latestBlockNumber: 10 }]) expect(verifyBalanceObserverDeploymentReadback({ ...readback, ...changed } as any).status).toBe("REJECTED");
  });
});

describe("AEOS Balance Observer request and receipt", () => {
  const request = buildBalanceObservationRequest({ chainId: 11155111, observerContract: observer, reporter, organizationId: "org_alpha", treasuryId: "treasury_core", observationKey: "usdc-balance-1", token, account, tokenRuntimeBytecode: runtime });
  const txHash = `0x${"12".repeat(32)}`;
  const blockHash = `0x${"34".repeat(32)}`;
  const blockNumber = 100;
  const observedAt = 1_700_000_000;
  const balance = "20000000";
  const commitment = keccak256(AbiCoder.defaultAbiCoder().encode(
    ["uint256", "address", "bytes32", "bytes32", "bytes32", "address", "address", "bytes32", "uint256", "uint256", "uint64", "address"],
    [request.chainId, request.observerContract, request.observation.observationId, request.observation.organizationCommitment, request.observation.treasuryCommitment, request.observation.token, request.observation.account, request.observation.tokenCodeHash, balance, blockNumber, observedAt, request.reporter],
  ));
  const iface = new Interface(["event BalanceObserved(bytes32 indexed observationId,bytes32 indexed organizationCommitment,bytes32 indexed treasuryCommitment,address token,address account,bytes32 tokenCodeHash,uint256 balance,uint256 sourceBlockNumber,uint64 observedAt,address reporter,uint256 sourceChainId,bytes32 commitment)"]);
  const event = iface.encodeEventLog(iface.getEvent("BalanceObserved")!, [request.observation.observationId, request.observation.organizationCommitment, request.observation.treasuryCommitment, token, account, request.observation.tokenCodeHash, balance, blockNumber, observedAt, reporter, 11155111, commitment]);
  const observed = {
    request, expectedTransactionHash: txHash, expectedNonce: 7, minimumConfirmations: 2,
    transaction: { hash: txHash, from: reporter, to: observer, data: request.unsignedTransaction.data, value: "0", nonce: 7 },
    receipt: { hash: txHash, status: 1, from: reporter, to: observer, blockNumber, blockHash, logs: [{ address: observer, topics: event.topics, data: event.data }] },
    latestBlockNumber: 101, canonicalBlockHash: blockHash, canonicalBlockTimestamp: observedAt, tokenRuntimeBytecode: runtime, storedCommitment: commitment, storedBalance: balance,
  };
  it("freezes token identity and produces only an unsigned zero-value request", () => {
    expect(request).toEqual(expect.objectContaining({ chainId: 11155111, signed: false, submitted: false, assetExecutionAuthorized: false }));
    expect(request.unsignedTransaction).toEqual(expect.objectContaining({ from: reporter, to: observer, value: "0" }));
    expect(request.truthBoundary.priceVerified).toBe(false);
  });
  it("verifies calldata, finality, event, token code, and storage readback", () => {
    expect(verifyBalanceObservationReceipt(observed)).toEqual(expect.objectContaining({ status: "VERIFIED", balanceBaseUnits: balance, assetExecutionAuthorized: false }));
  });
  it("fails closed on transaction, finality, runtime, event, or storage drift", () => {
    for (const changed of [
      { transaction: { ...observed.transaction, data: "0x1234" } },
      { latestBlockNumber: 100 },
      { tokenRuntimeBytecode: "0x60026000" },
      { receipt: { ...observed.receipt, logs: [] } },
      { storedBalance: "19999999" },
    ]) expect(verifyBalanceObservationReceipt({ ...observed, ...changed } as any).status).toBe("REJECTED");
  });
  it("domain-separates tenants and rejects invalid token code", () => {
    const other = buildBalanceObservationRequest({ chainId: 11155111, observerContract: observer, reporter, organizationId: "org_beta", treasuryId: "treasury_core", observationKey: "usdc-balance-1", token, account, tokenRuntimeBytecode: runtime });
    expect(other.observation.observationId).not.toBe(request.observation.observationId);
    expect(() => buildBalanceObservationRequest({ chainId: 11155111, observerContract: observer, reporter, organizationId: "org_alpha", treasuryId: "treasury_core", observationKey: "usdc-balance-1", token, account, tokenRuntimeBytecode: "0x" })).toThrow("TOKEN_CODE_INVALID");
  });
  it("accepts frozen tenant commitments without exposing raw tenant identifiers", () => {
    const frozen = buildBalanceObservationRequestFromCommitments({ chainId: 11155111, observerContract: observer, reporter, observationKey: "usdc-balance-1", token, account, tokenRuntimeBytecode: runtime, organizationCommitment: request.observation.organizationCommitment, treasuryCommitment: request.observation.treasuryCommitment });
    expect(frozen.observation).toEqual(request.observation);
    expect(JSON.stringify(frozen)).not.toContain("org_alpha");
    expect(() => buildBalanceObservationRequestFromCommitments({ chainId: 11155111, observerContract: observer, reporter, observationKey: "usdc-balance-1", token, account, tokenRuntimeBytecode: runtime, organizationCommitment: "0x12", treasuryCommitment: request.observation.treasuryCommitment })).toThrow("TENANT_COMMITMENT_INVALID");
  });
});
