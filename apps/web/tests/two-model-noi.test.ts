/**
 * "Two-model problem" correctness tests.
 *
 * The headline levered IRR / Monte Carlo / sensitivities run off the synthetic
 * pro-forma, which used to RE-DERIVE `year1Noi = baseCaseValueKrw × capRate`,
 * discarding the real NOI each strategy already computed. These tests pin the
 * fix: income strategies now expose a real `stabilizedNoiKrw`, the data-center
 * strategy exposes a year-by-year `leaseDcf`, and `buildFullReport` drives the
 * pro-forma off whichever real figure is available (falling back to the prior
 * synthetic derivation only when neither exists).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass } from '@prisma/client';
import { autoAnalyzeProperty } from '@/lib/services/property-analyzer/auto-analyze';
import { buildFullReport } from '@/lib/services/property-analyzer/full-report';
import {
  buildSyntheticProForma,
  type ProFormaInputs
} from '@/lib/services/valuation/synthetic-pro-forma';
import { computeReturnMetricsFromProForma } from '@/lib/services/valuation/return-metrics';

// ---------------------------------------------------------------------------
// 1. Income strategy: headline year-1 NOI == real stabilized NOI (NOT value×cap)
// ---------------------------------------------------------------------------

test('income headline year-1 NOI equals the strategy real stabilized NOI, not baseCaseValue×cap', async () => {
  const auto = await autoAnalyzeProperty({ address: '서울특별시 강남구 압구정로 340' });
  assert.equal(auto.primaryAnalysis.asset.assetClass, AssetClass.OFFICE);

  const primary = auto.primaryAnalysis;
  // The strategy exposes the real NOI it already computed.
  assert.equal(typeof primary.stabilizedNoiKrw, 'number');
  assert.ok(primary.stabilizedNoiKrw! > 0);

  const report = await buildFullReport(auto);
  const headlineYear1Noi = report.proForma.years[0]!.noiKrw;

  // Headline year-1 NOI must equal the REAL stabilized NOI (within rounding),
  // NOT the back-solved baseCaseValueKrw × capRate.
  assert.ok(
    Math.abs(headlineYear1Noi - Math.round(primary.stabilizedNoiKrw!)) <= 2,
    `headline y1 NOI ${headlineYear1Noi} should equal real stabilized NOI ${primary.stabilizedNoiKrw}`
  );

  // The headline NOI is now sourced from the strategy's real figure, NOT routed
  // through the baseCaseValueKrw × capRate back-solve. We assert the source of
  // truth directly: the pro-forma year-1 NOI equals the strategy's exposed
  // stabilizedNoiKrw exactly (rounded), independent of any cap-rate inversion.
  // (For an income asset the two can numerically coincide because the base value
  // is itself NOI/cap; the fix removes the *dependence* on that identity holding,
  // which the data-center test below exercises directly.)
  assert.equal(report.proForma.summary.stabilizedNoiKrw, Math.round(primary.stabilizedNoiKrw!));
});

// ---------------------------------------------------------------------------
// 2. Data-center: pro-forma is driven by the lease-level NOI vector
// ---------------------------------------------------------------------------

test('data-center pro-forma NOI vector mirrors the lease DCF (rollover-aware, not flat-grown)', async () => {
  const auto = await autoAnalyzeProperty({
    address: '경기도 평택시 고덕면 삼성로 114',
    includeAlternatives: 1,
    overrideAssetClass: AssetClass.DATA_CENTER
  });
  const primary = auto.primaryAnalysis;
  assert.equal(primary.asset.assetClass, AssetClass.DATA_CENTER);
  assert.ok(primary.leaseDcf, 'DC strategy must expose a lease-level DCF');
  assert.ok(primary.leaseDcf!.years.length > 0);

  const report = await buildFullReport(auto);

  // Year-1 pro-forma NOI must match the lease DCF year-1 NOI (within rounding).
  const leaseY1 = Math.round(primary.leaseDcf!.years[0]!.noiKrw);
  assert.ok(
    Math.abs(report.proForma.years[0]!.noiKrw - leaseY1) <= 2,
    `pro-forma y1 NOI ${report.proForma.years[0]!.noiKrw} should match lease y1 ${leaseY1}`
  );

  // Every modeled year should mirror the lease vector (within rounding) for the
  // years the lease DCF covers.
  const holdYears = report.proForma.years.length;
  for (let i = 0; i < Math.min(holdYears, primary.leaseDcf!.years.length); i++) {
    const leaseNoi = Math.round(primary.leaseDcf!.years[i]!.noiKrw);
    assert.ok(
      Math.abs(report.proForma.years[i]!.noiKrw - leaseNoi) <= 2,
      `pro-forma year ${i + 1} NOI should mirror lease NOI`
    );
  }

  // Rollover-aware: the year-over-year NOI growth is NOT a single flat rate
  // (a flat-grown synthetic would have a constant ratio every year).
  const ratios: number[] = [];
  for (let i = 1; i < report.proForma.years.length; i++) {
    const prev = report.proForma.years[i - 1]!.noiKrw;
    if (prev > 0) ratios.push(report.proForma.years[i]!.noiKrw / prev);
  }
  assert.ok(ratios.length >= 3);
  const spread = Math.max(...ratios) - Math.min(...ratios);
  assert.ok(
    spread > 0.01,
    `lease-driven NOI growth ratios should vary year to year (spread ${spread}), not be flat`
  );
});

// ---------------------------------------------------------------------------
// 3. Consistency invariant: Monte Carlo base case shares ONE base with headline
// ---------------------------------------------------------------------------

test('Monte Carlo base-case IRR shares one pro-forma base with the headline levered IRR', async () => {
  const auto = await autoAnalyzeProperty({ address: '서울특별시 강남구 압구정로 340' });
  const report = await buildFullReport(auto);

  // The headline uses the institutional mid-year convention; the MC base uses
  // end-of-year. To prove they run off the SAME pro-forma base (not divergent
  // ones), recompute end-of-year metrics from the headline pro-forma — it must
  // exactly equal the Monte Carlo base case.
  const eoy = computeReturnMetricsFromProForma(
    report.proForma,
    report.proFormaExtras.totalBasisKrw,
    report.proForma.summary.initialDebtFundingKrw,
    report.proForma.summary.netExitProceedsKrw,
    report.proForma.summary.terminalValueKrw,
    false
  );
  assert.equal(
    eoy.leveragedIrr,
    report.monteCarlo.baseLeveredIrr,
    'MC base levered IRR must equal end-of-year metrics off the headline pro-forma'
  );
  assert.equal(eoy.unleveragedIrr, report.monteCarlo.baseUnleveredIrr);

  // Sanity: the headline (mid-year) IRR is close to the shared base (the only
  // difference is the discount convention, which lifts IRR a little).
  assert.ok(report.returnMetrics.leveragedIrr !== null);
  assert.ok(report.monteCarlo.baseLeveredIrr !== null);
  assert.ok(
    Math.abs(report.returnMetrics.leveragedIrr! - report.monteCarlo.baseLeveredIrr!) < 1.5,
    `headline ${report.returnMetrics.leveragedIrr} and MC base ${report.monteCarlo.baseLeveredIrr} should be close`
  );
});

// ---------------------------------------------------------------------------
// 4. Synthetic fallback unchanged (bit-for-bit) when no real NOI is supplied
// ---------------------------------------------------------------------------

test('synthetic pro-forma fallback is bit-for-bit unchanged when noiByYearKrw is omitted', () => {
  const inputs: ProFormaInputs = {
    purchasePriceKrw: 50_000_000_000,
    ltvPct: 60,
    interestRatePct: 5.4,
    amortTermMonths: 180,
    capRatePct: 6,
    exitCapRatePct: 6.25,
    year1Noi: 3_000_000_000,
    growthPct: 2.5,
    opexRatio: 0.25,
    propertyTaxPct: 0.25,
    insurancePct: 0.08,
    corpTaxPct: 22,
    exitTaxPct: 22,
    acquisitionTaxPct: 4.6,
    landValuePct: 25,
    depreciationYears: 40,
    exitCostPct: 1.5,
    propertyTaxGrowthPct: 3,
    assetClass: 'OFFICE'
  };

  const baseline = buildSyntheticProForma(inputs);
  // Omitting noiByYearKrw must reproduce the legacy single-rate-growth path
  // EXACTLY. The legacy formula: revenue = round(year1Noi/(1-opex) * (1+g)^i).
  for (let i = 0; i < baseline.proForma.years.length; i++) {
    const expectedRevenue = Math.round(
      (inputs.year1Noi / (1 - inputs.opexRatio)) * Math.pow(1 + inputs.growthPct / 100, i)
    );
    assert.equal(
      baseline.proForma.years[i]!.revenueKrw,
      expectedRevenue,
      `year ${i + 1} synthetic revenue must match the legacy flat-growth formula`
    );
  }
  // Summary stabilized NOI still equals the supplied year1Noi.
  assert.equal(baseline.proForma.summary.stabilizedNoiKrw, inputs.year1Noi);
});

test('synthetic pro-forma uses the real NOI vector when noiByYearKrw IS supplied', () => {
  const base: ProFormaInputs = {
    purchasePriceKrw: 80_000_000_000,
    ltvPct: 55,
    interestRatePct: 5.0,
    amortTermMonths: 180,
    capRatePct: 6,
    exitCapRatePct: 6,
    year1Noi: 4_000_000_000,
    growthPct: 2,
    opexRatio: 0.45,
    propertyTaxPct: 0.25,
    insurancePct: 0.08,
    corpTaxPct: 22,
    exitTaxPct: 22,
    acquisitionTaxPct: 4.6,
    landValuePct: 40,
    depreciationYears: 20,
    exitCostPct: 1.5,
    propertyTaxGrowthPct: 3,
    assetClass: 'DATA_CENTER'
  };

  // A deliberately non-monotonic NOI vector (a rollover dip in year 3).
  const noiByYearKrw = [
    4_000_000_000, 4_400_000_000, 3_900_000_000, 4_600_000_000, 5_000_000_000, 5_300_000_000,
    5_600_000_000, 5_900_000_000, 6_100_000_000, 6_300_000_000
  ];

  const withVector = buildSyntheticProForma({ ...base, noiByYearKrw });

  // Each modeled year's NOI must reflect the supplied vector (revenue back-derived
  // via opexRatio so noi = revenue - opex ≈ supplied NOI within rounding).
  for (let i = 0; i < noiByYearKrw.length; i++) {
    assert.ok(
      Math.abs(withVector.proForma.years[i]!.noiKrw - noiByYearKrw[i]!) <= 2,
      `year ${i + 1} NOI ${withVector.proForma.years[i]!.noiKrw} should reflect supplied ${noiByYearKrw[i]}`
    );
  }
  // The year-3 dip must survive (proves it is NOT flat-grown).
  assert.ok(withVector.proForma.years[2]!.noiKrw < withVector.proForma.years[1]!.noiKrw);
});
