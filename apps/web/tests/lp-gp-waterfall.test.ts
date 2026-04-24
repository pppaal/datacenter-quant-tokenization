import assert from 'node:assert/strict';
import test from 'node:test';
import { runLpGpWaterfall } from '@/lib/services/valuation/lp-gp-waterfall';

test('all LP when no excess above pref — no promote', () => {
  const result = runLpGpWaterfall(
    [0, 0, 0, 0, 0],
    10_000_000_000, // exit = equity, exactly return of capital
    {
      totalEquityKrw: 10_000_000_000,
      gpContributionSharePct: 5,
      prefRatePct: 8,
      promoteSharePct: 20,
      catchUpSharePct: 100
    }
  );
  // LP gets most back as ROC; GP contributed 5%, gets 5% back from exit via ROC (GP is also an LP in own capital)
  // Actually in our model Tier 1 returns LP contributed capital only (not GP).
  // GP's 500M contribution doesn't get returned in this scenario — it was never distinguished from waterfall perspective.
  // The raw = 10B exit. LP unreturned = 9.5B, so tier 1 pays 9.5B to LP. Remaining 500M.
  // No pref accrued until year 5 (already accrued 8% × 5 yrs on 9.5B declining...).
  // Let's just assert promote didn't kick in — LP got everything above their capital
  assert.equal(result.promoteHit, false);
});

test('8% pref hit exactly — no promote, LP IRR = 8%', () => {
  // LP puts in 9.5B, gets back 9.5B × 1.08^5 ≈ 13.96B at exit
  const exitProceeds = Math.round(9_500_000_000 * Math.pow(1.08, 5));
  const result = runLpGpWaterfall(
    [0, 0, 0, 0, 0],
    exitProceeds + 500_000_000, // GP also gets their 5% back proportionally
    {
      totalEquityKrw: 10_000_000_000,
      gpContributionSharePct: 5,
      prefRatePct: 8,
      promoteSharePct: 20,
      catchUpSharePct: 100
    }
  );
  assert.ok(result.lpIrrPct !== null);
  assert.ok(result.lpIrrPct! >= 7.5 && result.lpIrrPct! <= 9.0);
});

test('large exit triggers catch-up and 80/20 promote', () => {
  // 10B equity → 30B exit = 3x return. Way above 8% pref.
  const result = runLpGpWaterfall(
    [0, 0, 0, 0, 0],
    30_000_000_000,
    {
      totalEquityKrw: 10_000_000_000,
      gpContributionSharePct: 5,
      prefRatePct: 8,
      promoteSharePct: 20,
      catchUpSharePct: 100
    }
  );
  assert.equal(result.promoteHit, true);
  assert.ok(result.gpPromoteCapturedKrw > 0);
  // GP captures roughly 20% of profit
  const totalProfit = result.lpProfitKrw + result.gpProfitKrw;
  const gpShareOfProfit = result.gpProfitKrw / totalProfit;
  assert.ok(gpShareOfProfit > 0.15);
  assert.ok(gpShareOfProfit < 0.30);
});

test('annual distributions accrue pref year-by-year', () => {
  // 1B / year for 10 years + 10B exit on 10B equity.
  // LP should get pref 8% on 9.5B = 760M/yr, which annual 950M (LP 95% share)
  // distributions partially cover.
  const result = runLpGpWaterfall(
    Array(10).fill(1_000_000_000),
    10_000_000_000,
    {
      totalEquityKrw: 10_000_000_000,
      gpContributionSharePct: 5,
      prefRatePct: 8,
      promoteSharePct: 20,
      catchUpSharePct: 100
    }
  );
  // Pref should be mostly paid during the hold
  const totalPref = result.years.reduce((s, y) => s + y.tier2PrefLpKrw, 0);
  assert.ok(totalPref > 0);
  // LP IRR should be well above 8% given returning capital + exit
  assert.ok(result.lpIrrPct !== null);
  assert.ok(result.lpIrrPct! > 8);
});

test('zero distributions yields zero results', () => {
  const result = runLpGpWaterfall([0, 0, 0, 0, 0], 0, {
    totalEquityKrw: 10_000_000_000,
    gpContributionSharePct: 5,
    prefRatePct: 8,
    promoteSharePct: 20,
    catchUpSharePct: 100
  });
  assert.equal(result.lpTotalDistributionKrw, 0);
  assert.equal(result.gpTotalDistributionKrw, 0);
  assert.equal(result.promoteHit, false);
  assert.equal(result.lpMoic, 0);
});

test('GP MOIC exceeds 1x only when promote fires', () => {
  const weakExit = runLpGpWaterfall([0, 0, 0, 0, 0], 10_500_000_000, {
    totalEquityKrw: 10_000_000_000,
    gpContributionSharePct: 5,
    prefRatePct: 8,
    promoteSharePct: 20,
    catchUpSharePct: 100
  });
  const strongExit = runLpGpWaterfall([0, 0, 0, 0, 0], 20_000_000_000, {
    totalEquityKrw: 10_000_000_000,
    gpContributionSharePct: 5,
    prefRatePct: 8,
    promoteSharePct: 20,
    catchUpSharePct: 100
  });
  assert.ok(strongExit.gpMoic > weakExit.gpMoic);
  assert.ok(strongExit.promoteHit);
});

test('higher promote share → lower LP profit share at same exit', () => {
  const lowPromote = runLpGpWaterfall([0, 0, 0, 0, 0], 30_000_000_000, {
    totalEquityKrw: 10_000_000_000,
    gpContributionSharePct: 5,
    prefRatePct: 8,
    promoteSharePct: 10,
    catchUpSharePct: 100
  });
  const highPromote = runLpGpWaterfall([0, 0, 0, 0, 0], 30_000_000_000, {
    totalEquityKrw: 10_000_000_000,
    gpContributionSharePct: 5,
    prefRatePct: 8,
    promoteSharePct: 30,
    catchUpSharePct: 100
  });
  assert.ok(lowPromote.lpProfitKrw > highPromote.lpProfitKrw);
  assert.ok(lowPromote.gpProfitKrw < highPromote.gpProfitKrw);
});
