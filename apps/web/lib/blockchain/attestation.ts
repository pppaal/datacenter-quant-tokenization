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
import { Prisma } from '@prisma/client';
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

/** A KRW amount that may arrive as a Prisma `Decimal`, a `number`, or a
 *  numeric string. The attestation pipeline carries the attested NAV as a
 *  `Decimal` end to end so the scaling to an 18-decimal on-chain `uint256`
 *  never loses precision the way a JS `number` does above 2^53 KRW
 *  (~9.0e15). */
export type DecimalLike = Prisma.Decimal | number | string;

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
 *  quote symbol (`bytes32` of the UTF-8/ASCII bytes, right-padded).
 *
 *  Only printable single-byte ASCII (code points 0x01..0x7f) is accepted.
 *  Multi-byte / non-ASCII input is rejected rather than silently mangled:
 *  `charCodeAt` returns UTF-16 code units and assigning a value > 0xff into
 *  a `Uint8Array` truncates to the low byte, so e.g. "Ł" (U+0141) would
 *  otherwise collide with "A" (0x41) and produce a bytes32 the on-chain
 *  contract never agrees with. */
export function symbolToBytes32(symbol: string): Hex {
  if (symbol.length > 32) {
    throw new Error(`symbol "${symbol}" exceeds 32 bytes`);
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < symbol.length; i += 1) {
    const code = symbol.charCodeAt(i);
    if (code === 0 || code > 0x7f) {
      throw new Error(`symbol "${symbol}" must contain only printable ASCII (0x01..0x7f)`);
    }
    bytes[i] = code;
  }
  return toHex(bytes);
}

export type ValuationRunInput = {
  id: string;
  /**
   * Attested NAV the token claims to represent (KRW, in WHOLE units — NOT
   * pre-scaled to 18 decimals). For a token over a fund/asset interest this
   * MUST be the fund-NAV-aware value (ownership % applied, fund debt and
   * other net assets netted) — i.e. what `computeFundNavDetail` produces for
   * the token's slice — NOT the raw whole-asset `ValuationRun.baseCaseValueKrw`.
   * Carried as `Decimal` so values above 2^53 KRW don't lose precision.
   */
  navValueKrw: DecimalLike;
  /**
   * Outstanding token supply in the token's own base units (already scaled to
   * the token's `decimals()` — e.g. an 18-decimal ERC-20 reports
   * `totalSupply()` pre-scaled). REQUIRED and must be > 0. There is no silent
   * 1e18 default: a wrong/absent supply would make `navPerShare` equal the
   * WHOLE-asset value instead of per-token, which the on-chain consumer can't
   * detect. Source it from the live `AssetToken.totalSupply()`.
   */
  totalSharesScaled: bigint;
  /** When the run was actually struck (engine completion). */
  createdAt: Date;
  /** Optional explicit nonce; defaults to createdAt epoch ms (monotonic). */
  nonce?: bigint;
};

export type AssetInput = {
  assetCode: string;
};

/** 18-decimal fixed-point scale used by the on-chain `navPerShare`. */
const NAV_SCALE = 10n ** 18n;

/**
 * Coerce a {@link DecimalLike} KRW amount to a non-negative `Prisma.Decimal`,
 * rejecting non-finite / negative inputs the same way the legacy `number`
 * guards did. Kept as `Decimal` so the caller never round-trips through a
 * lossy JS `number` before the bigint scaling boundary.
 */
function toNonNegativeDecimal(value: DecimalLike, label: string): Prisma.Decimal {
  let d: Prisma.Decimal;
  try {
    d = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
  } catch {
    throw new Error(`${label} must be a finite number (got ${String(value)}).`);
  }
  if (!d.isFinite()) {
    throw new Error(`${label} must be a finite number (got ${String(value)}).`);
  }
  if (d.isNegative()) {
    // navPerShare is an on-chain uint256; a negative value would either wrap to
    // a garbage huge number or fail at ABI encode far downstream. Reject here.
    throw new Error(`${label} must be non-negative (got ${d.toString()}).`);
  }
  return d;
}

/**
 * Convert a ValuationRun + Asset row into a NavAttestation.
 *
 *   - quoteSymbol defaults to "KRW".
 *   - `totalSharesScaled` is a REQUIRED, explicit token supply (> 0) — there
 *     is no silent 1e18 default, because a wrong supply would make
 *     `navPerShare` the whole-asset value instead of per-token.
 *   - `navPerShare = round(navValueKrw × 10**18 × 10**18 / totalSharesScaled)`,
 *     computed in `Decimal` so KRW NAVs above 2^53 stay exact, then floored to
 *     an integer at the final bigint boundary (floor-division dust < 1 unit is
 *     dropped, matching the on-chain floor semantics).
 */
export function buildNavAttestation(opts: {
  valuationRun: ValuationRunInput;
  asset: AssetInput;
  quoteSymbol?: string;
}): NavAttestation {
  const totalShares = opts.valuationRun.totalSharesScaled;
  if (totalShares <= 0n) {
    throw new Error('totalSharesScaled must be a positive number of shares.');
  }
  const navValueKrw = toNonNegativeDecimal(opts.valuationRun.navValueKrw, 'navValueKrw');

  // Scale to 18 decimals (× the 18-decimal navPerShare unit) in Decimal space,
  // divide by the token supply, then floor to a bigint only at the very end.
  // Doing the division in Decimal (not bigint) keeps the intermediate exact;
  // toFixed(0, ROUND_DOWN) floors so we never over-attest per token.
  const navPerShareDecimal = navValueKrw
    .mul(NAV_SCALE.toString())
    .mul(NAV_SCALE.toString())
    .div(totalShares.toString());
  const navPerShare = BigInt(navPerShareDecimal.toFixed(0, Prisma.Decimal.ROUND_DOWN));

  const symbol = opts.quoteSymbol ?? 'KRW';
  const navTimestamp = BigInt(Math.floor(opts.valuationRun.createdAt.getTime() / 1000));
  const nonce = opts.valuationRun.nonce ?? BigInt(opts.valuationRun.createdAt.getTime());
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
