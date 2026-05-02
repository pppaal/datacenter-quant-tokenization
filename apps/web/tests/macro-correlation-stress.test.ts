import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeCorrelationPenalty,
  applyCorrelationPenalty
} from '@/lib/services/macro/correlation-stress';
import type { DealMacroExposureDimension } from '@/lib/services/macro/deal-risk';

function makeDimensions(scores: Record<string, number>): DealMacroExposureDimension[] {
  return Object.entries(scores).map(([key, score]) => ({
    key: key as DealMacroExposureDimension['key'],
    label: key,
    score,
    commentary: ''
  }));
}

test('computeCorrelationPenalty returns zero when no headwinds', () => {
  const dims = makeDimensions({
    rate: 20,
    credit: 30,
    demand: 25,
    construction: 15,
    leverage: 10,
    liquidity: 20
  });
  const penalty = computeCorrelationPenalty(dims, {});

  assert.equal(penalty.appliedPenaltyPct, 0);
  assert.equal(penalty.headwindCount, 0);
  assert.equal(penalty.activePairs.length, 0);
});

test('computeCorrelationPenalty detects rate-credit squeeze', () => {
  const dims = makeDimensions({
    rate: 65,
    credit: 55,
    demand: 25,
    construction: 15,
    leverage: 10,
    liquidity: 20
  });
  const penalty = computeCorrelationPenalty(dims, {
    rate_level: 'NEGATIVE',
    credit_stress: 'NEGATIVE'
  });

  assert.ok(penalty.appliedPenaltyPct > 0);
  assert.ok(penalty.activePairs.includes('Rate-Credit Squeeze'));
});

test('computeCorrelationPenalty applies triple headwind cascade', () => {
  const dims = makeDimensions({
    rate: 65,
    credit: 55,
    liquidity: 60,
    demand: 25,
    construction: 15,
    leverage: 10
  });
  const penalty = computeCorrelationPenalty(dims, {
    rate_level: 'NEGATIVE',
    credit_stress: 'NEGATIVE',
    liquidity: 'NEGATIVE'
  });

  assert.ok(penalty.headwindCount >= 3);
  assert.ok(penalty.activePairs.some((p) => p.includes('cascade')));
  assert.ok(penalty.appliedPenaltyPct > 15);
});

test('computeCorrelationPenalty caps at 40%', () => {
  const dims = makeDimensions({
    rate: 80,
    credit: 75,
    liquidity: 70,
    demand: 65,
    construction: 60,
    leverage: 85
  });
  const penalty = computeCorrelationPenalty(dims, {
    rate_level: 'NEGATIVE',
    rate_momentum_bps: 'NEGATIVE',
    credit_stress: 'NEGATIVE',
    liquidity: 'NEGATIVE',
    property_demand: 'NEGATIVE',
    construction_pressure: 'NEGATIVE'
  });

  assert.ok(penalty.appliedPenaltyPct <= 40);
});

test('applyCorrelationPenalty increases score proportional to headroom', () => {
  const penalty = {
    appliedPenaltyPct: 20,
    headwindCount: 3,
    activePairs: ['test'],
    commentary: ''
  };

  const adjusted50 = applyCorrelationPenalty(50, penalty);
  const adjusted80 = applyCorrelationPenalty(80, penalty);

  assert.ok(adjusted50 > 50);
  assert.ok(adjusted80 > 80);
  // Higher base means less headroom, so smaller absolute boost
  assert.ok(adjusted50 - 50 > adjusted80 - 80);
});

test('applyCorrelationPenalty returns base score when no penalty', () => {
  const penalty = { appliedPenaltyPct: 0, headwindCount: 0, activePairs: [], commentary: '' };
  assert.equal(applyCorrelationPenalty(45, penalty), 45);
});

test('applyCorrelationPenalty never exceeds 100', () => {
  const penalty = {
    appliedPenaltyPct: 40,
    headwindCount: 6,
    activePairs: ['test'],
    commentary: ''
  };
  const result = applyCorrelationPenalty(95, penalty);
  assert.ok(result <= 100);
});
