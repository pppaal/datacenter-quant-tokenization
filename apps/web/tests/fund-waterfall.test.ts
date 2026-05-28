import assert from 'node:assert/strict';
import test from 'node:test';
import { computeFundWaterfallTiers } from '@/lib/services/fund-waterfall';

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

test('(a) no profit — distributions <= return of capital, nothing above ROC', () => {
  const called = 10_000_000_000;
  const result = computeFundWaterfallTiers({
    calledKrw: called,
    distributedKrw: 6_000_000_000, // less than called, still returning capital
    capitalCalls: [{ date: daysAgo(730), amountKrw: called }],
    distributions: [{ date: daysAgo(30), amountKrw: 6_000_000_000 }]
  });

  assert.equal(result.returnOfCapitalAmount, 6_000_000_000);
  assert.equal(result.preferredReturnAmount, 0);
  assert.equal(result.gpCatchUpAmount, 0);
  assert.equal(result.carryLpAmount, 0);
  assert.equal(result.carryGpAmount, 0);
});

test('(a2) distributions exactly equal called capital — pure ROC, no pref/carry', () => {
  const called = 10_000_000_000;
  const result = computeFundWaterfallTiers({
    calledKrw: called,
    distributedKrw: called,
    capitalCalls: [{ date: daysAgo(730), amountKrw: called }],
    distributions: [{ date: daysAgo(1), amountKrw: called }]
  });

  assert.equal(result.returnOfCapitalAmount, called);
  assert.equal(result.preferredReturnAmount, 0);
  assert.equal(result.gpCatchUpAmount, 0);
  assert.equal(result.carryLpAmount, 0);
  assert.equal(result.carryGpAmount, 0);
});

test('preferred return accrues on UNRETURNED capital with compounding (time-weighted)', () => {
  // 10B called exactly 2 years ago, no distributions yet. Pref should be the
  // 2-year compounding accrual on the full unreturned balance, NOT a flat 8%.
  const called = 10_000_000_000;
  const asOf = new Date();
  const callDate = new Date(asOf.getTime() - 2 * YEAR_MS);

  const result = computeFundWaterfallTiers({
    calledKrw: called,
    distributedKrw: 0,
    capitalCalls: [{ date: callDate, amountKrw: called }],
    distributions: [],
    asOf
  });

  assert.equal(result.prefIsTimeWeighted, true);
  // 2-year compounding accrual: 10B * (1.08^2 - 1) = 1.664B.
  const expected = Math.round(called * (Math.pow(1.08, 2) - 1));
  assert.ok(
    Math.abs(result.accruedPreferredReturn - expected) < 1_000_000,
    `accrued ${result.accruedPreferredReturn} ~= ${expected}`
  );
  // Flat-8% (old bug) would have been only 800M — confirm we accrued more.
  assert.ok(result.accruedPreferredReturn > called * 0.08);
});

test('(b) exactly at the hurdle — distributions cover ROC + pref, no catch-up/carry', () => {
  // Use the no-dated-calls fallback so the accrual is the gross one-year pref
  // (called * 8%); distribute exactly ROC + that pref. Nothing should reach the
  // GP catch-up or carry tiers.
  const called = 10_000_000_000;
  const pref = called * 0.08;

  const result = computeFundWaterfallTiers({
    calledKrw: called,
    distributedKrw: called + pref,
    capitalCalls: [],
    distributions: []
  });

  assert.equal(result.prefIsTimeWeighted, false);
  assert.equal(result.returnOfCapitalAmount, called);
  assert.equal(result.preferredReturnAmount, pref);
  assert.equal(result.gpCatchUpAmount, 0);
  assert.equal(result.carryLpAmount, 0);
  assert.equal(result.carryGpAmount, 0);
});

test('(c) above the hurdle — catch-up keyed off LP profit, then 80/20 carry split', () => {
  // No dated calls -> fallback one-year pref = called * 8%. With 10B called the
  // pref slice is 800M. Then GP catches up to 20% of profit-above-ROC, and the
  // residual splits 80/20.
  const called = 10_000_000_000;
  // ROC 10B + pref 800M + catch-up 200M + residual 4B => distributed 15B.
  const distributed = 15_000_000_000;
  const result = computeFundWaterfallTiers({
    calledKrw: called,
    distributedKrw: distributed,
    capitalCalls: [], // triggers conservative one-year fallback
    distributions: []
  });

  assert.equal(result.prefIsTimeWeighted, false);
  assert.equal(result.returnOfCapitalAmount, called);
  const pref = called * 0.08; // 800M
  assert.equal(result.preferredReturnAmount, pref);

  // Catch-up target = pref * 20/80 = 200M (NOT pref * 20/80 of pref-only meaning).
  const expectedCatchUp = (pref * 20) / 80;
  assert.equal(result.gpCatchUpAmount, expectedCatchUp);

  // After catch-up the GP holds 20% of profit-above-ROC accumulated so far.
  const profitSoFar = pref + result.gpCatchUpAmount;
  assert.ok(Math.abs(result.gpCatchUpAmount / profitSoFar - 0.2) < 1e-9);

  // Residual = distributed - ROC - pref - catchUp.
  const residual = distributed - called - pref - expectedCatchUp;
  assert.equal(result.carryLpAmount, (residual * 80) / 100);
  assert.equal(result.carryGpAmount, (residual * 20) / 100);

  // End-to-end: total GP profit share converges to 20% of total profit above ROC.
  const totalProfit = pref + result.gpCatchUpAmount + result.carryLpAmount + result.carryGpAmount;
  const gpProfit = result.gpCatchUpAmount + result.carryGpAmount;
  assert.ok(Math.abs(gpProfit / totalProfit - 0.2) < 1e-9);
});

test('catch-up target uses carry % of profit, independent of pref magnitude', () => {
  // Two different pref slices must each yield GP = 20% of (pref + catchUp).
  for (const called of [4_000_000_000, 20_000_000_000]) {
    const result = computeFundWaterfallTiers({
      calledKrw: called,
      distributedKrw: called * 3, // well above the hurdle
      capitalCalls: [],
      distributions: []
    });
    const pref = called * 0.08;
    const gpProfitAfterCatchUp = result.gpCatchUpAmount;
    const lpProfitAfterCatchUp = pref;
    assert.ok(
      Math.abs(gpProfitAfterCatchUp / (gpProfitAfterCatchUp + lpProfitAfterCatchUp) - 0.2) < 1e-9
    );
  }
});
