import { ServiceUnavailableException } from "@nestjs/common";
import { blockProver, chainInfo, proofProvider } from "@gluwa/usc-sdk";
import { getAddress, Interface, JsonRpcProvider, TransactionReceipt, toUtf8String } from "ethers";

export const ATTESTCOIN_ADAPTER = Symbol("ATTESTCOIN_ADAPTER");
export const SEPOLIA_CHAIN_ID = 11155111;
export const ETHEREUM_SEPOLIA_CHAIN_KEY = 1;
export const CREDITCOIN_TESTNET_CHAIN_ID = 102031;
export const CREDITCOIN_RPC_URL = "https://rpc.cc3-testnet.creditcoin.network/";
export const PROOF_BUILDER_URL = "https://prover.cc3-testnet.creditcoin.network/";
export const BLOCK_PROVER_ADDRESS = blockProver.BLOCK_PROVER_PRECOMPILE_ADDRESS;
export const CHAIN_INFO_ADDRESS = chainInfo.CHAIN_INFO_PRECOMPILE_ADDRESS;

export type SourceTransactionSnapshot = {
  chainId: number; chainKey: number; transactionHash: string; blockNumber: number;
  blockHash: string; from: string; to: string | null; value: string; data: string;
  status: number; observedAt: string;
};
export type UscProofSnapshot = {
  chainKey: number; headerNumber: number; txIndex: number; txHash: string; txBytes: string;
  continuityProof: { lowerEndpointDigest: string; roots: string[] };
  merkleProof: { root: string; siblings: { hash: string; isLeft: boolean }[] };
  cached: boolean; generatedAt: string;
};
export type WalletTransactionRequest = { chainId: number; from: string; to: string; data: string; value: "0x0" };
export type VerificationReceiptSnapshot = { chainId: number; transactionHash: string; blockNumber: number; blockHash: string; from: string; to: string; status: number; confirmations: number; canonicalBlockVerified: true; calldataVerified: true; zeroValueVerified: true; transactionVerifiedEvent: true; transactionVerified: { chainKey: number; height: number; transactionIndex: number } };
export type SourceChainStatus = {
  schemaVersion: "attestcoin.source-chain-status.v1"; observedOnChain: boolean; targetChainId: number;
  chainInfoPrecompile: string; expectedSourceChainId: number; expectedSourceChainKey: number;
  sourceSupported: boolean; supportedChains: Array<{ chainKey: number; chainId: number; chainName: string; chainEncoding: number }>;
  selected: null | { chainKey: number; chainId: number; chainName: string; chainEncoding: number; latestAttestedHeight: number; latestAttestedHash: string; latestAttestationExists: boolean };
  observedAt: string | null; signerCustody: false; assetExecutionAuthorized: false;
};

export interface AttestcoinAdapter {
  readonly mode: "mock" | "usc";
  readonly provider: string;
  configuration(): Record<string, unknown>;
  health(): Promise<Record<string, unknown>>;
  sourceChainStatus(): Promise<SourceChainStatus>;
  inspectSourceTransaction(transactionHash: string): Promise<SourceTransactionSnapshot>;
  fetchAndVerifyProof(source: SourceTransactionSnapshot): Promise<UscProofSnapshot>;
  buildVerificationRequest(proof: UscProofSnapshot, requesterWallet: string): WalletTransactionRequest;
  inspectVerificationTransaction(transactionHash: string, expected: WalletTransactionRequest): Promise<VerificationReceiptSnapshot>;
}

const VERIFY_AND_EMIT_ABI = [
  "function verifyAndEmit(uint64 chainKey,uint64 height,bytes encodedTransaction,(bytes32 root,(bytes32 hash,bool isLeft)[] siblings) merkleProof,(bytes32 lowerEndpointDigest,bytes32[] roots) continuityProof) returns (bool)",
  "event TransactionVerified(uint64 indexed chainKey,uint64 indexed height,uint64 transactionIndex)",
];
const iface = new Interface(VERIFY_AND_EMIT_ABI);

