import { getAddress } from "ethers";
import { hashValue } from "./decision-engine";

export interface OrganizationConfigurationInput {
  networkName: string; chainId: number; governorAddress: string; timelockAddress: string;
  safeAddress: string; treasuryAddress: string; treasuryGuardAddress: string; blockExplorerUrl?: string;
}
export interface OrganizationConfiguration {
  schemaVersion: "organization.configuration.v1"; networkName: string; chainId: number;
  governorAddress: string; timelockAddress: string; safeAddress: string; treasuryAddress: string;
  treasuryGuardAddress: string; blockExplorerUrl: string | null;
}

export function normalizeOrganizationConfiguration(input: OrganizationConfigurationInput): OrganizationConfiguration {
  if (!Number.isSafeInteger(input.chainId) || input.chainId <= 0 || input.chainId > 2147483647) throw new Error("INVALID_CHAIN_ID");
  const networkName = input.networkName.trim();
  if (networkName.length < 2 || networkName.length > 80 || /[<>]/.test(networkName)) throw new Error("INVALID_NETWORK_NAME");
  const config: OrganizationConfiguration = {
    schemaVersion: "organization.configuration.v1", networkName, chainId: input.chainId,
    governorAddress: getAddress(input.governorAddress), timelockAddress: getAddress(input.timelockAddress),
    safeAddress: getAddress(input.safeAddress), treasuryAddress: getAddress(input.treasuryAddress),
    treasuryGuardAddress: getAddress(input.treasuryGuardAddress), blockExplorerUrl: input.blockExplorerUrl?.replace(/\/$/, "") ?? null
  };
  const controlAddresses = [config.governorAddress, config.timelockAddress, config.safeAddress, config.treasuryGuardAddress].map((value) => value.toLowerCase());
  if (new Set(controlAddresses).size !== controlAddresses.length) throw new Error("CONTROL_CONTRACT_ADDRESSES_MUST_BE_DISTINCT");
  if (config.blockExplorerUrl && !/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[^\s<>]*)?$/i.test(config.blockExplorerUrl)) throw new Error("INVALID_BLOCK_EXPLORER_URL");
  return config;
}

export const organizationConfigurationHash = (config: OrganizationConfiguration) => hashValue(config);

export function buildOrganizationConfigurationApprovalMessage(input: { organizationId: string; walletAddress: string; contentHash: string; nonce: string; issuedAt: Date; expiresAt: Date }) {
  return `AEOS organization configuration approval\n\nOrganization: ${input.organizationId}\nAdministrator: ${getAddress(input.walletAddress)}\nContent Hash: ${input.contentHash}\nNonce: ${input.nonce}\nIssued At: ${input.issuedAt.toISOString()}\nExpiration Time: ${input.expiresAt.toISOString()}\n\nThis signature approves only this configuration snapshot. It does not authorize any transaction or asset action.`;
}
