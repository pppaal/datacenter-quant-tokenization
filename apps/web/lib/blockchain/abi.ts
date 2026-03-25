export const dataCenterAssetRegistryAbi = [
  {
    type: 'constructor',
    inputs: [{ name: 'initialOwner', internalType: 'address', type: 'address' }],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'assets',
    inputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    outputs: [
      { name: 'assetId', internalType: 'bytes32', type: 'bytes32' },
      { name: 'metadataRef', internalType: 'string', type: 'string' },
      { name: 'active', internalType: 'bool', type: 'bool' },
      { name: 'registeredAt', internalType: 'uint256', type: 'uint256' }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'anchoredDocumentHashes',
    inputs: [
      { name: '', internalType: 'bytes32', type: 'bytes32' },
      { name: '', internalType: 'bytes32', type: 'bytes32' }
    ],
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'registerAsset',
    inputs: [
      { name: 'assetId', internalType: 'bytes32', type: 'bytes32' },
      { name: 'metadataRef', internalType: 'string', type: 'string' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'updateAssetMetadata',
    inputs: [
      { name: 'assetId', internalType: 'bytes32', type: 'bytes32' },
      { name: 'metadataRef', internalType: 'string', type: 'string' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'anchorDocumentHash',
    inputs: [
      { name: 'assetId', internalType: 'bytes32', type: 'bytes32' },
      { name: 'documentHash', internalType: 'bytes32', type: 'bytes32' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  }
] as const;
