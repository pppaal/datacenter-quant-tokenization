import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adjustComp,
  computeSizeAdjustmentPct,
  computeTimeAdjustmentPct,
  computeLocationAdjustmentPct,
  fitHedonic,
  predictHedonic,
  DEFAULT_ANNUAL_PRICE_GROWTH_PCT,
  MAX_FACTOR_ADJUSTMENT_PCT,
  MAX_NET_ADJUSTMENT_PCT,
  HEDONIC_MIN_COMPS,
  SIZE_ELASTICITY
} from '@/lib/services/valuation/comp-adjustments';
import {
  buildThreeApproachValuation,
  type ThreeApproachInputs
} from '@/lib/services/valuation/three-approach';

// ---------------------------------------------------------------------------
// Size adjustment — larger comp DOWN, smaller comp UP, symmetric.
// ---------------------------------------------------------------------------

test('size adjustment: larger comp gets downward, smaller comp upward, symmetric', () => {
  const subjectArea = 10_000;

  const bigger = computeSizeAdjustmentPct(subjectArea, 20_000); // 2x
  const smaller = computeSizeAdjustmentPct(subjectArea, 5_000); // 0.5x
  const same = computeSizeAdjustmentPct(subjectArea, 10_000);

  // -0.10 * ln(2) * 100 = -6.9314...
  assert.equal(Number(bigger.pct.toFixed(4)), -6.9315);
  assert.equal(Number(smaller.pct.toFixed(4)), 6.9315);
  assert.equal(same.pct, 0);

  // Direction assertions per task.
  assert.ok(bigger.pct < 0, 'larger comp must be downward');
  assert.ok(smaller.pct > 0, 'smaller comp must be upward');
  // Symmetric (equal and opposite).
  assert.equal(Math.abs(bigger.pct + smaller.pct) < 1e-9, true);

  assert.equal(SIZE_ELASTICITY, 0.1);
});

test('size adjustment: null/zero comp area is neutral', () => {
  assert.deepEqual(computeSizeAdjustmentPct(10_000, null), { pct: 0, areaRatio: null });
  assert.deepEqual(computeSizeAdjustmentPct(10_000, 0), { pct: 0, areaRatio: null });
});

// ---------------------------------------------------------------------------
// Time adjustment — stale comp adjusted forward toward valuation date.
// ---------------------------------------------------------------------------

test('time adjustment: stale comp adjusted upward with default growth', () => {
  const valuationDate = new Date(2026, 5, 30);
  // Exactly 4 years (365.25-day years) earlier.
  const fourYears = 4 * 365.25 * 24 * 60 * 60 * 1000;
  const transactionDate = new Date(valuationDate.getTime() - fourYears);

  const res = computeTimeAdjustmentPct({
    transactionDate,
    valuationDate,
    annualPriceGrowthPct: null
  });

  assert.equal(res.usedDefault, true);
  assert.equal(res.annualGrowthUsedPct, DEFAULT_ANNUAL_PRICE_GROWTH_PCT);
  assert.equal(res.yearsElapsed, 4);
  // (1.025)^4 - 1 = 0.1038129... -> +10.38%
  assert.equal(Number(res.pct.toFixed(2)), 10.38);
  assert.ok(
    res.pct > 0,
    'stale comp must be adjusted toward valuation date (up in a rising market)'
  );
});

test('time adjustment: real index signal overrides default and is used', () => {
  const valuationDate = new Date(2026, 5, 30);
  const twoYears = 2 * 365.25 * 24 * 60 * 60 * 1000;
  const transactionDate = new Date(valuationDate.getTime() - twoYears);

  const res = computeTimeAdjustmentPct({
    transactionDate,
    valuationDate,
    annualPriceGrowthPct: 5
  });
  assert.equal(res.usedDefault, false);
  assert.equal(res.annualGrowthUsedPct, 5);
  // (1.05)^2 - 1 = 0.1025 -> +10.25%
  assert.equal(Number(res.pct.toFixed(2)), 10.25);
});

test('time adjustment: no date is neutral', () => {
  const res = computeTimeAdjustmentPct({
    transactionDate: null,
    valuationDate: new Date(2026, 5, 30),
    annualPriceGrowthPct: null
  });
  assert.equal(res.pct, 0);
});

