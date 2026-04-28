import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOrderedScenarioOutputs,
  buildScenarioOutput,
  pickBaseDscr,
  pickBaseScenario,
  sortScenariosByOrder
} from '@/lib/services/valuation/scenario-utils';
import { buildYearMap, getYearValue } from '@/lib/services/valuation/year-map';

test('scenario helpers prefer named base and otherwise fall back to sorted order', () => {
  const namedBase = pickBaseScenario([
    { name: 'Bear', scenarioOrder: 2, debtServiceCoverage: 0.9 },
    { name: 'Base', scenarioOrder: 1, debtServiceCoverage: 1.2 },
    { name: 'Bull', scenarioOrder: 0, debtServiceCoverage: 1.5 }
  ]);

  assert.equal(namedBase?.name, 'Base');
  assert.equal(pickBaseDscr([{ name: 'Bull', scenarioOrder: 0, debtServiceCoverage: 1.4 }]), 1.4);

  const sorted = sortScenariosByOrder([
    { name: 'Bear', scenarioOrder: 2 },
    { name: 'Bull', scenarioOrder: 0 },
    { name: 'Base', scenarioOrder: 1 }
  ]);

  assert.deepEqual(
    sorted.map((scenario) => scenario.name),
    ['Bull', 'Base', 'Bear']
  );
});

test('year helpers build a stable lookup map', () => {
  const rows = [
    { year: 1, value: 10 },
    { year: 2, value: 20 }
  ];
  const map = buildYearMap(rows);

  assert.equal(getYearValue(map, 1)?.value, 10);
  assert.equal(getYearValue(rows, 2)?.value, 20);
  assert.equal(getYearValue(map, 3), undefined);
});

test('scenario output helpers round and sort into underwriting shape', () => {
  const scenario = buildScenarioOutput({
    name: 'Base',
    valuationKrw: 100.8,
    impliedYieldPct: 5.126,
    exitCapRatePct: 6.234,
    debtServiceCoverage: 1.276,
    notes: 'Base case',
    scenarioOrder: 1
  });

  assert.equal(scenario.valuationKrw, 101);
  assert.equal(scenario.impliedYieldPct, 5.13);
  assert.equal(scenario.exitCapRatePct, 6.23);
  assert.equal(scenario.debtServiceCoverage, 1.28);

  const ordered = buildOrderedScenarioOutputs([
    {
      name: 'Bear',
      valuationKrw: 90,
      impliedYieldPct: 6,
      exitCapRatePct: 7,
      debtServiceCoverage: 1,
      notes: 'bear',
      scenarioOrder: 2
    },
    {
      name: 'Bull',
      valuationKrw: 110,
      impliedYieldPct: 5,
      exitCapRatePct: 6,
      debtServiceCoverage: 1.5,
      notes: 'bull',
      scenarioOrder: 0
    },
    {
      name: 'Base',
      valuationKrw: 100,
      impliedYieldPct: 5.5,
      exitCapRatePct: 6.5,
      debtServiceCoverage: 1.2,
      notes: 'base',
      scenarioOrder: 1
    }
  ]);

  assert.deepEqual(
    ordered.map((item) => item.name),
    ['Bull', 'Base', 'Bear']
  );
});
