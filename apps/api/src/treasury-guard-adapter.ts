import { Contract, JsonRpcProvider, getAddress } from "ethers";

export const TREASURY_GUARD_ADAPTER = Symbol("TREASURY_GUARD_ADAPTER");
export type GuardReadInput = { actionId: string; target: string; selector: string };
export type GuardSnapshot = { mode: "mock"|"evm-readonly"; chainId: number|null; address: string|null; policyRegistry: string|null; paused: boolean; policyHash: string|null; policyVersion: number|null; policyValidFrom: number|null; policyValidUntil: number|null; registryPolicyHash: string|null; registryPolicyValidFrom: number|null; registryPolicyValidUntil: number|null; policyRegistryBindingVerified: boolean; targetAllowed: boolean; selectorAllowed: boolean; actionConsumed: boolean; blockNumber: number|null; blockHash: string|null; confirmations: number; onchainReadVerified: boolean; assetExecutionAuthorized: false };
export interface TreasuryGuardReadAdapter { readonly mode: "mock"|"evm-readonly"; readonly provider: string; configuration(): Record<string, unknown>; read(input: GuardReadInput): Promise<GuardSnapshot>; }

export class MockTreasuryGuardReadAdapter implements TreasuryGuardReadAdapter {
  readonly mode = "mock" as const; readonly provider = "mock-treasury-guard-paused-v1";
  configuration() { return { mode: this.mode, provider: this.provider, paused: true, readsOnly: true, signsTransactions: false, submitsTransactions: false, assetExecutionAuthorized: false }; }
  async read(_input: GuardReadInput): Promise<GuardSnapshot> { return { mode: this.mode, chainId: null, address: null, policyRegistry:null, paused: true, policyHash: null, policyVersion: null, policyValidFrom:null, policyValidUntil:null, registryPolicyHash:null, registryPolicyValidFrom:null, registryPolicyValidUntil:null, policyRegistryBindingVerified:false, targetAllowed: false, selectorAllowed: false, actionConsumed: false, blockNumber: null, blockHash: null, confirmations: 0, onchainReadVerified: false, assetExecutionAuthorized: false }; }
}

export class EvmTreasuryGuardReadAdapter implements TreasuryGuardReadAdapter {
  readonly mode = "evm-readonly" as const; readonly provider = "evm-treasury-guard-readonly-v1";
  private readonly rpc: JsonRpcProvider; private readonly guard: Contract; readonly address: string;
  constructor(rpcUrl: string, readonly chainId: number, guardAddress: string, readonly confirmationLag = 2) {
    if (!rpcUrl || !Number.isInteger(chainId) || chainId <= 0 || !Number.isInteger(confirmationLag) || confirmationLag < 1) throw new Error("Valid TREASURY_GUARD_RPC_URL, chain ID and confirmation lag are required");
    this.address = getAddress(guardAddress).toLowerCase(); this.rpc = new JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true });
    this.guard = new Contract(this.address, ["function policyRegistry() view returns(address)","function paused() view returns(bool)","function policyHash() view returns(bytes32)","function policyVersion() view returns(uint64)","function policyValidFrom() view returns(uint64)","function policyValidUntil() view returns(uint64)","function allowedTarget(address) view returns(bool)","function allowedSelector(bytes4) view returns(bool)","function consumedAction(bytes32) view returns(bool)"], this.rpc);
  }
  configuration() { return { mode: this.mode, provider: this.provider, chainId: this.chainId, address: this.address, confirmationLag: this.confirmationLag, readsOnly: true, signsTransactions: false, submitsTransactions: false, assetExecutionAuthorized: false }; }
  async read(input: GuardReadInput): Promise<GuardSnapshot> {
    const [network, latest] = await Promise.all([this.rpc.getNetwork(), this.rpc.getBlockNumber()]); if (Number(network.chainId) !== this.chainId) throw new Error("TREASURY_GUARD_CHAIN_MISMATCH");
    const safeNumber = latest - this.confirmationLag; if (safeNumber < 0) throw new Error("TREASURY_GUARD_NOT_CONFIRMED"); const block = await this.rpc.getBlock(safeNumber); if (!block?.hash) throw new Error("TREASURY_GUARD_SAFE_BLOCK_NOT_FOUND");
    const options = { blockTag: safeNumber };
    const [policyRegistry,paused, policyHash, version,validFrom,validUntil, targetAllowed, selectorAllowed, actionConsumed] = await Promise.all([this.guard.policyRegistry.staticCall(options),this.guard.paused.staticCall(options), this.guard.policyHash.staticCall(options), this.guard.policyVersion.staticCall(options),this.guard.policyValidFrom.staticCall(options),this.guard.policyValidUntil.staticCall(options), this.guard.allowedTarget.staticCall(input.target, options), this.guard.allowedSelector.staticCall(input.selector, options), this.guard.consumedAction.staticCall(input.actionId, options)]);
    const normalizedRegistry = getAddress(policyRegistry).toLowerCase();
    const registry = new Contract(normalizedRegistry, ["function policy(uint64) view returns(tuple(bytes32 policyHash,uint64 validFrom,uint64 validUntil))"], this.rpc);
    const registryPolicy = await registry.policy.staticCall(version, options);
    const normalizedPolicyHash = String(policyHash).toLowerCase();
    const registryPolicyHash = String(registryPolicy.policyHash).toLowerCase();
    const policyValidFrom = Number(validFrom), policyValidUntil = Number(validUntil);
    const registryPolicyValidFrom = Number(registryPolicy.validFrom), registryPolicyValidUntil = Number(registryPolicy.validUntil);
    const policyRegistryBindingVerified = normalizedPolicyHash === registryPolicyHash && policyValidFrom === registryPolicyValidFrom && policyValidUntil === registryPolicyValidUntil;
    return { mode: this.mode, chainId: this.chainId, address: this.address, policyRegistry:normalizedRegistry,paused, policyHash: normalizedPolicyHash, policyVersion: Number(version),policyValidFrom,policyValidUntil,registryPolicyHash,registryPolicyValidFrom,registryPolicyValidUntil,policyRegistryBindingVerified, targetAllowed, selectorAllowed, actionConsumed, blockNumber: safeNumber, blockHash: block.hash.toLowerCase(), confirmations: this.confirmationLag, onchainReadVerified: true, assetExecutionAuthorized: false };
  }
}

export function createTreasuryGuardAdapterFromEnvironment(): TreasuryGuardReadAdapter {
  const mode = (process.env.TREASURY_GUARD_ADAPTER ?? "mock").toLowerCase(); if (mode === "mock") return new MockTreasuryGuardReadAdapter();
  if (mode === "evm-readonly") return new EvmTreasuryGuardReadAdapter(process.env.TREASURY_GUARD_RPC_URL ?? "", Number(process.env.TREASURY_GUARD_CHAIN_ID), process.env.TREASURY_GUARD_ADDRESS ?? "", Number(process.env.TREASURY_GUARD_CONFIRMATION_LAG ?? 2));
  throw new Error(`Unsupported TREASURY_GUARD_ADAPTER: ${mode}`);
}