// ---------------------------------------------------------------------------
// Location adjustment.
// ---------------------------------------------------------------------------

test('location adjustment: explicit signal drives it, clamped', () => {
  const res = computeLocationAdjustmentPct({
    compMarket: 'KR',
    compRegion: '부산',
    subjectMarket: 'KR',
    subjectProvince: '서울특별시',
    subjectVsCompPriceLevelPct: 12
  });
  assert.equal(res.basis, 'signal');
  assert.equal(res.pct, 12);

  const clamped = computeLocationAdjustmentPct({
    compMarket: 'KR',
    compRegion: '부산',
    subjectMarket: 'KR',
    subjectProvince: '서울특별시',
    subjectVsCompPriceLevelPct: 200
  });
  assert.equal(clamped.pct, MAX_FACTOR_ADJUSTMENT_PCT);
});

test('location adjustment: same submarket is neutral; categorical mismatch conservative', () => {
  const same = computeLocationAdjustmentPct({
    compMarket: 'KR',
    compRegion: '서울특별시 강남구',
    subjectMarket: 'KR',
    subjectProvince: '서울특별시',
    subjectVsCompPriceLevelPct: null
  });
  assert.equal(same.basis, 'same-submarket');
  assert.equal(same.pct, 0);

  const cross = computeLocationAdjustmentPct({
    compMarket: 'JP',
    compRegion: 'Tokyo',
    subjectMarket: 'KR',
    subjectProvince: '서울특별시',
    subjectVsCompPriceLevelPct: null
  });
  assert.equal(cross.basis, 'cross-market');
  assert.equal(cross.pct, 0);
});

// ---------------------------------------------------------------------------
// adjustComp — breakdown sums / compounding / clamp.
// ---------------------------------------------------------------------------

test('adjustComp: exposes breakdown and compounds factors', () => {
  const valuationDate = new Date(2026, 5, 30);
  const twoYears = 2 * 365.25 * 24 * 60 * 60 * 1000;
  const transactionDate = new Date(valuationDate.getTime() - twoYears);

  const adjusted = adjustComp({
    rawPricePerSqmKrw: 10_000_000,
    compAreaSqm: 20_000, // 2x subject -> size -6.9315%
    subjectAreaSqm: 10_000,
    transactionDate, // 2y stale -> time +5.0625% (default 2.5%/yr)
    valuationDate,
    annualPriceGrowthPct: null,
    compMarket: 'KR',
    compRegion: '서울특별시 강남구',
    subjectMarket: 'KR',
    subjectProvince: '서울특별시',
    subjectVsCompPriceLevelPct: null // same submarket -> 0
  });

  // Breakdown present, three factors, exposed labels.
  assert.equal(adjusted.factors.length, 3);
  const byFactor = Object.fromEntries(adjusted.factors.map((f) => [f.factor, f.pct]));
  // (1.025)^2 - 1 = 0.050625 -> +5.06%
  assert.equal(byFactor.time, 5.06);
  assert.equal(byFactor.size, -6.93);
  assert.equal(byFactor.location, 0);

  // Net compound = (1.050625)(0.930685)(1) - 1 using exact (pre-rounded) factors.
  // The implementation compounds the exact per-factor pcts; the RETURNED
  // netAdjustmentPct is that value rounded to 2dp.
  const exactNetFactor = (1 + 5.0625 / 100) * (1 + -6.931471805599453 / 100) * 1 - 1;
  assert.equal(adjusted.netAdjustmentPct, Number((exactNetFactor * 100).toFixed(2)));
  assert.equal(adjusted.netClamped, false);

  // Adjusted price equals raw * (1 + EXACT net), not the rounded display pct.
  assert.equal(adjusted.adjustedPricePerSqmKrw, 10_000_000 * (1 + exactNetFactor));
});