export function buildUscVerificationRequest(proof: UscProofSnapshot, requesterWallet: string): WalletTransactionRequest {
  if (proof.chainKey !== ETHEREUM_SEPOLIA_CHAIN_KEY) throw new Error("PROOF_SOURCE_CHAIN_KEY_MISMATCH");
  if (!Number.isSafeInteger(proof.headerNumber) || proof.headerNumber <= 0) throw new Error("PROOF_HEADER_NUMBER_INVALID");
  const from = getAddress(requesterWallet).toLowerCase();
  const data = iface.encodeFunctionData("verifyAndEmit(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))", [proof.chainKey, proof.headerNumber, proof.txBytes, proof.merkleProof, proof.continuityProof]);
  return { chainId: CREDITCOIN_TESTNET_CHAIN_ID, from, to: BLOCK_PROVER_ADDRESS.toLowerCase(), data, value: "0x0" };
}

export class UscAttestcoinAdapter implements AttestcoinAdapter {
  readonly mode = "usc" as const;
  readonly provider = "attestcoin-usc-sdk-0.18.0";
  private readonly source: JsonRpcProvider;
  private readonly creditcoin: JsonRpcProvider;
  private readonly builder: proofProvider.service.ProofBuilder;
  private readonly prover: blockProver.PrecompileBlockProver;
  private readonly chainInfoProvider: chainInfo.PrecompileChainInfoProvider;
  constructor(sourceRpcUrl: string, creditcoinRpcUrl = CREDITCOIN_RPC_URL, proofBuilderUrl = PROOF_BUILDER_URL) {
    if (!sourceRpcUrl) throw new Error("SEPOLIA_RPC_URL is required when ATTESTCOIN_ADAPTER=usc");
    this.source = new JsonRpcProvider(sourceRpcUrl, SEPOLIA_CHAIN_ID, { staticNetwork: true });
    this.creditcoin = new JsonRpcProvider(creditcoinRpcUrl, CREDITCOIN_TESTNET_CHAIN_ID, { staticNetwork: true });
    this.builder = new proofProvider.service.ProofBuilder(ETHEREUM_SEPOLIA_CHAIN_KEY, proofBuilderUrl, 15_000);
    this.prover = new blockProver.PrecompileBlockProver(this.creditcoin);
    this.chainInfoProvider = new chainInfo.PrecompileChainInfoProvider(this.creditcoin);
  }
  configuration() { return { mode: this.mode, provider: this.provider, sourceChainId: SEPOLIA_CHAIN_ID, sourceChainKey: ETHEREUM_SEPOLIA_CHAIN_KEY, targetChainId: CREDITCOIN_TESTNET_CHAIN_ID, proofBuilder: PROOF_BUILDER_URL, blockProver: BLOCK_PROVER_ADDRESS, chainInfoPrecompile: CHAIN_INFO_ADDRESS, sourceSupportAuthority: "CHAIN_INFO_PRECOMPILE_READ", signerCustody: false, assetExecutionAuthorized: false }; }
  async health() { return { provider: this.provider, configured: true, status: "UNKNOWN_UNTIL_BOUNDED_CALL", externalProbePerformed: false, signerCustody: false, assetExecutionAuthorized: false }; }
  async sourceChainStatus(): Promise<SourceChainStatus> {
    const network = await this.creditcoin.getNetwork();
    if (Number(network.chainId) !== CREDITCOIN_TESTNET_CHAIN_ID) throw new Error("CREDITCOIN_CHAIN_MISMATCH");
    const supported = await this.chainInfoProvider.getSupportedChains();
    const supportedChains = supported.map((entry) => ({ ...entry, chainName: decodeChainName(entry.chainName) }));
    const configured = supportedChains.find((entry) => entry.chainKey === ETHEREUM_SEPOLIA_CHAIN_KEY && entry.chainId === SEPOLIA_CHAIN_ID) ?? null;
    const latest = configured ? await this.chainInfoProvider.getLatestAttestedHeightAndHash(configured.chainKey) : null;
    return { schemaVersion: "attestcoin.source-chain-status.v1", observedOnChain: true, targetChainId: CREDITCOIN_TESTNET_CHAIN_ID, chainInfoPrecompile: CHAIN_INFO_ADDRESS, expectedSourceChainId: SEPOLIA_CHAIN_ID, expectedSourceChainKey: ETHEREUM_SEPOLIA_CHAIN_KEY, sourceSupported: Boolean(configured && latest?.exists), supportedChains, selected: configured && latest ? { ...configured, latestAttestedHeight: latest.height, latestAttestedHash: latest.hash.toLowerCase(), latestAttestationExists: latest.exists } : null, observedAt: new Date().toISOString(), signerCustody: false, assetExecutionAuthorized: false };
  }
  async inspectSourceTransaction(transactionHash: string): Promise<SourceTransactionSnapshot> {
    const sourceStatus = await this.sourceChainStatus();
    if (!sourceStatus.sourceSupported) throw new Error("SOURCE_CHAIN_NOT_SUPPORTED");
    const [network, receipt, transaction] = await Promise.all([this.source.getNetwork(), this.source.getTransactionReceipt(transactionHash), this.source.getTransaction(transactionHash)]);
    if (Number(network.chainId) !== SEPOLIA_CHAIN_ID) throw new Error("SOURCE_CHAIN_MISMATCH");
    if (!receipt || !transaction || receipt.status !== 1 || transaction.blockNumber == null) throw new Error("SOURCE_TRANSACTION_NOT_FINALIZED");
    const block = await this.source.getBlock(transaction.blockNumber);
    if (!block) throw new Error("SOURCE_BLOCK_NOT_FOUND");
    return { chainId: SEPOLIA_CHAIN_ID, chainKey: ETHEREUM_SEPOLIA_CHAIN_KEY, transactionHash: transaction.hash.toLowerCase(), blockNumber: transaction.blockNumber, blockHash: receipt.blockHash.toLowerCase(), from: transaction.from.toLowerCase(), to: transaction.to?.toLowerCase() ?? null, value: transaction.value.toString(), data: transaction.data, status: receipt.status, observedAt: new Date(block.timestamp * 1000).toISOString() };
  }
  async fetchAndVerifyProof(source: SourceTransactionSnapshot): Promise<UscProofSnapshot> {
    const sourceStatus = await this.sourceChainStatus();
    if (!sourceStatus.sourceSupported || !sourceStatus.selected) throw new Error("SOURCE_CHAIN_NOT_SUPPORTED");
    if (sourceStatus.selected.latestAttestedHeight < source.blockNumber) throw new Error("PROOF_NOT_READY:SOURCE_HEIGHT_NOT_ATTESTED");
    const result = await this.builder.getProof(source.transactionHash);
    if (!result.success || !result.data) throw new Error(`PROOF_NOT_READY:${result.error ?? "unknown"}`);
    const data = result.data;
    if (data.chainKey !== ETHEREUM_SEPOLIA_CHAIN_KEY || data.headerNumber !== source.blockNumber || data.txHash.toLowerCase() !== source.transactionHash) throw new Error("PROOF_SOURCE_MISMATCH");
    const verified = await this.prover.verifySingle(data.chainKey, data.headerNumber, data.txBytes, data.merkleProof, data.continuityProof);
    if (!verified) throw new Error("PROOF_STATIC_VERIFICATION_FAILED");
    return { ...data, txHash: data.txHash.toLowerCase(), generatedAt: new Date(data.generatedAt).toISOString() };
  }
  buildVerificationRequest(proof: UscProofSnapshot, requesterWallet: string): WalletTransactionRequest {
    return buildUscVerificationRequest(proof, requesterWallet);
  }
  async inspectVerificationTransaction(transactionHash: string, expected: WalletTransactionRequest): Promise<VerificationReceiptSnapshot> {
    const [network, receipt, transaction, latestBlockNumber] = await Promise.all([this.creditcoin.getNetwork(), this.creditcoin.getTransactionReceipt(transactionHash), this.creditcoin.getTransaction(transactionHash), this.creditcoin.getBlockNumber()]);
    if (Number(network.chainId) !== CREDITCOIN_TESTNET_CHAIN_ID || !receipt || !transaction || receipt.status !== 1) throw new Error("VERIFICATION_TRANSACTION_NOT_FINALIZED");
    if (transaction.from.toLowerCase() !== expected.from || transaction.to?.toLowerCase() !== expected.to || transaction.data.toLowerCase() !== expected.data.toLowerCase() || transaction.value !== 0n) throw new Error("VERIFICATION_TRANSACTION_MISMATCH");
    const confirmations = latestBlockNumber - receipt.blockNumber + 1;
    if (confirmations < 2) throw new Error("VERIFICATION_TRANSACTION_NOT_FINALIZED");
    const canonicalBlock = await this.creditcoin.getBlock(receipt.blockNumber);
    if (!canonicalBlock || canonicalBlock.hash?.toLowerCase() !== receipt.blockHash.toLowerCase()) throw new Error("VERIFICATION_CANONICAL_BLOCK_MISMATCH");
    const call = iface.parseTransaction({ data: expected.data, value: 0n });
    if (!call || call.name !== "verifyAndEmit") throw new Error("VERIFICATION_REQUEST_CALLDATA_INVALID");
    const expectedEvent = { chainKey: Number(call.args[0]), height: Number(call.args[1]) };
    let observed: { chainKey: number; height: number; transactionIndex: number } | null = null;
    for (const log of receipt.logs) { try { const parsed = log.address.toLowerCase() === expected.to ? iface.parseLog({ topics: [...log.topics], data: log.data }) : null; if (parsed?.name === "TransactionVerified") observed = { chainKey: Number(parsed.args[0]), height: Number(parsed.args[1]), transactionIndex: Number(parsed.args[2]) }; } catch { /* fail closed below */ } }
    if (!observed || observed.chainKey !== expectedEvent.chainKey || observed.height !== expectedEvent.height) throw new Error("VERIFICATION_EVENT_MISSING_OR_MISMATCH");
    return this.mapReceipt(receipt, confirmations, observed);
  }
  private mapReceipt(receipt: TransactionReceipt, confirmations: number, transactionVerified: { chainKey: number; height: number; transactionIndex: number }): VerificationReceiptSnapshot { return { chainId: CREDITCOIN_TESTNET_CHAIN_ID, transactionHash: receipt.hash.toLowerCase(), blockNumber: receipt.blockNumber, blockHash: receipt.blockHash.toLowerCase(), from: receipt.from.toLowerCase(), to: (receipt.to ?? BLOCK_PROVER_ADDRESS).toLowerCase(), status: receipt.status ?? 0, confirmations, canonicalBlockVerified: true, calldataVerified: true, zeroValueVerified: true, transactionVerifiedEvent: true, transactionVerified }; }
}

