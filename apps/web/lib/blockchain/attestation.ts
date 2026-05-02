/**
 * EIP-712 NAV attestation pipeline.
 *
 * Translates a `ValuationRun` row into a signed typed-data attestation
 * that downstream RWA protocols can verify on-chain. The signature is
 * produced off-chain (here) and the on-chain `NavAttestor.sol`
 * contract verifies + forwards to the per-token `NavOracle.sol`.
 *
 * Why EIP-712 (not raw bytes32):
 *   - Wallet UX (signer sees a structured, human-readable payload)
 *   - Cross-chain replay protection via the EIP-712 domain
 *   - Same payload usable by Chainlink Functions / Pyth / external
 *     consumers without re-defining the schema
 *
 * Usage:
 *   const att = buildNavAttestation({ valuationRun, asset });
 *   const signature = await signNavAttestation(att, signer);
 *   // off-chain: store {att, signature} in a DB table or post to RPC
 *   // on-chain: NavAttestor.publish(att, signature)
 */
import {
  type Address,
  type Hex,
  encodeAbiParameters,
  keccak256,
  parseSignature,
  toBytes,
  toHex
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export type NavAttestation = {
  /** Asset identifier on-chain (immutable bytes32 derived from assetCode). */
  assetId: Hex;
  /** Currency code as bytes32 — e.g. "KRW" right-padded. */
  quoteSymbol: Hex;
  /** NAV per share in fixed-point — KRW × 10^18 per share. */
  navPerShare: bigint;
  /** Unix timestamp of the underlying valuation run (not the publish time). */
  navTimestamp: bigint;
  /** Monotonic counter from the publisher to prevent replay. */
  nonce: bigint;
  /** Optional reference to the off-chain run (cuid hashed). */
  runRef: Hex;
};

export type Eip712Domain = {
  name: string;
  version: string;
  chainId: bigint;
  verifyingContract: Address;
};

/** Stable typehash matching the Solidity struct layout. Update both sides
 *  together when the struct changes. */
export const NAV_ATTESTATION_TYPEHASH = keccak256(
  toBytes(
    'NavAttestation(bytes32 assetId,bytes32 quoteSymbol,uint256 navPerShare,uint256 navTimestamp,uint256 nonce,bytes32 runRef)'
  )
);

const TYPES = {
  NavAttestation: [
    { name: 'assetId', type: 'bytes32' },
    { name: 'quoteSymbol', type: 'bytes32' },
    { name: 'navPerShare', type: 'uint256' },
    { name: 'navTimestamp', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'runRef', type: 'bytes32' }
  ]
} as const;

/** Convert a string identifier (e.g. assetCode "SEOUL-GANGSEO-01") to a
 *  bytes32 via keccak256 — stable, collision-resistant, fits the
 *  NavOracle's bytes32 quoteSymbol / asset identifier shape. */
export function toBytes32Identifier(input: string): Hex {
  return keccak256(toBytes(input));
}

/** Right-pad a short ASCII symbol like "KRW" into bytes32 — readable
 *  when decoded but still 32 bytes. Mirrors how AssetToken stores its
 *  quote symbol. */
export function symbolToBytes32(symbol: string): Hex {
  if (symbol.length > 31) {
    throw new Error(`symbol "${symbol}" exceeds 31 bytes`);
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < symbol.length; i += 1) {
    bytes[i] = symbol.charCodeAt(i);
  }
  return toHex(bytes);
}

export type ValuationRunInput = {
  id: string;
  baseCaseValueKrw: number;
  /** Decimal share count outstanding — defaults to 1e18 (single-share asset). */
  totalSharesScaled?: bigint;
  /** When the run was actually struck (engine completion). */
  createdAt: Date;
  /** Optional explicit nonce; defaults to createdAt epoch ms (monotonic). */
  nonce?: bigint;
};

export type AssetInput = {
  assetCode: string;
};

/**
 * Convert a ValuationRun + Asset row into a NavAttestation. Defaults:
 *   - quoteSymbol = "KRW"
 *   - totalSharesScaled = 10**18 (single-share asset; multi-share assets
 *     should pass the actual outstanding count scaled to 18 decimals).
 *   - navPerShare = baseCaseValueKrw × 10**18 / totalSharesScaled
 */
export function buildNavAttestation(opts: {
  valuationRun: ValuationRunInput;
  asset: AssetInput;
  quoteSymbol?: string;
}): NavAttestation {
  const totalShares = opts.valuationRun.totalSharesScaled ?? 10n ** 18n;
  // baseCaseValueKrw is JS number (KRW). Scale to 18 decimals before
  // dividing by totalShares to preserve precision.
  const valueScaled = BigInt(Math.round(opts.valuationRun.baseCaseValueKrw)) * 10n ** 18n;
  const navPerShare = (valueScaled * 10n ** 18n) / totalShares;
  const symbol = opts.quoteSymbol ?? 'KRW';
  const navTimestamp = BigInt(Math.floor(opts.valuationRun.createdAt.getTime() / 1000));
  const nonce =
    opts.valuationRun.nonce ?? BigInt(opts.valuationRun.createdAt.getTime());
  return {
    assetId: toBytes32Identifier(opts.asset.assetCode),
    quoteSymbol: symbolToBytes32(symbol),
    navPerShare,
    navTimestamp,
    nonce,
    runRef: toBytes32Identifier(opts.valuationRun.id)
  };
}

/** Compute the EIP-712 digest (the bytes signers actually sign). The
 *  on-chain `NavAttestor` recomputes the same digest with
 *  `_hashTypedDataV4`. */
export function attestationDigest(domain: Eip712Domain, att: NavAttestation): Hex {
  const structHash = keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' }, // typehash
        { type: 'bytes32' }, // assetId
        { type: 'bytes32' }, // quoteSymbol
        { type: 'uint256' }, // navPerShare
        { type: 'uint256' }, // navTimestamp
        { type: 'uint256' }, // nonce
        { type: 'bytes32' } // runRef
      ],
      [
        NAV_ATTESTATION_TYPEHASH,
        att.assetId,
        att.quoteSymbol,
        att.navPerShare,
        att.navTimestamp,
        att.nonce,
        att.runRef
      ]
    )
  );
  // EIP-712 domain separator
  const domainSeparator = keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' }, // EIP712Domain typehash
        { type: 'bytes32' }, // name hash
        { type: 'bytes32' }, // version hash
        { type: 'uint256' }, // chainId
        { type: 'address' } // verifyingContract
      ],
      [
        keccak256(
          toBytes(
            'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
          )
        ),
        keccak256(toBytes(domain.name)),
        keccak256(toBytes(domain.version)),
        domain.chainId,
        domain.verifyingContract
      ]
    )
  );
  // 0x1901 || domainSeparator || structHash, then keccak
  const prefix = '0x1901';
  return keccak256(`${prefix}${domainSeparator.slice(2)}${structHash.slice(2)}` as Hex);
}

