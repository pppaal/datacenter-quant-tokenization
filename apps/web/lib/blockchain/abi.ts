/**
 * Hand-curated ABI subset for the DataCenterAssetRegistry that the web app
 * actually invokes. Keeping this small and `as const` lets viem fully infer
 * function arg / return types. Regenerate when the contract surface changes
 * by referencing `packages/contracts/artifacts/.../DataCenterAssetRegistry.json`.
 */
export const dataCenterAssetRegistryAbi = [
  {
    type: 'function',
    name: 'getAsset',
    stateMutability: 'view',
    inputs: [{ name: 'assetId', type: 'bytes32' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'assetId', type: 'bytes32' },
          { name: 'metadataRef', type: 'string' },
          { name: 'status', type: 'uint8' },
          { name: 'registeredAt', type: 'uint64' },
          { name: 'lastUpdatedAt', type: 'uint64' },
          { name: 'documentCount', type: 'uint32' }
        ]
      }
    ]
  },
  {
    type: 'function',
    name: 'getDocument',
    stateMutability: 'view',
    inputs: [
      { name: 'assetId', type: 'bytes32' },
      { name: 'documentHash', type: 'bytes32' }
    ],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'documentHash', type: 'bytes32' },
          { name: 'anchoredAt', type: 'uint64' },
          { name: 'revokedAt', type: 'uint64' },
          { name: 'anchoredBy', type: 'address' }
        ]
      }
    ]
  },
  {
    type: 'function',
    name: 'isDocumentAnchored',
    stateMutability: 'view',
    inputs: [
      { name: 'assetId', type: 'bytes32' },
      { name: 'documentHash', type: 'bytes32' }
    ],
    outputs: [{ type: 'bool' }]
  },
  {
    type: 'function',
    name: 'registerAsset',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assetId', type: 'bytes32' },
      { name: 'metadataRef', type: 'string' }
    ],
    outputs: []
  },
  {
    type: 'function',
    name: 'updateAssetMetadata',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assetId', type: 'bytes32' },
      { name: 'metadataRef', type: 'string' }
    ],
    outputs: []
  },
  {
    type: 'function',
    name: 'anchorDocumentHash',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assetId', type: 'bytes32' },
      { name: 'documentHash', type: 'bytes32' }
    ],
    outputs: []
  },
  {
    type: 'function',
    name: 'revokeDocumentHash',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assetId', type: 'bytes32' },
      { name: 'documentHash', type: 'bytes32' },
      { name: 'reason', type: 'string' }
    ],
    outputs: []
  },
  {
    type: 'function',
    name: 'setAssetStatus',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assetId', type: 'bytes32' },
      { name: 'newStatus', type: 'uint8' }
    ],
    outputs: []
  }
] as const;

/**
 * Mirrors the `IAssetRegistry.AssetStatus` enum on chain. The ordinals must
 * stay in lockstep with the Solidity enum or `getAsset(...).status` reads
 * will misinterpret returned values.
 */
export const ASSET_STATUS = {
  Unregistered: 0,
  Active: 1,
  Suspended: 2,
  Retired: 3
} as const;

export type AssetStatus = (typeof ASSET_STATUS)[keyof typeof ASSET_STATUS];

/**
 * On-chain `AssetRecord` struct projected into TypeScript.
 */
export type OnchainAssetRecord = {
  assetId: `0x${string}`;
  metadataRef: string;
  status: AssetStatus;
  registeredAt: bigint;
  lastUpdatedAt: bigint;
  documentCount: number;
};

/**
 * On-chain `DocumentRecord` struct projected into TypeScript.
 */
export type OnchainDocumentRecord = {
  documentHash: `0x${string}`;
  anchoredAt: bigint;
  revokedAt: bigint;
  anchoredBy: `0x${string}`;
};
