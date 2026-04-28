import assert from 'node:assert/strict';
import test from 'node:test';
import type { MacroSeries } from '@prisma/client';
import { SourceStatus } from '@prisma/client';
import { detectSeasonality, deseasonalize } from '@/lib/services/macro/seasonality';

function makeSeries(
  seriesKey: string,
  values: number[],
  startYear = 2023,
  startMonth = 0
): MacroSeries[] {
  const now = new Date();
  return values.map((value, i) => ({
    id: `${seriesKey}-${i}`,
    assetId: null,
    market: 'KR',
    seriesKey,
    label: seriesKey,
    frequency: 'monthly',
    observationDate: new Date(Date.UTC(startYear, startMonth + i, 1)),
    value,
    unit: '%',
    sourceSystem: 'test',
    sourceStatus: SourceStatus.FRESH,
    sourceUpdatedAt: now,
    citationId: null,
    createdAt: now,
    updatedAt: now
  }));
}

// Synthetic seasonal pattern: 12-month sinusoid + small noise — should trigger
// both tests. 36 observations = 3 full cycles.
function seasonalSine(periods: number, amplitude: number): number[] {
  const values: number[] = [];
  for (let cycle = 0; cycle < periods; cycle++) {
    for (let m = 0; m < 12; m++) {
      const season = amplitude * Math.sin((2 * Math.PI * m) / 12);
      const noise = (m % 3 === 0 ? 0.1 : -0.05) * amplitude * 0.05;
      values.push(50 + season + noise);
    }
  }
  return values;
}

test('detectSeasonality: strong 12-month pattern triggers hasSeasonality', () => {
  const series = makeSeries('rent_idx', seasonalSine(3, 5));
  const report = detectSeasonality(series, 'rent_idx', 'MONTHLY');
  assert.equal(report.hasSeasonality, true);
  assert.equal(report.periodLength, 12);
  assert.equal(report.seasonalIndex.length, 12);
  assert.ok(report.autocorrelation >= 0.3);
  assert.ok(report.fRatio >= 1.5);
});

test('detectSeasonality: pure noise does NOT trigger seasonality', () => {
  // 36 pseudo-random values around a constant mean — seeded deterministically.
  let seed = 42;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const values = Array.from({ length: 36 }, () => 50 + (rand() - 0.5) * 2);
  const series = makeSeries('noise', values);
  const report = detectSeasonality(series, 'noise', 'MONTHLY');
  assert.equal(report.hasSeasonality, false);
  assert.ok(report.reason.length > 0);
});

test('detectSeasonality: too few observations returns empty report', () => {
  const series = makeSeries('short', [1, 2, 3, 4, 5]);
  const report = detectSeasonality(series, 'short', 'MONTHLY');
  assert.equal(report.hasSeasonality, false);
  assert.ok(report.reason.includes('need at least'));
});

test('detectSeasonality: quarterly pattern detected with QUARTERLY period', () => {
  // 12 years of quarterly data with Q4 push
  const values: number[] = [];
  for (let y = 0; y < 6; y++) {
    for (let q = 0; q < 4; q++) {
      const push = q === 3 ? 3.0 : 0; // Q4 bump
      values.push(10 + push);
    }
  }
  // Inject each quarter as 3 monthly observations so slotIndex math still works
  const monthly = values.flatMap((v) => [v, v, v]);
  const series = makeSeries('q_push', monthly);
  const report = detectSeasonality(series, 'q_push', 'QUARTERLY');
  assert.equal(report.hasSeasonality, true);
  // Q4 (index 3) should have highest positive seasonal index
  const q4 = report.seasonalIndex[3]!;
  const others = [report.seasonalIndex[0]!, report.seasonalIndex[1]!, report.seasonalIndex[2]!];
  assert.ok(q4 > Math.max(...others), `Q4 index ${q4} should exceed others ${others.join(', ')}`);
});

test('deseasonalize: returns raw series when no seasonality detected', () => {
  const series = makeSeries('short', [1, 2, 3, 4, 5]);
  const report = detectSeasonality(series, 'short', 'MONTHLY');
  const adjusted = deseasonalize(series, 'short', report);
  assert.equal(adjusted.length, 5);
  assert.deepEqual(
    adjusted.map((a) => a.deseasonalized),
    adjusted.map((a) => a.raw)
  );
});

test('deseasonalize: smooths out seasonal spikes', () => {
  const series = makeSeries('rent_idx', seasonalSine(3, 5));
  const report = detectSeasonality(series, 'rent_idx', 'MONTHLY');
  const adjusted = deseasonalize(series, 'rent_idx', report);
  assert.equal(adjusted.length, 36);
  const rawVar = variance(adjusted.map((a) => a.raw));
  const adjVar = variance(adjusted.map((a) => a.deseasonalized));
  assert.ok(adjVar < rawVar, `deseasonalized variance ${adjVar} should be < raw ${rawVar}`);
});

function variance(vs: number[]): number {
  const m = vs.reduce((s, v) => s + v, 0) / vs.length;
  return vs.reduce((s, v) => s + (v - m) ** 2, 0) / vs.length;
}
