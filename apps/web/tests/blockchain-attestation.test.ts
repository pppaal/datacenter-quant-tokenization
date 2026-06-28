import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attestationDigest,
  buildNavAttestation,
  signNavAttestation,
  splitSignature,
  symbolToBytes32,
  toBytes32Identifier
} from '@/lib/blockchain/attestation';

const DOMAIN = {
  name: 'NavAttestor',
  version: '1',
  chainId: 84532n, // Base Sepolia
  verifyingContract: '0x1111111111111111111111111111111111111111' as const
};

const PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const; // anvil[0]

test('toBytes32Identifier produces a stable 32-byte hash', () => {
  const a = toBytes32Identifier('SEOUL-GANGSEO-01');
  const b = toBytes32Identifier('SEOUL-GANGSEO-01');
  assert.equal(a, b);
  assert.equal(a.length, 66); // 0x + 64 hex
});

test('symbolToBytes32 right-pads short symbols', () => {
  const krw = symbolToBytes32('KRW');
  assert.equal(krw.length, 66);
  // First 6 chars after 0x should be "4b5257" (KRW in hex)
  assert.equal(krw.slice(2, 8), '4b5257');
});

test('symbolToBytes32 accepts a 32-char ASCII symbol (fills bytes32 exactly)', () => {
  // bytes32 holds 32 single-byte ASCII chars; a 32-char symbol must NOT throw.
  const out = symbolToBytes32('A'.repeat(32));
  assert.equal(out.length, 66);
  assert.equal(out, `0x${'41'.repeat(32)}`);
});

test('symbolToBytes32 throws on overlong symbol', () => {
  assert.throws(() => symbolToBytes32('A'.repeat(33)), /exceeds 32 bytes/);
});

test('symbolToBytes32 rejects non-ASCII instead of silently truncating', () => {
  // Regression: "Ł" (U+0141) would be truncated to its low byte 0x41 ("A")
  // by Uint8Array assignment, silently colliding with symbolToBytes32('A').
  assert.throws(() => symbolToBytes32('Ł'), /printable ASCII/);
  assert.throws(() => symbolToBytes32('KR₩'), /printable ASCII/);
  // Sanity: the ASCII it would have collided with is still encodable.
  assert.notEqual(symbolToBytes32('A'), '0x' + '00'.repeat(32));
});

// A genuine 1:1 token (1e18 base units == 1 whole share) so navPerShare ==
// navValueKrw × 1e18. The supply is now ALWAYS explicit — there is no silent
// 1e18 default — so this case is opted into, never assumed.
const ONE_TO_ONE_SUPPLY = 10n ** 18n;

test('buildNavAttestation derives navPerShare from navValueKrw and explicit supply', () => {
  const att = buildNavAttestation({
    valuationRun: {
      id: 'run-abc',
      navValueKrw: 259_936_015_008,
      totalSharesScaled: ONE_TO_ONE_SUPPLY,
      createdAt: new Date('2026-04-30T05:20:20.000Z')
    },
    asset: { assetCode: 'SEOUL-GANGSEO-01' }
  });
  // 1:1 supply → navPerShare === value × 1e18 (since totalShares = 1e18)
  assert.equal(att.navPerShare, 259_936_015_008n * 10n ** 18n);
  assert.equal(
    att.navTimestamp,
    BigInt(Math.floor(new Date('2026-04-30T05:20:20.000Z').getTime() / 1000))
  );
});

test('buildNavAttestation supports a multi-share supply', () => {
  const att = buildNavAttestation({
    valuationRun: {
      id: 'run-xyz',
      navValueKrw: 1_000_000_000,
      totalSharesScaled: 10n ** 24n, // 1M shares × 1e18
      createdAt: new Date()
    },
    asset: { assetCode: 'X' }
  });
  // 1B KRW / 1M shares = 1000 KRW per share, scaled = 1000 × 1e18
  assert.equal(att.navPerShare, 1000n * 10n ** 18n);
});

test('buildNavAttestation carries KRW above 2^53 without float precision loss', () => {
  // Real fund NAVs can exceed Number.MAX_SAFE_INTEGER (~9.0e15). A JS number
  // would round the trailing digits; the Decimal path must not.
  const bigValue = '9007199254740993000'; // (2^53 + 1) × 1000 — not exactly representable as a JS number
  const att = buildNavAttestation({
    valuationRun: {
      id: 'run-big',
      navValueKrw: bigValue,
      totalSharesScaled: ONE_TO_ONE_SUPPLY,
      createdAt: new Date(0)
    },
    asset: { assetCode: 'BIG' }
  });
  assert.equal(att.navPerShare, BigInt(bigValue) * 10n ** 18n);
});

