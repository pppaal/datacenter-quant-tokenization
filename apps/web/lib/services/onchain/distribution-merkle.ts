import { encodeAbiParameters, keccak256, parseAbiParameters, type Hex } from 'viem';

/**
 * Merkle tree builder for the on-chain `DividendDistributor.claim` proof.
 *
 * Leaf encoding matches the contract: `keccak256(keccak256(abi.encode(addr, amount)))`.
 * Pairs are sort-ordered before hashing so OpenZeppelin's `MerkleProof.verify`
 * (which uses sorted-pair semantics by default) accepts the resulting proofs.
 */
export type AllocationLeaf = { holder: `0x${string}`; amount: bigint };

export type MerkleBuild = {
  root: Hex;
  proofs: Map<string, Hex[]>; // key: lower-cased holder
  totalAmount: bigint;
};

const ADDR_UINT_PARAMS = parseAbiParameters('address,uint256');

export function leafHash(leaf: AllocationLeaf): Hex {
  const inner = keccak256(encodeAbiParameters(ADDR_UINT_PARAMS, [leaf.holder, leaf.amount]));
  return keccak256(inner);
}

function hashPair(a: Hex, b: Hex): Hex {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  // 2 packed bytes32 → keccak256
  const concat = (lo + hi.slice(2)) as Hex;
  return keccak256(concat);
}

export function buildAllocationTree(leaves: AllocationLeaf[]): MerkleBuild {
  if (leaves.length === 0) throw new Error('At least one allocation leaf is required');
  const seen = new Set<string>();
  for (const l of leaves) {
    const k = l.holder.toLowerCase();
    if (seen.has(k)) throw new Error(`Duplicate holder in allocations: ${l.holder}`);
    seen.add(k);
    if (l.amount <= 0n) throw new Error(`Allocation amount must be positive for ${l.holder}`);
  }

  const hashed = leaves.map(leafHash);
  const layers: Hex[][] = [hashed.slice()];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next: Hex[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      next.push(i + 1 === prev.length ? prev[i] : hashPair(prev[i], prev[i + 1]));
    }
    layers.push(next);
  }

  const root = layers[layers.length - 1][0];
  const proofs = new Map<string, Hex[]>();
  for (let i = 0; i < hashed.length; i++) {
    const proof: Hex[] = [];
    let idx = i;
    for (let level = 0; level < layers.length - 1; level++) {
      const layer = layers[level];
      const sibling = idx ^ 1;
      if (sibling < layer.length) proof.push(layer[sibling]);
      idx = idx >> 1;
    }
    proofs.set(leaves[i].holder.toLowerCase(), proof);
  }

  const totalAmount = leaves.reduce((sum, l) => sum + l.amount, 0n);
  return { root, proofs, totalAmount };
}
