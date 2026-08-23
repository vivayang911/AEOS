import { ServiceUnavailableException } from "@nestjs/common";
import { Interface } from "ethers";
import { BLOCK_PROVER_ADDRESS, CHAIN_INFO_ADDRESS, CREDITCOIN_TESTNET_CHAIN_ID, MockOnlyAttestcoinAdapter, PROOF_BUILDER_URL, UscAttestcoinAdapter, buildUscVerificationRequest, createAttestcoinAdapterFromEnvironment } from "./attestcoin-adapter";

describe("Attestcoin adapter guardrails", () => {
  const proof = { chainKey: 1, headerNumber: 123, txIndex: 0, txHash: `0x${"11".repeat(32)}`, txBytes: "0x01", merkleProof: { root: `0x${"22".repeat(32)}`, siblings: [] }, continuityProof: { lowerEndpointDigest: `0x${"33".repeat(32)}`, roots: [] }, cached: false, generatedAt: "2026-01-01T00:00:00.000Z" };

  it("builds a narrowly-scoped unsigned wallet request and never exposes signing authority", () => {
    const adapter = new UscAttestcoinAdapter("https://sepolia.invalid");
    const request = adapter.buildVerificationRequest(proof, "0x444D510728FB8072351cB5d0E88432e6a8501DFA");
    expect(request).toEqual(expect.objectContaining({ chainId: CREDITCOIN_TESTNET_CHAIN_ID, from: "0x444d510728fb8072351cb5d0e88432e6a8501dfa", to: BLOCK_PROVER_ADDRESS.toLowerCase(), value: "0x0" }));
    expect(request.data).toMatch(/^0x[0-9a-f]+$/);
    expect(JSON.stringify(request)).not.toMatch(/private|mnemonic|signature|rawTransaction/i);
  });

  it("encodes the standard USC verifyAndEmit call from the frozen proof", () => {
    const request = buildUscVerificationRequest(proof, "0x444D510728FB8072351cB5d0E88432e6a8501DFA");
    const parsed = new Interface(["function verifyAndEmit(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[])) returns (bool)"]).parseTransaction({ data: request.data, value: 0n });
    expect(parsed?.name).toBe("verifyAndEmit");
    expect(parsed?.args[0]).toBe(1n);
    expect(parsed?.args[1]).toBe(123n);
    expect(parsed?.args[2]).toBe(proof.txBytes);
    expect(() => buildUscVerificationRequest({ ...proof, chainKey: 3 }, request.from)).toThrow("PROOF_SOURCE_CHAIN_KEY_MISMATCH");
    expect(() => buildUscVerificationRequest(proof, "not-an-address")).toThrow();
  });

  it("keeps real network operations fail-closed in default mock mode", async () => {
    await expect(new MockOnlyAttestcoinAdapter().inspectSourceTransaction(`0x${"11".repeat(32)}`)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("reports Mock source support as unobserved instead of copying a claimed live list", async () => {
    await expect(new MockOnlyAttestcoinAdapter().sourceChainStatus()).resolves.toEqual(expect.objectContaining({ observedOnChain: false, sourceSupported: false, supportedChains: [], selected: null, chainInfoPrecompile: CHAIN_INFO_ADDRESS, assetExecutionAuthorized: false }));
  });

  it("derives supported source chains and latest attestation from ChainInfo readback", async () => {
    const adapter = new UscAttestcoinAdapter("https://sepolia.invalid") as any;
    adapter.creditcoin = { getNetwork: jest.fn().mockResolvedValue({ chainId: BigInt(CREDITCOIN_TESTNET_CHAIN_ID) }) };
    adapter.chainInfoProvider = { getSupportedChains: jest.fn().mockResolvedValue([{ chainKey: 3, chainId: 1, chainName: "0x457468657265756d", chainEncoding: 1 }, { chainKey: 1, chainId: 11155111, chainName: "0x5365706f6c696120657468657265756d", chainEncoding: 1 }]), getLatestAttestedHeightAndHash: jest.fn().mockResolvedValue({ height: 123, hash: `0x${"44".repeat(32)}`, exists: true, isAttestation: true }) };
    await expect(adapter.sourceChainStatus()).resolves.toEqual(expect.objectContaining({ observedOnChain: true, sourceSupported: true, supportedChains: [{ chainKey: 3, chainId: 1, chainName: "Ethereum", chainEncoding: 1 }, { chainKey: 1, chainId: 11155111, chainName: "Sepolia ethereum", chainEncoding: 1 }], selected: expect.objectContaining({ chainKey: 1, chainId: 11155111, latestAttestedHeight: 123, latestAttestationExists: true }), assetExecutionAuthorized: false }));
    expect(adapter.configuration()).toEqual(expect.objectContaining({ proofBuilder: PROOF_BUILDER_URL, sourceSupportAuthority: "CHAIN_INFO_PRECOMPILE_READ" }));
  });

  it("accepts only a canonical, confirmed verifyAndEmit receipt with the matching event", async () => {
    const adapter = new UscAttestcoinAdapter("https://sepolia.invalid") as any;
    const request = buildUscVerificationRequest(proof, "0x444D510728FB8072351cB5d0E88432e6a8501DFA");
    const txHash = `0x${"55".repeat(32)}`;
    const blockHash = `0x${"66".repeat(32)}`;
    const eventInterface = new Interface(["event TransactionVerified(uint64 indexed chainKey,uint64 indexed height,uint64 transactionIndex)"]);
    const event = eventInterface.encodeEventLog(eventInterface.getEvent("TransactionVerified")!, [1, 123, 0]);
    const receipt = {
      hash: txHash,
      blockNumber: 100,
      blockHash,
      from: request.from,
      to: request.to,
      status: 1,
      logs: [{ address: request.to, topics: event.topics, data: event.data }],
    };
    adapter.creditcoin = {
      getNetwork: jest.fn().mockResolvedValue({ chainId: BigInt(CREDITCOIN_TESTNET_CHAIN_ID) }),
      getTransactionReceipt: jest.fn().mockResolvedValue(receipt),
      getTransaction: jest.fn().mockResolvedValue({ from: request.from, to: request.to, data: request.data, value: 0n }),
      getBlockNumber: jest.fn().mockResolvedValue(102),
      getBlock: jest.fn().mockResolvedValue({ hash: blockHash }),
    };

    await expect(adapter.inspectVerificationTransaction(txHash, request)).resolves.toEqual(expect.objectContaining({
      transactionHash: txHash,
      confirmations: 3,
      canonicalBlockVerified: true,
      calldataVerified: true,
      zeroValueVerified: true,
      transactionVerifiedEvent: true,
      transactionVerified: { chainKey: 1, height: 123, transactionIndex: 0 },
    }));

    adapter.creditcoin.getTransaction.mockResolvedValueOnce({ from: request.from, to: request.to, data: `${request.data.slice(0, -2)}${request.data.endsWith("00") ? "01" : "00"}`, value: 0n });
    await expect(adapter.inspectVerificationTransaction(txHash, request)).rejects.toThrow("VERIFICATION_TRANSACTION_MISMATCH");

    adapter.creditcoin.getBlockNumber.mockResolvedValueOnce(100);
    await expect(adapter.inspectVerificationTransaction(txHash, request)).rejects.toThrow("VERIFICATION_TRANSACTION_NOT_FINALIZED");

    adapter.creditcoin.getBlock.mockResolvedValueOnce({ hash: `0x${"77".repeat(32)}` });
    await expect(adapter.inspectVerificationTransaction(txHash, request)).rejects.toThrow("VERIFICATION_CANONICAL_BLOCK_MISMATCH");

    const wrongEvent = eventInterface.encodeEventLog(eventInterface.getEvent("TransactionVerified")!, [1, 124, 0]);
    adapter.creditcoin.getTransactionReceipt.mockResolvedValueOnce({ ...receipt, logs: [{ address: request.to, topics: wrongEvent.topics, data: wrongEvent.data }] });
    await expect(adapter.inspectVerificationTransaction(txHash, request)).rejects.toThrow("VERIFICATION_EVENT_MISSING_OR_MISMATCH");
  });

  it("rejects unknown adapter modes instead of silently enabling network access", () => {
    const previous = process.env.ATTESTCOIN_ADAPTER;
    process.env.ATTESTCOIN_ADAPTER = "unsafe";
    expect(() => createAttestcoinAdapterFromEnvironment()).toThrow("Unsupported ATTESTCOIN_ADAPTER");
    if (previous === undefined) delete process.env.ATTESTCOIN_ADAPTER; else process.env.ATTESTCOIN_ADAPTER = previous;
  });
});