export class MockOnlyAttestcoinAdapter implements AttestcoinAdapter {
  readonly mode = "mock" as const; readonly provider = "mock-attestcoin";
  configuration() { return { mode: this.mode, provider: this.provider, realUscEnabled: false, signerCustody: false, assetExecutionAuthorized: false, note: "Set ATTESTCOIN_ADAPTER=usc and SEPOLIA_RPC_URL to enable real proof jobs" }; }
  async health() { return { provider: this.provider, configured: true, status: "MOCK_ONLY_DISABLED", externalProbePerformed: false, signerCustody: false, assetExecutionAuthorized: false }; }
  async sourceChainStatus(): Promise<SourceChainStatus> { return { schemaVersion: "attestcoin.source-chain-status.v1", observedOnChain: false, targetChainId: CREDITCOIN_TESTNET_CHAIN_ID, chainInfoPrecompile: CHAIN_INFO_ADDRESS, expectedSourceChainId: SEPOLIA_CHAIN_ID, expectedSourceChainKey: ETHEREUM_SEPOLIA_CHAIN_KEY, sourceSupported: false, supportedChains: [], selected: null, observedAt: null, signerCustody: false, assetExecutionAuthorized: false }; }
  private unavailable(): never { throw new ServiceUnavailableException("Real USC adapter is disabled; Mock Evidence ingestion remains available at /evidence/mock-ingest"); }
  async inspectSourceTransaction(_transactionHash: string): Promise<SourceTransactionSnapshot> { return this.unavailable(); }
  async fetchAndVerifyProof(_source: SourceTransactionSnapshot): Promise<UscProofSnapshot> { return this.unavailable(); }
  buildVerificationRequest(_proof: UscProofSnapshot, _requesterWallet: string): WalletTransactionRequest { return this.unavailable(); }
  async inspectVerificationTransaction(_transactionHash: string, _expected: WalletTransactionRequest): Promise<VerificationReceiptSnapshot> { return this.unavailable(); }
}

function decodeChainName(value: string) { try { return /^0x[0-9a-f]+$/i.test(value) ? toUtf8String(value) : value; } catch { return value; } }

export function createAttestcoinAdapterFromEnvironment(): AttestcoinAdapter {
  const mode = (process.env.ATTESTCOIN_ADAPTER ?? "mock").toLowerCase();
  if (mode === "mock") return new MockOnlyAttestcoinAdapter();
  if (mode === "usc") return new UscAttestcoinAdapter(process.env.SEPOLIA_RPC_URL ?? "", process.env.CREDITCOIN_RPC_URL, process.env.ATTESTCOIN_PROOF_BUILDER_URL);
  throw new Error(`Unsupported ATTESTCOIN_ADAPTER: ${mode}`);
}
