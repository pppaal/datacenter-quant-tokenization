import type { Address, Hex } from 'viem';
import { isTokenizationMockMode } from './mock-mode';

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

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for blockchain registry actions.`);
  }

  return value;
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
  const extras = (process.env.BLOCKCHAIN_RPC_URLS ?? '')
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
  const metadataBaseUrl = (
    process.env.BLOCKCHAIN_METADATA_BASE_URL ??
    process.env.APP_BASE_URL ??
    'http://localhost:3000'
  )
    .trim()
    .replace(/\/$/, '');

  if (isTokenizationMockMode()) {
    const rpcUrl = process.env.BLOCKCHAIN_RPC_URL?.trim() ?? 'http://localhost:0';
    return {
      chainId: Number(process.env.BLOCKCHAIN_CHAIN_ID?.trim() ?? '31337'),
      chainName: process.env.BLOCKCHAIN_CHAIN_NAME?.trim() ?? 'mock-registry',
      rpcUrl,
      rpcUrls: resolveRpcUrls(rpcUrl),
      registryAddress:
        (process.env.BLOCKCHAIN_REGISTRY_ADDRESS?.trim() as Address | undefined) ??
        MOCK_REGISTRY_ADDRESS,
      privateKey: MOCK_PRIVATE_KEY,
      metadataBaseUrl
    };
  }

  const chainId = Number(readRequiredEnv('BLOCKCHAIN_CHAIN_ID'));
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error('BLOCKCHAIN_CHAIN_ID must be a positive integer.');
  }

  const rpcUrl = readRequiredEnv('BLOCKCHAIN_RPC_URL');
  return {
    chainId,
    chainName: readRequiredEnv('BLOCKCHAIN_CHAIN_NAME'),
    rpcUrl,
    rpcUrls: resolveRpcUrls(rpcUrl),
    registryAddress: normalizeHex(
      readRequiredEnv('BLOCKCHAIN_REGISTRY_ADDRESS'),
      20,
      'BLOCKCHAIN_REGISTRY_ADDRESS'
    ) as Address,
    privateKey: normalizeHex(
      readRequiredEnv('BLOCKCHAIN_PRIVATE_KEY'),
      32,
      'BLOCKCHAIN_PRIVATE_KEY'
    ),
    metadataBaseUrl
  };
}
