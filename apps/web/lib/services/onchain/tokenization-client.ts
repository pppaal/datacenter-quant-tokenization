import type { Address, Hex } from 'viem';
import { getRegistryChainClients } from '@/lib/blockchain/client';
import {
  assetTokenAbi,
  identityRegistryAbi,
  modularComplianceAbi,
  countryRestrictModuleAbi
} from '@/lib/blockchain/tokenization-abi';

/**
 * Shape of a TokenizedAsset DB row that the service layer needs to talk to
 * the onchain stack. The prisma row is the canonical source of deployment
 * addresses; services accept this struct rather than re-fetching themselves
 * so that callers can batch reads and control transactionality.
 */
export type TokenizationDeploymentRow = {
  chainId: number;
  tokenAddress: Address;
  identityRegistryAddress: Address;
  complianceAddress: Address;
  countryRestrictModuleAddress: Address | null;
};

/**
 * Build a typed viem client bundle bound to a specific tokenization
 * deployment. Re-uses the same wallet/public client as the registry layer —
 * the agent EOA configured in `BLOCKCHAIN_PRIVATE_KEY` is expected to hold
 * `AGENT_ROLE` / `IDENTITY_MANAGER_ROLE` / `COMPLIANCE_ADMIN_ROLE` on the
 * deployed contracts. On production the agent role can be split across
 * multiple signer services; this helper keeps them co-located for the
 * operator console MVP.
 */
export function getTokenizationClients(deployment: TokenizationDeploymentRow) {
  const base = getRegistryChainClients();
  if (base.config.chainId !== deployment.chainId) {
    throw new Error(
      `Chain mismatch: BLOCKCHAIN_CHAIN_ID=${base.config.chainId} but deployment is on chain ${deployment.chainId}.`
    );
  }
  return {
    ...base,
    deployment,
    token: { address: deployment.tokenAddress, abi: assetTokenAbi } as const,
    identity: { address: deployment.identityRegistryAddress, abi: identityRegistryAbi } as const,
    compliance: { address: deployment.complianceAddress, abi: modularComplianceAbi } as const,
    countryRestrict:
      deployment.countryRestrictModuleAddress !== null
        ? ({
            address: deployment.countryRestrictModuleAddress,
            abi: countryRestrictModuleAbi
          } as const)
        : null
  };
}

export function ensureAddress(value: string, label: string): Address {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${label} must be a 20-byte 0x-prefixed address.`);
  }
  return value as Address;
}

export function ensureBytes32(value: string, label: string): Hex {
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a 32-byte 0x-prefixed hex value.`);
  }
  return value as Hex;
}

export function ensureCountryCode(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0 || value > 65535) {
    throw new Error(`${label} must be an ISO 3166-1 numeric code in 1..65535.`);
  }
  return value;
}
