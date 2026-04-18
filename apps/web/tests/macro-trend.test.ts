import assert from 'node:assert/strict';
import test from 'node:test';
import type { MacroSeries } from '@prisma/client';
import { SourceStatus } from '@prisma/client';
import {
  computeRollingStats,
  detectAnomaly,
  detectTrend,
  buildFullTrendAnalysis,
  buildFactorTrendMap
} from '@/lib/services/macro/trend';

function makeSeries(seriesKey: string, values: number[]): MacroSeries[] {
  const base = new Date('2026-01-01T00:00:00.000Z');
  const now = new Date();
  return values.map((value, i) => ({
    id: `${seriesKey}-${i}`,
    assetId: null,
    market: 'US',
    seriesKey,
    label: seriesKey,
    frequency: 'monthly',
    observationDate: new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + i, 1)),
    value,
    unit: '%',
    sourceSystem: 'test',
    sourceStatus: SourceStatus.FRESH,
    sourceUpdatedAt: now,
    createdAt: now,
    updatedAt: now
  }));
}

test('computeRollingStats returns correct mean and stdDev', () => {
  const series = makeSeries('policy_rate_pct', [4.0, 4.5, 5.0, 5.5, 6.0, 6.5]);
  const stats = computeRollingStats(series, 'policy_rate_pct', 3);

  assert.equal(stats.seriesKey, 'policy_rate_pct');
  assert.equal(stats.window, 3);
  assert.equal(stats.count, 3);
  assert.equal(stats.isComplete, true);
  // Most recent 3 values (sorted desc): 6.5, 6.0, 5.5 → mean = 6.0
  assert.ok(Math.abs(stats.mean - 6.0) < 0.01);
  assert.ok(stats.stdDev > 0);
});

test('computeRollingStats handles incomplete window', () => {
  const series = makeSeries('policy_rate_pct', [4.0, 4.5]);
  const stats = computeRollingStats(series, 'policy_rate_pct', 6);

  assert.equal(stats.count, 2);
  assert.equal(stats.isComplete, false);
});

test('detectAnomaly flags an outlier', () => {
  // 5 stable values then a spike
  const series = makeSeries('credit_spread_bps', [150, 155, 148, 152, 149, 300]);
  const anomaly = detectAnomaly(series, 'credit_spread_bps', 6);

  assert.ok(anomaly);
  assert.equal(anomaly.isAnomaly, true);
  assert.ok(anomaly.zScore > 2.0);
  assert.equal(anomaly.currentValue, 300);
});

test('detectAnomaly returns null for too few observations', () => {
  const series = makeSeries('credit_spread_bps', [150, 155]);
  const anomaly = detectAnomaly(series, 'credit_spread_bps');

  assert.equal(anomaly, null);
});

test('detectAnomaly returns non-anomaly for stable series', () => {
  const series = makeSeries('credit_spread_bps', [150, 151, 149, 150, 152, 150]);
  const anomaly = detectAnomaly(series, 'credit_spread_bps');

  assert.ok(anomaly);
  assert.equal(anomaly.isAnomaly, false);
  assert.equal(anomaly.severity, 'MILD');
});

test('detectTrend identifies rising trend', () => {
  // Steadily rising values (chronological: 2.0 → 4.5)
  const series = makeSeries('rent_growth_pct', [2.0, 2.5, 3.0, 3.5, 4.0, 4.5]);
  const trend = detectTrend(series, 'rent_growth_pct');

  assert.equal(trend.seriesKey, 'rent_growth_pct');
  assert.ok(trend.momentum > 0);
  assert.ok(trend.direction === 'RISING' || trend.direction === 'ACCELERATING_UP');
});

test('detectTrend identifies declining trend', () => {
  // Steadily declining (chronological: 6.0 → 3.5)
  const series = makeSeries('vacancy_pct', [6.0, 5.5, 5.0, 4.5, 4.0, 3.5]);
  const trend = detectTrend(series, 'vacancy_pct');

  assert.ok(trend.momentum < 0);
  assert.ok(trend.direction === 'DECLINING' || trend.direction === 'ACCELERATING_DOWN');
});

test('detectTrend classifies flat series', () => {
  const series = makeSeries('inflation_pct', [2.5, 2.5, 2.5, 2.5, 2.5, 2.5]);
  const trend = detectTrend(series, 'inflation_pct');

  assert.equal(trend.direction, 'FLAT');
  assert.ok(Math.abs(trend.momentum) < 0.05);
});

test('detectTrend computes moving averages', () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const series = makeSeries('policy_rate_pct', values);
  const trend = detectTrend(series, 'policy_rate_pct');

  assert.ok(trend.movingAverages[3] !== null);
  assert.ok(trend.movingAverages[6] !== null);
  assert.ok(trend.movingAverages[12] !== null);
  assert.equal(trend.observationCount, 12);
});

test('buildFullTrendAnalysis returns trends for all unique series keys', () => {
  const series = [
    ...makeSeries('policy_rate_pct', [3.0, 3.5, 4.0]),
    ...makeSeries('inflation_pct', [2.0, 2.2, 2.4]),
    ...makeSeries('vacancy_pct', [5.0, 4.8, 4.6])
  ];
  const trends = buildFullTrendAnalysis(series);

  assert.equal(trends.length, 3);
  const keys = trends.map((t) => t.seriesKey);
  assert.ok(keys.includes('policy_rate_pct'));
  assert.ok(keys.includes('inflation_pct'));
  assert.ok(keys.includes('vacancy_pct'));
});

test('buildFactorTrendMap maps factor keys to their primary series trends', () => {
  const series = [
    ...makeSeries('policy_rate_pct', [3.0, 3.5, 4.0, 4.5, 5.0, 5.5]),
    ...makeSeries('credit_spread_bps', [140, 150, 160, 170, 180, 190]),
    ...makeSeries('vacancy_pct', [6.0, 5.5, 5.0, 4.5, 4.0, 3.5])
  ];
  const map = buildFactorTrendMap(series);

  assert.ok(map['rate_level']);
  assert.ok(map['rate_momentum_bps']);
  assert.ok(map['credit_stress']);
  assert.ok(map['property_demand']);

  // rate_level maps to policy_rate_pct which is rising
  assert.ok(map['rate_level'].momentum > 0);
  // property_demand maps to vacancy_pct which is declining
  assert.ok(map['property_demand'].momentum < 0);
});
