import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAssumptionNumber } from '../lib/services/valuation/assumption-access';

test('resolves a flat top-level numeric key (stabilized strategies)', () => {
  assert.equal(resolveAssumptionNumber({ capRatePct: 5.5 }, 'capRatePct'), 5.5);
});

test('resolves a key nested under metrics (data-center strategy)', () => {
  assert.equal(resolveAssumptionNumber({ metrics: { occupancyPct: 92 } }, 'occupancyPct'), 92);
});

test('resolves a key nested under leasing / debt / comparables', () => {
  assert.equal(
    resolveAssumptionNumber({ leasing: { monthlyRentPerSqmKrw: 31000 } }, 'monthlyRentPerSqmKrw'),
    31000
  );
  assert.equal(
    resolveAssumptionNumber({ debt: { weightedInterestRatePct: 6.1 } }, 'weightedInterestRatePct'),
    6.1
  );
  assert.equal(
    resolveAssumptionNumber(
      { comparables: { comparableValuePerSqmKrw: 4200000 } },
      'comparableValuePerSqmKrw'
    ),
    4200000
  );
});

test('prefers the flat key over a nested value of the same name', () => {
  assert.equal(
    resolveAssumptionNumber({ capRatePct: 5, metrics: { capRatePct: 9 } }, 'capRatePct'),
    5
  );
});

test('falls back to the stored proForma base-case summary', () => {
  assert.equal(
    resolveAssumptionNumber(
      { proForma: { baseCase: { summary: { stabilizedNoiKrw: 1234 } } } },
      'stabilizedNoiKrw'
    ),
    1234
  );
});

test('returns null for missing, non-finite, or non-numeric values', () => {
  assert.equal(resolveAssumptionNumber({ capRatePct: 5 }, 'occupancyPct'), null);
  assert.equal(resolveAssumptionNumber({ x: Number.NaN }, 'x'), null);
  assert.equal(resolveAssumptionNumber({ x: 'high' }, 'x'), null);
  assert.equal(resolveAssumptionNumber(null, 'x'), null);
  assert.equal(resolveAssumptionNumber(undefined, 'x'), null);
});

test('ignores array values at the group slot', () => {
  assert.equal(resolveAssumptionNumber({ metrics: [1, 2, 3] }, '0'), null);
});
