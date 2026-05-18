import assert from 'node:assert/strict';
import test from 'node:test';
import { projectCfadsDscr } from '@/lib/services/im/cash-flow';
import { buildCounterpartyRollup } from '@/lib/services/im/counterparty-rollup';
import { buildEsgSummary } from '@/lib/services/im/esg';
import { buildFxExposure } from '@/lib/services/im/fx-exposure';
import { buildPeerComparison, pickSectorKey } from '@/lib/services/im/peer-benchmarks';
import { buildTaxWalk } from '@/lib/services/im/tax-walk';

// ---- DSCR forward path ----

test('projectCfadsDscr returns horizonYears+1 rows with descending DSCR pressure', () => {
  const rows = projectCfadsDscr(
    {
      revenueKrw: 27_060_000_000,
      ebitdaMarginPct: 32.7,
      interestRatePct: 5.4,
      totalDebtKrw: 34_440_000_000
    },
    {
      revenueGrowthPct: 2.1,
      debtAmortizationPct: 12.1,
      horizonYears: 10,
      taxRate: 0.242
    }
  );
  assert.equal(rows.length, 11);
  // DSCR should generally improve as debt amortizes
  assert.ok(rows[10]!.cfadsDscr! > rows[0]!.cfadsDscr!);
  // Last year debt is much smaller than first
  assert.ok(rows[10]!.debtServiceKrw < rows[0]!.debtServiceKrw);
});

// ---- Counterparty rollup ----

test('buildCounterpartyRollup aggregates risk mix + weighted ratios', () => {
  const r = buildCounterpartyRollup([
    {
      id: '1',
      name: 'Sponsor A',
      role: 'SPONSOR',
      financialStatements: [
        {
          revenueKrw: 100,
          ebitdaKrw: 32,
          totalDebtKrw: 120,
          interestExpenseKrw: 8,
          creditAssessments: [{ score: 70, riskLevel: 'MODERATE' }]
        }
      ]
    },
    {
      id: '2',
      name: 'Tenant B',
      role: 'TENANT',
      financialStatements: [
        {
          revenueKrw: 200,
          ebitdaKrw: 50,
          totalDebtKrw: 60,
          interestExpenseKrw: 4,
          creditAssessments: [{ score: 85, riskLevel: 'LOW' }]
        }
      ]
    }
  ]);
  assert.ok(r);
  assert.equal(r!.counterpartyCount, 2);
  assert.equal(r!.weightingBasis, 'ebitda');
  // Score weighted by EBITDA: (70*32 + 85*50) / (32+50) = 6490/82 ≈ 79.15
  assert.ok(Math.abs(r!.averageScore! - (70 * 32 + 85 * 50) / 82) < 0.1);
  // Total debt 180 / total EBITDA 82 = 2.20x
  assert.ok(Math.abs(r!.weightedLeverage! - 180 / 82) < 0.01);
  assert.equal(r!.riskMix.LOW, 1);
  assert.equal(r!.riskMix.MODERATE, 1);
  assert.equal(r!.weakestCounterpartyName, 'Sponsor A');
});

test('buildCounterpartyRollup returns null on empty input', () => {
  assert.equal(buildCounterpartyRollup([]), null);
});

// ---- Peer benchmarks ----

test('buildPeerComparison classifies into top / mid / bottom bands', () => {
  const out = buildPeerComparison(
    {
      leverage: 3.0,
      interestCoverage: 4.0,
      ebitdaMargin: 40
    },
    'KR_DATA_CENTER'
  );
  // KR data center leverage benchmarks: median 4.2, pct25 5.0, pct75 3.5
  // 3.0 ≤ 3.5 → 'top' for lower-preferred
  const lev = out.comparisons.find((c) => c.ratioKey === 'leverage');
  assert.equal(lev?.band, 'top');
  // interest coverage median 2.8, pct75 3.5 → 4.0 >= 3.5 → 'top'
  const ic = out.comparisons.find((c) => c.ratioKey === 'interestCoverage');
  assert.equal(ic?.band, 'top');
});

test('buildPeerComparison returns null band for missing observations', () => {
  const out = buildPeerComparison({ leverage: null }, 'KR_DATA_CENTER');
  assert.equal(out.comparisons[0]!.band, null);
});

