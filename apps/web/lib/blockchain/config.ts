import type { Address, Hex } from 'viem';

export type BlockchainConfig = {
  chainId: number;
  chainName: string;
  rpcUrl: string;
  registryAddress: Address;
  privateKey: Hex;
  metadataBaseUrl: string;
};

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

export function getBlockchainConfig(): BlockchainConfig {
  const chainId = Number(readRequiredEnv('BLOCKCHAIN_CHAIN_ID'));
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error('BLOCKCHAIN_CHAIN_ID must be a positive integer.');
  }

  const metadataBaseUrl = (process.env.BLOCKCHAIN_METADATA_BASE_URL ?? process.env.APP_BASE_URL ?? 'http://localhost:3000')
    .trim()
    .replace(/\/$/, '');

  return {
    chainId,
    chainName: readRequiredEnv('BLOCKCHAIN_CHAIN_NAME'),
    rpcUrl: readRequiredEnv('BLOCKCHAIN_RPC_URL'),
    registryAddress: normalizeHex(readRequiredEnv('BLOCKCHAIN_REGISTRY_ADDRESS'), 20, 'BLOCKCHAIN_REGISTRY_ADDRESS') as Address,
    privateKey: normalizeHex(readRequiredEnv('BLOCKCHAIN_PRIVATE_KEY'), 32, 'BLOCKCHAIN_PRIVATE_KEY'),
    metadataBaseUrl
  };
}
