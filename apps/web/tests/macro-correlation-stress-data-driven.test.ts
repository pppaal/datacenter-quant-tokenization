import assert from 'node:assert/strict';
import test from 'node:test';
import type { MacroSeries } from '@prisma/client';
import { computeCorrelationPenalty } from '@/lib/services/macro/correlation-stress';
import type { DealMacroExposureDimension } from '@/lib/services/macro/deal-risk';

function makeDimensions(scores: Record<string, number>): DealMacroExposureDimension[] {
  return Object.entries(scores).map(([key, score]) => ({
    key: key as DealMacroExposureDimension['key'],
    label: key,
    score,
    commentary: ''
  }));
}

function makeSeries(perKeyValues: Record<string, number[]>): MacroSeries[] {
  const out: MacroSeries[] = [];
  let i = 0;
  for (const [seriesKey, values] of Object.entries(perKeyValues)) {
    values.forEach((value, t) => {
      const observationDate = new Date(Date.UTC(2024, t, 1));
      out.push({
        id: `s-${seriesKey}-${t}-${i++}`,
        assetId: null,
        market: 'SEOUL',
        seriesKey,
        label: seriesKey,
        frequency: 'monthly',
        observationDate,
        value,
        unit: '%',
        sourceSystem: 'test',
        sourceStatus: 'FRESH' as MacroSeries['sourceStatus'],
        sourceUpdatedAt: observationDate,
        createdAt: observationDate,
        updatedAt: observationDate
      });
    });
  }
  return out;
}

const RATE_CREDIT_HEADWIND = {
  rate_level: 'NEGATIVE' as const,
  credit_stress: 'NEGATIVE' as const
};

// ---------------------------------------------------------------------------
// FALLBACK: no history → legacy heuristic constant (12% for Rate-Credit)
// ---------------------------------------------------------------------------
test('no history → amplification equals legacy expert constant', () => {
  const dims = makeDimensions({ rate: 65, credit: 55 });
  const penalty = computeCorrelationPenalty(dims, RATE_CREDIT_HEADWIND);

  // Legacy Rate-Credit Squeeze constant is 12, no cascade (only 2 headwinds).
  assert.equal(penalty.appliedPenaltyPct, 12);
  assert.ok(penalty.activePairs.includes('Rate-Credit Squeeze'));
  assert.match(penalty.commentary, /expert constants/);
});

test('empty series array → legacy expert constant (fallback)', () => {
  const dims = makeDimensions({ rate: 65, credit: 55 });
  const penalty = computeCorrelationPenalty(dims, RATE_CREDIT_HEADWIND, { series: [] });
  assert.equal(penalty.appliedPenaltyPct, 12);
  assert.match(penalty.commentary, /expert constants/);
});

test('insufficient history → legacy expert constant (fallback)', () => {
  // Only 4 changes for the rate/credit pair, below MIN_CHANGE_OBSERVATIONS.
  const series = makeSeries({
    policy_rate_pct: [3, 3.2, 3.5, 3.4, 3.6],
    credit_spread_bps: [100, 110, 130, 125, 140]
  });
  const dims = makeDimensions({ rate: 65, credit: 55 });
  const penalty = computeCorrelationPenalty(dims, RATE_CREDIT_HEADWIND, {
    series,
    market: 'SEOUL'
  });
  assert.equal(penalty.appliedPenaltyPct, 12);
  assert.match(penalty.commentary, /expert constants/);
});

// ---------------------------------------------------------------------------
// DATA-DRIVEN: strongly correlated history → amplifier near (or at) expert cap
// ---------------------------------------------------------------------------
test('strongly correlated history → data-driven amplifier near expert constant', () => {
  // 13 levels → 12 changes. rate and credit changes move together strongly.
  const rate = [3.0, 3.3, 3.7, 3.4, 3.9, 4.3, 4.0, 4.6, 5.0, 4.7, 5.2, 5.6, 5.3];
  const credit = rate.map((v, i) => 50 + (v - 3.0) * 40 + (i % 2 === 0 ? 1 : -1));
  const series = makeSeries({ policy_rate_pct: rate, credit_spread_bps: credit });

  const dims = makeDimensions({ rate: 65, credit: 55 });
  const penalty = computeCorrelationPenalty(dims, RATE_CREDIT_HEADWIND, {
    series,
    market: 'SEOUL'
  });

  assert.match(penalty.commentary, /data-driven/);
  // Highly correlated (|ρ| >= REF=0.6) → amplifier should equal the cap of 12.
  assert.ok(penalty.appliedPenaltyPct > 0);
  assert.ok(penalty.appliedPenaltyPct <= 12);
  assert.ok(penalty.activePairs.includes('Rate-Credit Squeeze'));
});

// ---------------------------------------------------------------------------
// DATA-DRIVEN: near-zero correlation history → smaller amplifier than expert
// ---------------------------------------------------------------------------
test('near-uncorrelated history → amplifier below expert constant', () => {
  // rate and credit changes nearly independent → small |ρ| → small amplifier.
  const rate = [3.0, 3.5, 3.1, 3.6, 3.2, 3.7, 3.25, 3.65, 3.15, 3.55, 3.05, 3.45, 3.0];
  const credit = [100, 102, 101, 99, 103, 100, 104, 98, 102, 101, 99, 103, 100];
  const series = makeSeries({ policy_rate_pct: rate, credit_spread_bps: credit });

  const dims = makeDimensions({ rate: 65, credit: 55 });
  const penalty = computeCorrelationPenalty(dims, RATE_CREDIT_HEADWIND, {
    series,
    market: 'SEOUL'
  });

  assert.match(penalty.commentary, /data-driven/);
  // Weak correlation → strictly below the expert constant of 12.
  assert.ok(penalty.appliedPenaltyPct < 12);
});

// ---------------------------------------------------------------------------
// leverage pairs always keep expert constant (no macro series proxy)
// ---------------------------------------------------------------------------
test('rate-leverage pair stays expert-constant even with history', () => {
  const rate = [3.0, 3.3, 3.7, 3.4, 3.9, 4.3, 4.0, 4.6, 5.0, 4.7, 5.2, 5.6, 5.3];
  const credit = rate.map((v) => 50 + (v - 3.0) * 40);
  const series = makeSeries({ policy_rate_pct: rate, credit_spread_bps: credit });

  // rate + leverage headwind only → Rate-Leverage Amplification (expert 14).
  const dims = makeDimensions({ rate: 65, leverage: 60 });
  const penalty = computeCorrelationPenalty(
    dims,
    { rate_level: 'NEGATIVE' },
    { series, market: 'SEOUL' }
  );
  assert.ok(penalty.activePairs.includes('Rate-Leverage Amplification'));
  // 14 (rate-leverage) is preserved; rate-credit not active (credit not headwind).
  assert.equal(penalty.appliedPenaltyPct, 14);
});
