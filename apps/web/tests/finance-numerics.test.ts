import assert from 'node:assert/strict';
import test from 'node:test';
import { mulberry32, standardNormal, applyCholesky, cholesky } from '@/lib/finance/numerics';

test('mulberry32 produces a deterministic sequence for a fixed seed', () => {
  const a = mulberry32(12345);
  const b = mulberry32(12345);
  const seqA = [a(), a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  // Different seed → different sequence (sanity check).
  const c = mulberry32(54321);
  assert.notDeepEqual([c(), c(), c()], seqA.slice(0, 3));
});

test('standardNormal is deterministic for a fixed seed', () => {
  const rngA = mulberry32(7);
  const rngB = mulberry32(7);
  const drawsA = [standardNormal(rngA), standardNormal(rngA), standardNormal(rngA)];
  const drawsB = [standardNormal(rngB), standardNormal(rngB), standardNormal(rngB)];
  assert.deepEqual(drawsA, drawsB);
});

test('cholesky({clamp:false}) throws on a non-PSD matrix', () => {
  // Off-diagonal magnitude > 1 makes this symmetric matrix non-PSD.
  const nonPsd = [
    [1, 2],
    [2, 1]
  ];
  assert.throws(() => cholesky(nonPsd, { clamp: false }), /not positive-definite/);
  // Default (no options) also throws.
  assert.throws(() => cholesky(nonPsd), /not positive-definite/);
});

test('cholesky({clamp:true}) returns a valid factor for a PSD matrix', () => {
  const psd = [
    [4, 2],
    [2, 3]
  ];
  const L = cholesky(psd, { clamp: true });
  // Reconstruct L Lᵀ and compare to the input.
  const n = psd.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let v = 0;
      for (let k = 0; k <= Math.min(i, j); k++) v += L[i]![k]! * L[j]![k]!;
      assert.ok(Math.abs(v - psd[i]![j]!) < 1e-9);
    }
  }
});

test('cholesky({clamp:true}) does not throw on a non-PSD matrix', () => {
  const nonPsd = [
    [1, 2],
    [2, 1]
  ];
  assert.doesNotThrow(() => cholesky(nonPsd, { clamp: true }));
});

test('applyCholesky computes x = L z', () => {
  const L = [
    [2, 0],
    [1, 3]
  ];
  const z = [1, 1];
  assert.deepEqual(applyCholesky(L, z), [2, 4]);
});
