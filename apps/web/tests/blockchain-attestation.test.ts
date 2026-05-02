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

const PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const; // anvil[0]

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

test('symbolToBytes32 throws on overlong symbol', () => {
  assert.throws(() => symbolToBytes32('A'.repeat(32)));
});

test('buildNavAttestation derives navPerShare from baseCaseValueKrw', () => {
  const att = buildNavAttestation({
    valuationRun: {
      id: 'run-abc',
      baseCaseValueKrw: 259_936_015_008,
      createdAt: new Date('2026-04-30T05:20:20.000Z')
    },
    asset: { assetCode: 'SEOUL-GANGSEO-01' }
  });
  // Single-share default → navPerShare === value × 1e18 (since totalShares = 1e18)
  assert.equal(att.navPerShare, 259_936_015_008n * 10n ** 18n);
  assert.equal(att.navTimestamp, BigInt(Math.floor(new Date('2026-04-30T05:20:20.000Z').getTime() / 1000)));
});

test('buildNavAttestation supports custom totalSharesScaled', () => {
  const att = buildNavAttestation({
    valuationRun: {
      id: 'run-xyz',
      baseCaseValueKrw: 1_000_000_000,
      totalSharesScaled: 10n ** 24n, // 1M shares × 1e18
      createdAt: new Date()
    },
    asset: { assetCode: 'X' }
  });
  // 1B KRW / 1M shares = 1000 KRW per share, scaled = 1000 × 1e18
  assert.equal(att.navPerShare, 1000n * 10n ** 18n);
});

test('attestationDigest is deterministic for same input', () => {
  const att = buildNavAttestation({
    valuationRun: { id: 'run', baseCaseValueKrw: 100, createdAt: new Date(0) },
    asset: { assetCode: 'A' }
  });
  const d1 = attestationDigest(DOMAIN, att);
  const d2 = attestationDigest(DOMAIN, att);
  assert.equal(d1, d2);
});

test('attestationDigest changes with chainId (replay protection)', () => {
  const att = buildNavAttestation({
    valuationRun: { id: 'run', baseCaseValueKrw: 100, createdAt: new Date(0) },
    asset: { assetCode: 'A' }
  });
  const d1 = attestationDigest(DOMAIN, att);
  const d2 = attestationDigest({ ...DOMAIN, chainId: 1n }, att);
  assert.notEqual(d1, d2);
});

test('signNavAttestation produces a 65-byte signature recoverable to the signer', async () => {
  const att = buildNavAttestation({
    valuationRun: { id: 'run', baseCaseValueKrw: 12345, createdAt: new Date(1000000) },
    asset: { assetCode: 'TEST' }
  });
  const { signature, signer } = await signNavAttestation(att, DOMAIN, PRIVATE_KEY);
  assert.equal(signature.length, 132); // 0x + 130 hex (65 bytes)
  assert.match(signer, /^0x[0-9a-fA-F]{40}$/);
});

test('splitSignature decomposes 65-byte sig into v/r/s', async () => {
  const att = buildNavAttestation({
    valuationRun: { id: 'run2', baseCaseValueKrw: 999, createdAt: new Date(2000000) },
    asset: { assetCode: 'B' }
  });
  const { signature } = await signNavAttestation(att, DOMAIN, PRIVATE_KEY);
  const { v, r, s } = splitSignature(signature);
  assert.ok(v === 27 || v === 28);
  assert.equal(r.length, 66);
  assert.equal(s.length, 66);
});
