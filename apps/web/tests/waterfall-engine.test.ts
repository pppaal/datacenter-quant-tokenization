import assert from 'node:assert/strict';
import test from 'node:test';
import {
  initWaterfallState,
  runWaterfallPeriod,
  type WaterfallStrategy
} from '@/lib/services/valuation/waterfall-engine';

// A deterministic single-period tier split exercising all four tiers with a
// simple European-style 80/20 promote and 100% catch-up.
test('shared engine reproduces a known four-tier split', () => {
  const promoteSharePct = 20;
  const prefRatePct = 8;

  const strategy: WaterfallStrategy = {
    rocMode: 'lp-only',
    accruePref: (accruedPref, lpCapitalRemaining) =>
      accruedPref + Math.round((lpCapitalRemaining + accruedPref) * (prefRatePct / 100)),
    catchUpTarget: (ctx) => {
      const promoteRatio = promoteSharePct / (100 - promoteSharePct); // 0.25
      return Math.max(0, Math.round((ctx.cumLpProfit + ctx.tier2ThisPeriod) * promoteRatio));
    },
    catchUpAlreadyPaid: (ctx) => ctx.cumGpProfit,
    catchUpCapacity: (remaining) => remaining,
    carryGpShare: (residual) => Math.round(residual * (promoteSharePct / 100))
  };

  // LP capital = 1000. Single inflow of 3000.
  const state = initWaterfallState(1000, 0);
  const p = runWaterfallPeriod(3000, state, strategy);

  // Pref accrues first: round(1000 * 0.08) = 80.
  // Tier 1 ROC (LP-only): 1000.  remaining = 2000.
  // Tier 2 pref: 80.            remaining = 1920.
  // Tier 3 catch-up: target = round((0 + 80) * 0.25) = 20; already paid = 0 → 20.
  //                  remaining = 1900.
  // Tier 4: gp = round(1900 * 0.2) = 380; lp = 1520.
  assert.equal(p.tier1Lp, 1000);
  assert.equal(p.tier2Lp, 80);
  assert.equal(p.tier3Gp, 20);
  assert.equal(p.tier4Gp, 380);
  assert.equal(p.tier4Lp, 1520);
  assert.equal(p.lpTotal, 1000 + 80 + 1520);
  assert.equal(p.gpTotal, 20 + 380);
  // Distributable conserved across LP + GP.
  assert.equal(p.lpTotal + p.gpTotal, 3000);
});

test('pro-rata ROC mode splits return of capital across LP and GP', () => {
  const strategy: WaterfallStrategy = {
    rocMode: 'pro-rata',
    roundDistributable: false,
    accruePref: () => 0,
    catchUpTarget: () => 0,
    catchUpAlreadyPaid: () => 0,
    catchUpCapacity: (r) => r,
    carryGpShare: (residual) => residual - Math.round(residual * 0.8)
  };

  const state = initWaterfallState(900, 100); // 90/10
  const p = runWaterfallPeriod(1000, state, strategy);

  // Tier 1 pro-rata: t1Lp = min(900, round(1000 * 900/1000)) = 900; t1Gp = 100.
  assert.equal(p.tier1Lp, 900);
  assert.equal(p.tier1Gp, 100);
  // No pref, no catch-up, nothing left for carry.
  assert.equal(p.tier2Lp, 0);
  assert.equal(p.tier4Lp, 0);
  assert.equal(p.tier4Gp, 0);
});
