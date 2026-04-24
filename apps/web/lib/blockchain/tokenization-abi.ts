import { keccak256, stringToHex } from 'viem';
import abis from './tokenization-abi.json';

type AbiEntry = {
  type: string;
  name?: string;
  inputs?: readonly unknown[];
  outputs?: readonly unknown[];
  stateMutability?: string;
};

const cast = (v: unknown) => v as readonly AbiEntry[];

// ABIs bundled at build time from `packages/contracts/artifacts/...`. Regenerate by
// running `npm run contracts:export-abi` from the repo root after touching any
// tokenization contract.
export const assetTokenAbi = cast(abis.assetToken);
export const identityRegistryAbi = cast(abis.identityRegistry);
export const modularComplianceAbi = cast(abis.modularCompliance);
export const maxHoldersModuleAbi = cast(abis.maxHolders);
export const countryRestrictModuleAbi = cast(abis.countryRestrict);
export const lockupModuleAbi = cast(abis.lockup);
export const navOracleAbi = cast(abis.navOracle);
export const dividendDistributorAbi = cast(abis.dividendDistributor);
export const transferAgentAbi = cast(abis.transferAgent);

/**
 * Computed role identifiers for the tokenization layer. The contracts use
 * `keccak256("ROLE_NAME")`, so consumers can compare with these constants
 * without re-running the hash.
 */
export const TOKENIZATION_ROLE_IDS = {
  DEFAULT_ADMIN_ROLE: ('0x' + '00'.repeat(32)) as `0x${string}`,
  AGENT_ROLE: keccak256(stringToHex('AGENT_ROLE')),
  PAUSER_ROLE: keccak256(stringToHex('PAUSER_ROLE')),
  IDENTITY_MANAGER_ROLE: keccak256(stringToHex('IDENTITY_MANAGER_ROLE')),
  COMPLIANCE_ADMIN_ROLE: keccak256(stringToHex('COMPLIANCE_ADMIN_ROLE')),
  OPERATOR_ROLE: keccak256(stringToHex('OPERATOR_ROLE')),
  ISSUER_ROLE: keccak256(stringToHex('ISSUER_ROLE'))
} as const;

export type ComplianceModuleKind = 'maxHolders' | 'countryRestrict' | 'lockup';
