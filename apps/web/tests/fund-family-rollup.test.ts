import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFundFamilyTotals, type CommitmentMath } from '@/lib/services/capital';

function math(partial: Partial<CommitmentMath>): CommitmentMath {
  return {
    totalCommitmentKrw: 0,
    totalCalledKrw: 0,
    totalDistributedKrw: 0,
    navKrw: 0,
    navUsedCostBasisFallback: false,
    ...partial
  } as CommitmentMath;
}

test('fund family totals aggregate and compute money-weighted multiples', () => {
  const totals = buildFundFamilyTotals([
    math({
      totalCommitmentKrw: 100_000_000_000,
      totalCalledKrw: 80_000_000_000,
      totalDistributedKrw: 20_000_000_000,
      navKrw: 90_000_000_000
    }),
    math({
      totalCommitmentKrw: 60_000_000_000,
      totalCalledKrw: 40_000_000_000,
      totalDistributedKrw: 10_000_000_000,
      navKrw: 44_000_000_000,
      navUsedCostBasisFallback: true
    })
  ]);

  assert.equal(totals.fundCount, 2);
  assert.equal(totals.totalCommitmentKrw, 160_000_000_000);
  assert.equal(totals.totalCalledKrw, 120_000_000_000);
  assert.equal(totals.totalDistributedKrw, 30_000_000_000);
  assert.equal(totals.totalNavKrw, 134_000_000_000);
  assert.equal(totals.unfundedCommitmentKrw, 40_000_000_000);
  // DPI = 30/120 = 0.25 ; RVPI = 134/120 ; TVPI = 164/120
  assert.ok(totals.dpi != null && Math.abs(totals.dpi - 0.25) < 1e-9);
  assert.ok(totals.rvpi != null && Math.abs(totals.rvpi - 134 / 120) < 1e-9);
  assert.ok(totals.tvpi != null && Math.abs(totals.tvpi - 164 / 120) < 1e-9);
  assert.equal(totals.navUsedCostBasisFallback, true);
});

test('fund family totals are divide-by-zero safe', () => {
  const totals = buildFundFamilyTotals([]);
  assert.equal(totals.fundCount, 0);
  assert.equal(totals.dpi, null);
  assert.equal(totals.tvpi, null);
});
