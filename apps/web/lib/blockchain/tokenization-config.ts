import type { Address } from 'viem';

/**
 * Per-asset tokenization deployment manifest. The web app reads this from the
 * `TokenizedAsset` Prisma table — DB columns are the source of truth so
 * operators can rotate identity/compliance addresses on a token without
 * redeploying the app.
 */
export type TokenizationDeployment = {
  assetId: string;
  registryAssetId: `0x${string}`;
  tokenAddress: Address;
  identityRegistryAddress: Address;
  complianceAddress: Address;
  modules: {
    maxHolders?: Address;
    countryRestrict?: Address;
    lockup?: Address;
  };
  deploymentBlock: number;
};

/**
 * Caller-provided KYC payload bridged from an off-chain provider (Sumsub /
 * Jumio). The provider's webhook handler validates the signature; this type
 * is what reaches the on-chain identity registry write path.
 */
export type KycRegistrationInput = {
  wallet: Address;
  countryCode: number; // ISO 3166-1 numeric
  externalRef: string; // provider-side applicant id, persisted for audit
};