test('pickSectorKey routes asset class to benchmark set', () => {
  assert.equal(pickSectorKey('DATA_CENTER', 'KR'), 'KR_DATA_CENTER');
  assert.equal(pickSectorKey('OFFICE', 'KR'), 'KR_OFFICE');
  assert.equal(pickSectorKey('UNKNOWN', 'KR'), 'KR_DATA_CENTER');
});

// ---- Tax walk ----

test('buildTaxWalk builds 6 lines and sums total cash outflow', () => {
  const w = buildTaxWalk(
    {
      acquisitionTaxPct: 4.6,
      propertyTaxPct: 0.34,
      corporateTaxPct: 24.2,
      exitTaxPct: 1.2,
      vatRecoveryPct: 92,
      withholdingTaxPct: 15.4,
      insurancePct: 0.11
    },
    {
      purchasePriceKrw: 100_000_000_000,
      cumulativeNoiKrw: 50_000_000_000,
      exitValueKrw: 130_000_000_000,
      holdYears: 10
    }
  );
  // 6 categories that have data
  assert.equal(w.rows.length, 6);
  assert.ok(w.totalCashOutflowKrw > 0);
  assert.ok(w.effectiveDragOnGrossPct! > 0);
  // Acquisition tax: 100B × 4.6% = 4.6B
  const acq = w.rows.find((r) => r.category === 'acquisition');
  assert.equal(acq?.totalCashOutflowKrw, 4_600_000_000);
  // Property tax × 10y: 100B × 0.34% × 10y = 3.4B
  const prop = w.rows.find((r) => r.category === 'property');
  assert.equal(prop?.totalCashOutflowKrw, 3_400_000_000);
});

test('buildTaxWalk returns empty when no tax assumptions', () => {
  const w = buildTaxWalk(null, {
    purchasePriceKrw: 100_000_000_000,
    cumulativeNoiKrw: 0,
    exitValueKrw: 0,
    holdYears: 10
  });
  assert.deepEqual(w.rows, []);
});

// ---- ESG ----

test('buildEsgSummary classifies PUE / renewable / backup into bands', () => {
  const e = buildEsgSummary({
    utilityName: 'KEPCO',
    pueTarget: 1.31,
    renewableAvailabilityPct: 32,
    backupFuelHours: 48,
    tariffKrwPerKwh: 143,
    substationDistanceKm: 1.2
  });
  assert.ok(e);
  // PUE 1.31 → between 1.30 and 1.45 → 'moderate' band
  const pue = e!.rows.find((r) => r.key === 'pue');
  assert.equal(pue?.tone, 'warn');
  assert.equal(pue?.band, 'moderate');
  // Renewable 32 → between 20 and 40 → 'moderate'
  const ren = e!.rows.find((r) => r.key === 'renewable');
  assert.equal(ren?.tone, 'warn');
  // Backup 48 → between 24 and 72 → 'moderate'
  const bk = e!.rows.find((r) => r.key === 'backup');
  assert.equal(bk?.tone, 'warn');
  // Composite: any 'risk' overrides; here all moderate → 'warn'
  assert.equal(e!.composite, 'warn');
});

test('buildEsgSummary returns null on missing snapshot', () => {
  assert.equal(buildEsgSummary(null), null);
});

// ---- FX exposure ----

test('buildFxExposure builds 5-row sensitivity for foreign LP base', () => {
  const fx = buildFxExposure(260_000_000_000, {
    assetCurrency: 'KRW',
    lpBaseCurrency: 'USD',
    spotRate: 1380
  });
  assert.ok(fx);
  assert.equal(fx!.sensitivity.length, 5);
  // baseValueAtSpot ≈ 260B / 1380 ≈ 188.4M USD
  assert.ok(Math.abs(fx!.baseValueAtSpot - 260_000_000_000 / 1380) < 1);
  assert.equal(fx!.exposureBand, 'high');
});

test('buildFxExposure returns null when base = asset currency', () => {
  assert.equal(
    buildFxExposure(100, { assetCurrency: 'KRW', lpBaseCurrency: 'KRW' }),
    null
  );
});
