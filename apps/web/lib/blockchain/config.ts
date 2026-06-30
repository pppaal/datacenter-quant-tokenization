import type { Address, Hex } from 'viem';
import { env } from '@/lib/env';
import { isBlockchainDisabled, isTokenizationMockMode } from './mock-mode';

export type BlockchainConfig = {
  chainId: number;
  chainName: string;
  /** Primary RPC URL — kept for backwards-compat in places that log a single value. */
  rpcUrl: string;
  /** Ordered list of RPC URLs (rpcUrl + any extras from BLOCKCHAIN_RPC_URLS). */
  rpcUrls: string[];
  registryAddress: Address;
  privateKey: Hex;
  metadataBaseUrl: string;
};

const MOCK_PRIVATE_KEY: Hex = '0x0000000000000000000000000000000000000000000000000000000000000001';
const MOCK_REGISTRY_ADDRESS: Address = '0x000000000000000000000000000000000000dEaD';

function requireValue(value: string | undefined, name: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${name} is required for blockchain registry actions.`);
  }

  return trimmed;
}

function normalizeHex(value: string, expectedBytes: number, label: string): Hex {
  const normalized = value.startsWith('0x') ? value : `0x${value}`;
  const pattern = new RegExp(`^0x[a-fA-F0-9]{${expectedBytes * 2}}$`);

  if (!pattern.test(normalized)) {
    throw new Error(`${label} must be a 0x-prefixed ${expectedBytes}-byte hex value.`);
  }

  return normalized as Hex;
}

/**
 * Resolve the ordered RPC URL list. Primary URL comes from BLOCKCHAIN_RPC_URL;
 * additional fallback endpoints (Alchemy / Infura / self-hosted) are read from
 * BLOCKCHAIN_RPC_URLS as a comma-separated list. Duplicates are de-duplicated
 * while preserving primary-first order so the fallback transport prefers the
 * configured primary and only fans out on failure.
 */
function resolveRpcUrls(primary: string): string[] {
  const extras = (env().BLOCKCHAIN_RPC_URLS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const ordered = [primary, ...extras];
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const url of ordered) {
    if (seen.has(url)) continue;
    seen.add(url);
    deduped.push(url);
  }
  return deduped;
}

export function getBlockchainConfig(): BlockchainConfig {
  const config = env();

  // On-chain layer explicitly turned off: refuse to build a config so any
  // tokenization/registry call fails with a clear, actionable message rather
  // than a confusing "RPC required" deep in a write path.
  if (isBlockchainDisabled()) {
    throw new Error(
      'On-chain features are disabled (BLOCKCHAIN_DISABLED=true). Unset it and configure ' +
        'BLOCKCHAIN_RPC_URL + BLOCKCHAIN_PRIVATE_KEY + BLOCKCHAIN_REGISTRY_ADDRESS to enable tokenization.'
    );
  }

  const metadataBaseUrl = (
    config.BLOCKCHAIN_METADATA_BASE_URL ??
    config.APP_BASE_URL ??
    'http://localhost:3000'
  )
    .trim()
    .replace(/\/$/, '');

  if (isTokenizationMockMode()) {
    const rpcUrl = config.BLOCKCHAIN_RPC_URL?.trim() ?? 'http://localhost:0';
    return {
      chainId: config.BLOCKCHAIN_CHAIN_ID ?? 31337,
      chainName: config.BLOCKCHAIN_CHAIN_NAME?.trim() ?? 'mock-registry',
      rpcUrl,
      rpcUrls: resolveRpcUrls(rpcUrl),
      registryAddress:
        (config.BLOCKCHAIN_REGISTRY_ADDRESS?.trim() as Address | undefined) ??
        MOCK_REGISTRY_ADDRESS,
      privateKey: MOCK_PRIVATE_KEY,
      metadataBaseUrl
    };
  }

  const chainId = config.BLOCKCHAIN_CHAIN_ID;
  if (chainId === undefined) {
    throw new Error('BLOCKCHAIN_CHAIN_ID is required for blockchain registry actions.');
  }
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error('BLOCKCHAIN_CHAIN_ID must be a positive integer.');
  }

  const rpcUrl = requireValue(config.BLOCKCHAIN_RPC_URL, 'BLOCKCHAIN_RPC_URL');
  return {
    chainId,
    chainName: requireValue(config.BLOCKCHAIN_CHAIN_NAME, 'BLOCKCHAIN_CHAIN_NAME'),
    rpcUrl,
    rpcUrls: resolveRpcUrls(rpcUrl),
    registryAddress: normalizeHex(
      requireValue(config.BLOCKCHAIN_REGISTRY_ADDRESS, 'BLOCKCHAIN_REGISTRY_ADDRESS'),
      20,
      'BLOCKCHAIN_REGISTRY_ADDRESS'
    ) as Address,
    privateKey: normalizeHex(
      requireValue(config.BLOCKCHAIN_PRIVATE_KEY, 'BLOCKCHAIN_PRIVATE_KEY'),
      32,
      'BLOCKCHAIN_PRIVATE_KEY'
    ),
    metadataBaseUrl
  };
}
