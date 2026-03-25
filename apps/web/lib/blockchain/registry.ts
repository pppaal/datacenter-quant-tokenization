import { keccak256, stringToHex, type Hex } from 'viem';

export function buildRegistryAssetId(assetCode: string): Hex {
  const normalizedAssetCode = assetCode.trim().toUpperCase();
  if (!normalizedAssetCode) {
    throw new Error('Asset code is required to derive an onchain registry id.');
  }

  return keccak256(stringToHex(normalizedAssetCode));
}

export function normalizeDocumentHash(documentHash: string): Hex {
  const normalized = documentHash.startsWith('0x') ? documentHash : `0x${documentHash}`;

  if (!/^0x[a-fA-F0-9]{64}$/.test(normalized)) {
    throw new Error('Document hash must be a 32-byte SHA-256 hex string.');
  }

  return normalized as Hex;
}

export function buildRegistryMetadataRef(assetId: string, baseUrl: string) {
  return `${baseUrl.replace(/\/$/, '')}/api/readiness/assets/${assetId}`;
}

export function shortenHash(hash?: string | null, size = 10) {
  if (!hash) return 'Pending';
  if (hash.length <= size * 2) return hash;
  return `${hash.slice(0, size)}...${hash.slice(-size)}`;
}
