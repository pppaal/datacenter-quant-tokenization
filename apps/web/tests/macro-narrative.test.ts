import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTemplateNarrative, type MacroNarrativeInput } from '@/lib/services/macro/narrative';
import type { MacroInterpretation } from '@/lib/services/macro/regime';
import type { TrendAnalysis } from '@/lib/services/macro/trend';

function makeRegime(overrides?: Partial<MacroInterpretation>): MacroInterpretation {
  return {
    market: 'KR',
    asOf: '2026-03-01',
    series: [],
    assetClass: 'DATA_CENTER',
    profile: { assetClass: 'DATA_CENTER', label: 'Data Center', market: 'KR', country: 'KR', submarket: null, adjustmentSummary: [], capitalRateSensitivity: 1.2, liquiditySensitivity: 0.9, leasingSensitivity: 0.8, constructionSensitivity: 1.3 },
    regimes: {
      capitalMarkets: { key: 'capitalMarkets', label: 'Restrictive', state: 'TIGHT', commentary: 'Rates are high.', signals: ['Rate hike'] },
      leasing: { key: 'leasing', label: 'Stable', state: 'BALANCED', commentary: 'Leasing is stable.', signals: [] },
      construction: { key: 'construction', label: 'Moderate', state: 'ELEVATED', commentary: 'Construction costs rising.', signals: [] },
      refinance: { key: 'refinance', label: 'Cooling', state: 'TIGHT', commentary: 'Refinancing is tight.', signals: ['Spread widening'] }
    },
    guidance: {
      discountRateShiftPct: 0.5,
      exitCapRateShiftPct: 0.3,
      debtCostShiftPct: 0.2,
      occupancyShiftPct: -1.0,
      growthShiftPct: -0.5,
      replacementCostShiftPct: 2.0,
      summary: ['Discount rate +0.5%', 'Exit cap rate +0.3%']
    },
    factors: [
      { key: 'rate_level', label: 'Rate Level', value: 6.5, unit: '%', isObserved: true, direction: 'NEGATIVE', commentary: 'Rates are high.', inputs: [] },
      { key: 'credit_stress', label: 'Credit Stress', value: 200, unit: 'bps', isObserved: true, direction: 'NEUTRAL', commentary: 'Credit is okay.', inputs: [] },
      { key: 'property_demand', label: 'Property Demand', value: 5, unit: 'score', isObserved: true, direction: 'NEGATIVE', commentary: 'Demand weakening.', inputs: [] },
      { key: 'liquidity', label: 'Liquidity', value: 95, unit: 'idx', isObserved: true, direction: 'NEUTRAL', commentary: 'Liquidity is fine.', inputs: [] },
      { key: 'growth_momentum', label: 'Growth Momentum', value: 1.5, unit: '%', isObserved: true, direction: 'POSITIVE', commentary: 'Growth is supportive.', inputs: [] }
    ],
    impacts: { dimensions: [], paths: [], summary: [] },
    ...overrides
  };
}

function makeTrends(): TrendAnalysis[] {
  return [
    {
      seriesKey: 'policy_rate_pct',
      label: 'Policy Rate',
      direction: 'RISING',
      momentum: 0.15,
      acceleration: 0.01,
      movingAverages: { 3: 5.0, 6: 4.8, 12: 4.5 },
      anomaly: null,
      observationCount: 12
    },
    {
      seriesKey: 'vacancy_pct',
      label: 'Vacancy',
      direction: 'ACCELERATING_UP',
      momentum: 0.3,
      acceleration: 0.05,
      movingAverages: { 3: 5.5, 6: 5.0, 12: 4.5 },
      anomaly: { seriesKey: 'vacancy_pct', zScore: 2.5, rollingMean: 4.5, rollingStdDev: 0.4, currentValue: 5.5, isAnomaly: true, severity: 'MODERATE' },
      observationCount: 12
    }
  ];
}

