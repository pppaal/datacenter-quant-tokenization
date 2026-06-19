import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickBaseScenario, resolveBullBearValues } from '../lib/services/valuation/scenario-utils';

test('resolveBullBearValues picks by magnitude, not array position', () => {
  // Bull is the largest valuation, bear the smallest — regardless of order.
  const scenarios = [
    { valuationKrw: 100 }, // would be "bull" under positional [0]
    { valuationKrw: 250 },
    { valuationKrw: 80 } // would be "bear" under positional [2]
  ];
  assert.deepEqual(resolveBullBearValues(scenarios), { bull: 250, bear: 80 });
});

test('resolveBullBearValues handles a single scenario without swapping', () => {
  assert.deepEqual(resolveBullBearValues([{ valuationKrw: 500 }]), {
    bull: 500,
    bear: 500
  });
});

test('resolveBullBearValues ignores null / non-finite valuations', () => {
  const scenarios = [{ valuationKrw: null }, { valuationKrw: 300 }, { valuationKrw: Number.NaN }];
  assert.deepEqual(resolveBullBearValues(scenarios), { bull: 300, bear: 300 });
});

test('resolveBullBearValues returns nulls when there are no numeric scenarios', () => {
  assert.deepEqual(resolveBullBearValues([]), { bull: null, bear: null });
  assert.deepEqual(resolveBullBearValues([{ valuationKrw: null }]), {
    bull: null,
    bear: null
  });
});

test('pickBaseScenario finds the case named Base regardless of position', () => {
  const scenarios = [
    { name: 'Bull', scenarioOrder: 0 },
    { name: 'Base', scenarioOrder: 1 },
    { name: 'Bear', scenarioOrder: 2 }
  ];
  assert.equal(pickBaseScenario(scenarios)?.name, 'Base');
});

test('pickBaseScenario falls back to the lowest-order scenario when none is named Base', () => {
  const scenarios = [
    { name: 'Downside', scenarioOrder: 2 },
    { name: 'Central', scenarioOrder: 0 },
    { name: 'Upside', scenarioOrder: 1 }
  ];
  assert.equal(pickBaseScenario(scenarios)?.name, 'Central');
});
