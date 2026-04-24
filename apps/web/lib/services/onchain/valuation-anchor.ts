import { keccak256, stringToHex, type Hex } from 'viem';
import {
  ASSET_STATUS,
  dataCenterAssetRegistryAbi,
  type OnchainAssetRecord
} from '@/lib/blockchain/abi';
import { getRegistryChainClients } from '@/lib/blockchain/client';
import { buildRegistryAssetId } from '@/lib/blockchain/registry';
import { canonicalizeToJson } from './canonicalize';
import { pinCanonicalJson } from './ipfs';

export type ValuationAnchorRequest = {
  /** Human-readable asset code; the registry key is derived via keccak256. */
  assetCode: string;
  /** Any JSON-serializable valuation payload; ordering of keys is normalized. */
  valuation: unknown;
  /**
   * Optional label persisted in the off-chain filename. The hash is computed
   * over the canonical JSON only, so changing the label does not change the hash.
   */
  label?: string;
};

export type ValuationAnchorResult = {
  assetCode: string;
  registryAssetId: Hex;
  documentHash: Hex;
  canonicalBytes: number;
  ipfs: { cid: string; url: string } | null;
  txHash: Hex | null;
  alreadyAnchored: boolean;
};

/**
 * Canonicalize a valuation payload, hash it, optionally pin to IPFS, and anchor
 * the resulting document hash against the asset's on-chain registry record.
 *
 * The operation is idempotent: if the hash is already anchored (and not revoked)
 * the contract reports it via `isDocumentAnchored` and we skip the write.
 */
export async function anchorValuationOnchain(
  request: ValuationAnchorRequest
): Promise<ValuationAnchorResult> {
  const canonical = canonicalizeToJson(request.valuation);
  const canonicalBytes = Buffer.byteLength(canonical, 'utf8');
  const documentHash = keccak256(stringToHex(canonical));
  const registryAssetId = buildRegistryAssetId(request.assetCode);

  const { config, account, publicClient, walletClient } = getRegistryChainClients();

  const onchainAsset = (await publicClient.readContract({
    address: config.registryAddress,
    abi: dataCenterAssetRegistryAbi,
    functionName: 'getAsset',
    args: [registryAssetId]
  })) as OnchainAssetRecord;

  if (onchainAsset.status === ASSET_STATUS.Unregistered) {
    throw new Error(
      `Asset ${request.assetCode} is not registered onchain. Register it before anchoring valuations.`
    );
  }
  if (onchainAsset.status !== ASSET_STATUS.Active) {
    throw new Error(
      `Asset ${request.assetCode} is ${statusLabel(onchainAsset.status)} onchain; anchoring blocked.`
    );
  }

  const alreadyAnchored = (await publicClient.readContract({
    address: config.registryAddress,
    abi: dataCenterAssetRegistryAbi,
    functionName: 'isDocumentAnchored',
    args: [registryAssetId, documentHash]
  })) as boolean;

  const fileName = buildValuationFileName(request, documentHash);
  const ipfs = alreadyAnchored ? null : await pinCanonicalJson(fileName, canonical);

  let txHash: Hex | null = null;
  if (!alreadyAnchored) {
    const simulation = await publicClient.simulateContract({
      account,
      address: config.registryAddress,
      abi: dataCenterAssetRegistryAbi,
      functionName: 'anchorDocumentHash',
      args: [registryAssetId, documentHash]
    });
    txHash = (await walletClient.writeContract(simulation.request)) as Hex;
    await publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  return {
    assetCode: request.assetCode,
    registryAssetId,
    documentHash,
    canonicalBytes,
    ipfs,
    txHash,
    alreadyAnchored
  };
}

function statusLabel(status: number): string {
  switch (status) {
    case ASSET_STATUS.Suspended:
      return 'suspended';
    case ASSET_STATUS.Retired:
      return 'retired';
    default:
      return `status=${status}`;
  }
}

function buildValuationFileName(request: ValuationAnchorRequest, documentHash: Hex): string {
  const slug = (request.label ?? 'valuation').replace(/[^a-zA-Z0-9._-]+/g, '-');
  return `${request.assetCode}-${slug}-${documentHash.slice(2, 10)}.json`;
}