test('adjustComp: net adjustment is clamped so a wild comp cannot explode value', () => {
  const valuationDate = new Date(2026, 5, 30);
  // 10-year-stale + tiny comp + huge positive location signal -> would blow past
  // the net bound without clamping.
  const tenYears = 10 * 365.25 * 24 * 60 * 60 * 1000;
  const transactionDate = new Date(valuationDate.getTime() - tenYears);

  const adjusted = adjustComp({
    rawPricePerSqmKrw: 1_000_000,
    compAreaSqm: 100, // 0.01x subject -> size capped at +MAX_FACTOR
    subjectAreaSqm: 100_000,
    transactionDate,
    valuationDate,
    annualPriceGrowthPct: 12, // capped growth -> large time uplift, capped at +MAX_FACTOR
    compMarket: 'KR',
    compRegion: '서울특별시',
    subjectMarket: 'KR',
    subjectProvince: '서울특별시',
    subjectVsCompPriceLevelPct: 100 // capped at +MAX_FACTOR
  });

  // Every factor pegged at the per-factor cap.
  for (const f of adjusted.factors) {
    assert.ok(Math.abs(f.pct) <= MAX_FACTOR_ADJUSTMENT_PCT + 1e-9);
  }
  assert.equal(adjusted.netClamped, true);
  assert.equal(adjusted.netAdjustmentPct, MAX_NET_ADJUSTMENT_PCT);
  // Adjusted price is bounded: at most raw * 1.60.
  assert.ok(adjusted.adjustedPricePerSqmKrw <= 1_000_000 * 1.6 + 1);
});

// ---------------------------------------------------------------------------
// Hedonic threshold.
// ---------------------------------------------------------------------------

test('hedonic: refuses tiny samples below HEDONIC_MIN_COMPS', () => {
  assert.equal(HEDONIC_MIN_COMPS, 8);
  const small: Array<{ pricePerSqmKrw: number; areaSqm: number; ageYears: number }> = [];
  for (let i = 0; i < HEDONIC_MIN_COMPS - 1; i++) {
    small.push({ pricePerSqmKrw: 5_000_000 + i * 1000, areaSqm: 10_000 + i * 500, ageYears: i });
  }
  assert.equal(fitHedonic(small), null);
});

test('hedonic: fits a clean log-log relationship and predicts', () => {
  // Generate data from ln(p) = 16 - 0.1*ln(area) - 0.03*age exactly.
  const samples = [];
  for (let i = 0; i < 12; i++) {
    const area = 8_000 + i * 1_500;
    const age = i % 5;
    const lnP = 16 - 0.1 * Math.log(area) - 0.03 * age;
    samples.push({ pricePerSqmKrw: Math.exp(lnP), areaSqm: area, ageYears: age });
  }
  const fit = fitHedonic(samples);
  assert.ok(fit, 'fit should succeed on 12 clean samples');
  assert.equal(fit!.n, 12);
  assert.ok(fit!.r2 > 0.99, 'clean data -> near-perfect R2');
  assert.ok(Math.abs(fit!.betaLogArea - -0.1) < 1e-6);
  assert.ok(Math.abs(fit!.betaAge - -0.03) < 1e-6);

  const pred = predictHedonic(fit!, 10_000, 0);
  assert.ok(pred && pred > 0);
  assert.ok(Math.abs(pred! - Math.exp(16 - 0.1 * Math.log(10_000))) < 1);
});

// ---------------------------------------------------------------------------
// Integration: adjusted reconciled value differs from raw-weighted in the
// expected direction.
// ---------------------------------------------------------------------------

function baseInputs(overrides: Partial<ThreeApproachInputs> = {}): ThreeApproachInputs {
  return {
    rentableAreaSqm: 10_000,
    stabilizedNoiKrw: 5_000_000_000,
    capRatePct: 5,
    assetClass: 'OFFICE',
    stage: 'STABILIZED',
    subjectMarket: 'KR',
    subjectProvince: '서울특별시',
    subjectDistrict: '강남구',
    comparableSetEntries: [],
    transactionComps: [],
    approvalYear: 2015,
    regionalConstructionCostPerSqmKrw: 4_000_000,
    fallbackReplacementCostPerSqmKrw: 3_500_000,
    annualPriceGrowthPct: null,
    ...overrides
  };
}