test('buildNavAttestation rejects a negative valuation instead of signing a garbage NAV', () => {
  // Regression: a negative navValueKrw previously produced a negative
  // navPerShare which would wrap/corrupt when encoded as an on-chain uint256.
  assert.throws(
    () =>
      buildNavAttestation({
        valuationRun: {
          id: 'r',
          navValueKrw: -100,
          totalSharesScaled: ONE_TO_ONE_SUPPLY,
          createdAt: new Date(0)
        },
        asset: { assetCode: 'A' }
      }),
    /non-negative/
  );
});

test('buildNavAttestation refuses a zero NAV the on-chain NavAttestor would reject', () => {
  // navPerShare === 0 reverts with InvalidNav() on-chain; signing it would
  // broadcast a guaranteed-revert tx (and mint a fake "success" mock txHash).
  assert.throws(
    () =>
      buildNavAttestation({
        valuationRun: {
          id: 'r0',
          navValueKrw: 0,
          totalSharesScaled: ONE_TO_ONE_SUPPLY,
          createdAt: new Date(0)
        },
        asset: { assetCode: 'A' }
      }),
    /navPerShare resolved to 0/
  );
});

test('buildNavAttestation refuses a dust NAV that floors to zero per share', () => {
  // navValueKrw too small for the supply → navPerShare floors to 0.
  assert.throws(
    () =>
      buildNavAttestation({
        valuationRun: {
          id: 'rdust',
          navValueKrw: 1,
          totalSharesScaled: 10n ** 40n, // astronomically large supply
          createdAt: new Date(0)
        },
        asset: { assetCode: 'A' }
      }),
    /navPerShare resolved to 0/
  );
});

test('buildNavAttestation rejects non-finite valuation', () => {
  for (const bad of [NaN, Infinity, -Infinity]) {
    assert.throws(
      () =>
        buildNavAttestation({
          valuationRun: {
            id: 'r',
            navValueKrw: bad,
            totalSharesScaled: ONE_TO_ONE_SUPPLY,
            createdAt: new Date(0)
          },
          asset: { assetCode: 'A' }
        }),
      /finite/
    );
  }
});

test('buildNavAttestation rejects non-positive totalSharesScaled', () => {
  assert.throws(
    () =>
      buildNavAttestation({
        valuationRun: {
          id: 'r',
          navValueKrw: 100,
          totalSharesScaled: 0n,
          createdAt: new Date(0)
        },
        asset: { assetCode: 'A' }
      }),
    /positive number of shares/
  );
});

test('attestationDigest is deterministic for same input', () => {
  const att = buildNavAttestation({
    valuationRun: {
      id: 'run',
      navValueKrw: 100,
      totalSharesScaled: ONE_TO_ONE_SUPPLY,
      createdAt: new Date(0)
    },
    asset: { assetCode: 'A' }
  });
  const d1 = attestationDigest(DOMAIN, att);
  const d2 = attestationDigest(DOMAIN, att);
  assert.equal(d1, d2);
});

test('attestationDigest changes with chainId (replay protection)', () => {
  const att = buildNavAttestation({
    valuationRun: {
      id: 'run',
      navValueKrw: 100,
      totalSharesScaled: ONE_TO_ONE_SUPPLY,
      createdAt: new Date(0)
    },
    asset: { assetCode: 'A' }
  });
  const d1 = attestationDigest(DOMAIN, att);
  const d2 = attestationDigest({ ...DOMAIN, chainId: 1n }, att);
  assert.notEqual(d1, d2);
});

test('signNavAttestation produces a 65-byte signature recoverable to the signer', async () => {
  const att = buildNavAttestation({
    valuationRun: {
      id: 'run',
      navValueKrw: 12345,
      totalSharesScaled: ONE_TO_ONE_SUPPLY,
      createdAt: new Date(1000000)
    },
    asset: { assetCode: 'TEST' }
  });
  const { signature, signer } = await signNavAttestation(att, DOMAIN, PRIVATE_KEY);
  assert.equal(signature.length, 132); // 0x + 130 hex (65 bytes)
  assert.match(signer, /^0x[0-9a-fA-F]{40}$/);
});

test('splitSignature decomposes 65-byte sig into v/r/s', async () => {
  const att = buildNavAttestation({
    valuationRun: {
      id: 'run2',
      navValueKrw: 999,
      totalSharesScaled: ONE_TO_ONE_SUPPLY,
      createdAt: new Date(2000000)
    },
    asset: { assetCode: 'B' }
  });
  const { signature } = await signNavAttestation(att, DOMAIN, PRIVATE_KEY);
  const { v, r, s } = splitSignature(signature);
  assert.ok(v === 27 || v === 28);
  assert.equal(r.length, 66);
  assert.equal(s.length, 66);
});
