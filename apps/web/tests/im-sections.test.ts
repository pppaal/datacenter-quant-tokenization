import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeCapitalStructure,
  computeLeaseRollSummary,
  computeReturnsSnapshot,
  formatMacroValue,
  pickMacroBackdrop,
  rollupTenantCredit
} from '@/lib/services/im/sections';

test('pickMacroBackdrop picks latest per series and orders by canonical headline', () => {
  const series = [
    {
      seriesKey: 'kr.cpi_yoy_pct',
      label: 'CPI',
      value: 2.1,
      unit: 'pct',
      observationDate: new Date('2026-01-01')
    },
    {
      seriesKey: 'kr.cpi_yoy_pct',
      label: 'CPI',
      value: 2.4,
      unit: 'pct',
      observationDate: new Date('2026-04-01')
    },
    {
      seriesKey: 'kr.policy_rate_pct',
      label: 'Policy rate',
      value: 3.5,
      unit: 'pct',
      observationDate: new Date('2026-04-01')
    }
  ];
  const out = pickMacroBackdrop(series);
  assert.equal(out[0]!.seriesKey, 'kr.policy_rate_pct'); // canonical first
  // Latest CPI should be 2.4, not 2.1
  const cpi = out.find((p) => p.seriesKey === 'kr.cpi_yoy_pct');
  assert.equal(cpi?.value, 2.4);
});

test('pickMacroBackdrop returns at most 6 entries', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({
    seriesKey: `series.${i}`,
    label: `S${i}`,
    value: i,
    unit: 'pct',
    observationDate: new Date('2026-04-01')
  }));
  const out = pickMacroBackdrop(many);
  assert.equal(out.length, 6);
});

test('formatMacroValue handles common units', () => {
  assert.equal(formatMacroValue({ value: 3.1234, unit: 'pct' }), '3.12%');
  assert.equal(formatMacroValue({ value: 215, unit: 'bps' }), '215 bps');
  assert.equal(formatMacroValue({ value: 102.4, unit: 'idx' }), '102.4');
  assert.equal(formatMacroValue({ value: 12345, unit: null }), '12,345');
});

test('computeLeaseRollSummary computes WALT + weighted rent + MTM gap', () => {
  const summary = computeLeaseRollSummary([
    {
      tenantName: 'A',
      leasedKw: 10,
      startYear: 1,
      termYears: 10,
      baseRatePerKwKrw: 220_000,
      annualEscalationPct: 2,
      markToMarketRatePerKwKrw: 240_000
    },
    {
      tenantName: 'B',
      leasedKw: 10,
      startYear: 1,
      termYears: 5,
      baseRatePerKwKrw: 200_000,
      annualEscalationPct: 2,
      markToMarketRatePerKwKrw: 220_000
    }
  ]);
  assert.equal(summary.totalLeasedKw, 20);
  assert.equal(summary.weightedAvgTermYears, 7.5);
  assert.equal(summary.weightedRentPerKwKrw, 210_000);
  // mtm gap: blended in-place 210k, blended mtm 230k → +9.52%
  assert.ok(Math.abs(summary.markToMarketGapPct! - 9.5238095) < 1e-3);
});

test('computeCapitalStructure: weighted rate by commitment + drawn pct', () => {
  const cs = computeCapitalStructure([
    { facilityType: 'SENIOR', lenderName: 'A', commitmentKrw: 100, drawnAmountKrw: 80, interestRatePct: 4 },
    { facilityType: 'MEZZ', lenderName: 'B', commitmentKrw: 50, drawnAmountKrw: 50, interestRatePct: 8 }
  ]);
  assert.equal(cs.totalCommitmentKrw, 150);
  assert.equal(cs.totalDrawnKrw, 130);
  // (4*100 + 8*50) / 150 = 800/150 = 5.333
  assert.ok(Math.abs(cs.blendedRatePct - 5.333333) < 1e-3);
  // 130 / 150 = 86.67%
  assert.ok(Math.abs(cs.drawnPctOfCommitment - 86.666666) < 1e-3);
});

test('computeReturnsSnapshot: pulls base/bull/bear and computes upside/downside', () => {
  const r = computeReturnsSnapshot([
    { name: 'Bull Case', valuationKrw: 110, impliedYieldPct: 5.0, exitCapRatePct: 4.5, debtServiceCoverage: 1.6 },
    { name: 'Base Case', valuationKrw: 100, impliedYieldPct: 5.5, exitCapRatePct: 5.0, debtServiceCoverage: 1.4 },
    { name: 'Bear Case', valuationKrw: 88, impliedYieldPct: 6.0, exitCapRatePct: 5.5, debtServiceCoverage: 1.1 }
  ]);
  assert.equal(r.baseValueKrw, 100);
  assert.equal(r.upsideToBullPct, 10);
  assert.equal(r.downsideToBearPct, -12);
  assert.equal(r.goingInYieldPct, 5.5);
  assert.equal(r.exitCapPct, 5);
  assert.ok(Math.abs(r.minDscr! - 1.1) < 1e-9);
});

test('rollupTenantCredit: average score, risk mix, high-risk names', () => {
  const out = rollupTenantCredit([
    { counterparty: { name: 'Samsung', role: 'TENANT' }, score: 80, riskLevel: 'LOW', summary: '' },
    { counterparty: { name: 'Hyundai', role: 'TENANT' }, score: 60, riskLevel: 'MODERATE', summary: '' },
    { counterparty: { name: 'WeakCo', role: 'TENANT' }, score: 30, riskLevel: 'HIGH', summary: '' }
  ]);
  assert.equal(out.count, 3);
  assert.ok(Math.abs(out.averageScore - 56.666666) < 1e-3);
  assert.deepEqual(out.riskMix, { LOW: 1, MODERATE: 1, HIGH: 1 });
  assert.deepEqual(out.highRiskNames, ['WeakCo']);
});

test('rollupTenantCredit: empty input returns zeroes', () => {
  const out = rollupTenantCredit([]);
  assert.equal(out.count, 0);
  assert.deepEqual(out.riskMix, {});
});