test('buildTemplateNarrative generates a complete narrative', () => {
  const input: MacroNarrativeInput = {
    market: 'KR',
    asOf: '2026-03-01',
    regime: makeRegime(),
    trends: makeTrends()
  };

  const narrative = buildTemplateNarrative(input);

  assert.ok(narrative.headline.includes('KR'));
  assert.ok(narrative.headline.includes('defensive'));
  assert.ok(narrative.whatChanged.length > 0);
  assert.ok(narrative.portfolioImplication.length > 0);
  assert.ok(narrative.watchItems.length > 0);
  assert.equal(narrative.cached, false);
});

test('buildTemplateNarrative identifies constructive stance when tailwinds dominate', () => {
  const regime = makeRegime({
    factors: [
      { key: 'rate_level', label: 'Rate Level', value: 3.5, unit: '%', isObserved: true, direction: 'POSITIVE', commentary: 'Rates supportive.', inputs: [] },
      { key: 'liquidity', label: 'Liquidity', value: 110, unit: 'idx', isObserved: true, direction: 'POSITIVE', commentary: 'Healthy liquidity.', inputs: [] },
      { key: 'growth_momentum', label: 'Growth', value: 3.0, unit: '%', isObserved: true, direction: 'POSITIVE', commentary: 'Growth strong.', inputs: [] }
    ]
  });

  const narrative = buildTemplateNarrative({
    market: 'US',
    asOf: '2026-03-01',
    regime,
    trends: []
  });

  assert.ok(narrative.headline.includes('constructive'));
});

test('buildTemplateNarrative captures period-over-period changes', () => {
  const previousRegime = makeRegime({
    factors: [
      { key: 'rate_level', label: 'Rate Level', value: 5.5, unit: '%', isObserved: true, direction: 'NEUTRAL', commentary: 'Rates workable.', inputs: [] },
      { key: 'credit_stress', label: 'Credit Stress', value: 250, unit: 'bps', isObserved: true, direction: 'NEGATIVE', commentary: 'Credit stressed.', inputs: [] }
    ]
  });

  const narrative = buildTemplateNarrative({
    market: 'KR',
    asOf: '2026-03-01',
    regime: makeRegime(),
    trends: [],
    previousRegime
  });

  // Should mention that credit stress has eased (was NEGATIVE, now NEUTRAL)
  assert.ok(narrative.whatChanged.length > 0);
});

test('buildTemplateNarrative includes anomaly risk callout', () => {
  const narrative = buildTemplateNarrative({
    market: 'KR',
    asOf: '2026-03-01',
    regime: makeRegime(),
    trends: makeTrends()
  });

  assert.ok(narrative.riskCallout);
  assert.ok(narrative.riskCallout.includes('Anomaly'));
  assert.ok(narrative.riskCallout.includes('z-score'));
});

test('buildTemplateNarrative returns null riskCallout when no anomalies', () => {
  const trendsNoAnomaly = makeTrends().map((t) => ({ ...t, anomaly: null }));

  const narrative = buildTemplateNarrative({
    market: 'KR',
    asOf: '2026-03-01',
    regime: makeRegime(),
    trends: trendsNoAnomaly
  });

  assert.equal(narrative.riskCallout, null);
});

test('buildTemplateNarrative includes portfolio implication with guidance shifts', () => {
  const narrative = buildTemplateNarrative({
    market: 'KR',
    asOf: '2026-03-01',
    regime: makeRegime(),
    trends: []
  });

  assert.ok(narrative.portfolioImplication.includes('discount rate'));
  assert.ok(narrative.portfolioImplication.includes('DATA_CENTER'));
});

test('buildTemplateNarrative limits watch items to 5', () => {
  const manyNegativeFactors = Array.from({ length: 8 }, (_, i) => ({
    key: `factor_${i}` as any,
    label: `Factor ${i}`,
    value: i,
    unit: 'score',
    isObserved: true,
    direction: 'NEGATIVE' as const,
    commentary: `Factor ${i} is problematic.`,
    inputs: []
  }));

  const narrative = buildTemplateNarrative({
    market: 'KR',
    asOf: '2026-03-01',
    regime: makeRegime({ factors: manyNegativeFactors }),
    trends: []
  });

  assert.ok(narrative.watchItems.length <= 5);
});