test('integration: all-larger stale comps lift adjusted value (time) but size pulls down — net check', () => {
  const valuationYear = 2026;
  const valuationDate = new Date(valuationYear, 5, 30);
  const threeYears = 3 * 365.25 * 24 * 60 * 60 * 1000;
  const staleDate = new Date(valuationDate.getTime() - threeYears);

  // Comps SAME size as subject so size is neutral, but 3y stale -> time UP only.
  const inputs = baseInputs({
    transactionComps: [
      {
        pricePerSqmKrw: 10_000_000,
        areaSqm: 10_000,
        transactionDate: staleDate,
        market: 'KR',
        region: '서울특별시',
        subjectVsCompPriceLevelPct: null
      },
      {
        pricePerSqmKrw: 11_000_000,
        areaSqm: 10_000,
        transactionDate: staleDate,
        market: 'KR',
        region: '서울특별시',
        subjectVsCompPriceLevelPct: null
      }
    ]
  });

  const result = buildThreeApproachValuation(inputs, valuationYear);
  const sales = result.approaches.find((a) => a.approach === 'salesComparison')!;

  assert.ok(sales.compAdjustments && sales.compAdjustments.length === 2);
  assert.equal(typeof sales.rawWeightedPricePerSqmKrw, 'number');

  const adjustedPrice = sales.valuePerSqmKrw!;
  const rawPrice = sales.rawWeightedPricePerSqmKrw!;
  // Stale comps in a rising market -> adjusted ABOVE raw.
  assert.ok(adjustedPrice > rawPrice, 'time-adjusted stale comps should exceed raw-weighted');
  // (1.025)^3 - 1 = 0.076890625 -> displayed net 7.69%; every comp by exactly that.
  for (const rec of sales.compAdjustments!) {
    assert.equal(rec.netAdjustmentPct, 7.69);
  }
  // Adjusted weighted price uses the EXACT factor (uniform across comps), so
  // it equals rawWeighted * exact factor (within 1 KRW of the rounded raw
  // back-computation — both raw and adjusted are independently rounded).
  const exactTimeFactor = Math.pow(1.025, 3);
  assert.ok(Math.abs(adjustedPrice - Math.round(rawPrice * exactTimeFactor)) <= 1);
  // Exact pin: weighted raw = (10M*w1 + 11M*w2)/(w1+w2); both comps identical
  // weight (same area/recency/market) -> raw weighted = 10.5M, adjusted = round(10.5M*factor).
  assert.equal(adjustedPrice, Math.round(10_500_000 * exactTimeFactor));
});

test('integration: a fresh, larger comp gets pulled DOWN below raw (size dominates)', () => {
  const valuationYear = 2026;
  const valuationDate = new Date(valuationYear, 5, 30);

  // One comp, 2x size, transacted AT valuation date (no time effect), same submarket.
  const inputs = baseInputs({
    transactionComps: [
      {
        pricePerSqmKrw: 10_000_000,
        areaSqm: 20_000, // 2x -> size -6.93%
        transactionDate: valuationDate,
        market: 'KR',
        region: '서울특별시',
        subjectVsCompPriceLevelPct: null
      }
    ]
  });

  const result = buildThreeApproachValuation(inputs, valuationYear);
  const sales = result.approaches.find((a) => a.approach === 'salesComparison')!;
  assert.ok(sales.valuePerSqmKrw! < sales.rawWeightedPricePerSqmKrw!);
  assert.equal(sales.compAdjustments![0]!.netAdjustmentPct, -6.93);
});

test('integration: backward-compatible — legacy callers omitting growth/area still work', () => {
  const inputs = baseInputs({
    comparableSetEntries: [
      { pricePerSqmKrw: 9_000_000, areaSqm: null },
      { pricePerSqmKrw: 9_500_000, areaSqm: null }
    ]
  });
  const result = buildThreeApproachValuation(inputs, 2026);
  const sales = result.approaches.find((a) => a.approach === 'salesComparison')!;
  // No size/time/location signals -> adjusted equals raw weighted.
  assert.equal(sales.valuePerSqmKrw, sales.rawWeightedPricePerSqmKrw);
  assert.equal(result.reconciledValueKrw !== null, true);
});