/** Sign an attestation with a private key. The wallet client API
 *  (signTypedData) is preferred for hardware signers; this helper is
 *  for server-side workflows. */
export async function signNavAttestation(
  att: NavAttestation,
  domain: Eip712Domain,
  privateKey: Hex
): Promise<{ signature: Hex; signer: Address; digest: Hex }> {
  const account = privateKeyToAccount(privateKey);
  const signature = await account.signTypedData({
    domain: {
      name: domain.name,
      version: domain.version,
      chainId: Number(domain.chainId),
      verifyingContract: domain.verifyingContract
    },
    types: TYPES,
    primaryType: 'NavAttestation',
    message: {
      assetId: att.assetId,
      quoteSymbol: att.quoteSymbol,
      navPerShare: att.navPerShare,
      navTimestamp: att.navTimestamp,
      nonce: att.nonce,
      runRef: att.runRef
    }
  });
  const digest = attestationDigest(domain, att);
  return { signature, signer: account.address, digest };
}

/** Decode a 65-byte signature into v / r / s — useful when the
 *  on-chain contract takes split signature args rather than packed
 *  bytes. */
export function splitSignature(signature: Hex): { v: number; r: Hex; s: Hex } {
  const { r, s, v } = parseSignature(signature);
  return { v: Number(v ?? 27n), r, s };
}
