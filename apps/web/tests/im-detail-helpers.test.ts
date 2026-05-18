import assert from 'node:assert/strict';
import test from 'node:test';
import { buildScenarioDiff } from '@/lib/services/im/scenario-diff';
import { buildSensitivityGrid, pickMatrixRuns } from '@/lib/services/im/sensitivity';
import { pickProvenanceForCard, summarizeProvenance } from '@/lib/services/im/provenance-map';

test('buildScenarioDiff computes value delta + bps shifts vs base', () => {
  const rows = buildScenarioDiff([
    {
      name: 'Bull Case',
      valuationKrw: 110,
      impliedYieldPct: 5.0,
      exitCapRatePct: 4.5,
      debtServiceCoverage: 1.6,
      notes: 'tight'
    },
    {
      name: 'Base Case',
      valuationKrw: 100,
      impliedYieldPct: 5.5,
      exitCapRatePct: 5.0,
      debtServiceCoverage: 1.4,
      notes: 'base'
    },
    {
      name: 'Bear Case',
      valuationKrw: 90,
      impliedYieldPct: 6.0,
      exitCapRatePct: 5.5,
      debtServiceCoverage: 1.1,
      notes: 'wider'
    }
  ]);
  assert.equal(rows.length, 3);
  const [bull, base, bear] = rows;
  assert.equal(bull?.valueDeltaPct, 10);
  assert.equal(base?.valueDeltaPct, 0);
  assert.equal(bear?.valueDeltaPct, -10);
  assert.equal(bull?.exitCapDeltaBps, -50);
  assert.equal(bear?.exitCapDeltaBps, 50);
  assert.equal(bull?.dscrDelta, 0.2);
  assert.equal(bear?.dscrDelta, -0.3);
});

test('buildScenarioDiff returns empty when no scenarios', () => {
  assert.deepEqual(buildScenarioDiff([]), []);
});

test('buildSensitivityGrid maps shockLabel "row / col" to 2D cells', () => {
  const grid = buildSensitivityGrid({
    id: 'r1',
    runType: 'MATRIX',
    title: 'Occ x ExitCap',
    baselineMetricName: 'Value',
    baselineMetricValue: 100,
    summary: {
      rowLabels: ['-5 pts', 'Base', '+5 pts'],
      columnLabels: ['+50 bps', 'Base', '-50 bps'],
      rowAxisLabel: 'Occupancy',
      columnAxisLabel: 'Exit Cap'
    },
    points: [
      {
        variableKey: 'm',
        variableLabel: 'Occ x ExitCap',
        shockLabel: '-5 pts / +50 bps',
        metricName: 'Value',
        metricValue: 80,
        deltaPct: -20
      },
      {
        variableKey: 'm',
        variableLabel: 'Occ x ExitCap',
        shockLabel: 'Base / Base',
        metricName: 'Value',
        metricValue: 100,
        deltaPct: 0
      },
      {
        variableKey: 'm',
        variableLabel: 'Occ x ExitCap',
        shockLabel: '+5 pts / -50 bps',
        metricName: 'Value',
        metricValue: 130,
        deltaPct: 30
      }
    ]
  });
  assert.ok(grid !== null);
  assert.equal(grid!.rowLabels.length, 3);
  assert.equal(grid!.columnLabels.length, 3);
  assert.equal(grid!.cells[0]?.value, 80);
  assert.equal(grid!.cells[4]?.value, 100); // Base/Base at row 1 col 1
  assert.equal(grid!.cells[8]?.value, 130);
  assert.equal(grid!.cells[1], null); // unfilled
});

test('buildSensitivityGrid returns null when summary lacks labels', () => {
  const grid = buildSensitivityGrid({
    id: 'r2',
    runType: 'MATRIX',
    title: '',
    baselineMetricName: 'V',
    baselineMetricValue: 0,
    summary: { pointCount: 9 },
    points: []
  });
  assert.equal(grid, null);
});

test('pickMatrixRuns filters out non-MATRIX runs', () => {
  const grids = pickMatrixRuns([
    {
      id: 'a',
      runType: 'ONE_WAY',
      title: 'one-way',
      baselineMetricName: 'V',
      baselineMetricValue: 0,
      summary: {},
      points: []
    },
    {
      id: 'b',
      runType: 'MATRIX',
      title: 'matrix',
      baselineMetricName: 'V',
      baselineMetricValue: 100,
      summary: {
        rowLabels: ['r0', 'r1'],
        columnLabels: ['c0', 'c1'],
        rowAxisLabel: 'R',
        columnAxisLabel: 'C'
      },
      points: [
        {
          variableKey: 'm',
          variableLabel: 'm',
          shockLabel: 'r0 / c0',
          metricName: 'V',
          metricValue: 80,
          deltaPct: -20
        }
      ]
    }
  ]);
  assert.equal(grids.length, 1);
  assert.equal(grids[0]?.runId, 'b');
});

test('pickProvenanceForCard filters by field pattern', () => {
  const provenance = [
    { field: 'capRatePct', sourceSystem: 'korea-macro-rates', value: 6.58, mode: 'fallback', freshnessLabel: 'fresh' },
    { field: 'debtFacilities', sourceSystem: 'synthetic-project-finance', value: null, mode: 'manual', freshnessLabel: 'synthetic' },
    { field: 'macro.cap_rate_pct', sourceSystem: 'seed-manual', value: 6.1, mode: 'api', freshnessLabel: '2026-04-01' },
    { field: 'address', sourceSystem: 'manual-intake', value: 'Seoul', mode: 'manual', freshnessLabel: 'seed' }
  ];
  const rates = pickProvenanceForCard(provenance, 'valuationRates');
  assert.equal(rates.length, 2);
  assert.ok(rates.some((r) => r.field === 'capRatePct'));
  const debt = pickProvenanceForCard(provenance, 'capitalStructure');
  assert.equal(debt.length, 1);
  assert.equal(debt[0]?.sourceSystem, 'synthetic-project-finance');
});

test('summarizeProvenance dedupes sourceSystems', () => {
  const text = summarizeProvenance([
    { field: 'a', sourceSystem: 'sys-x', mode: 'm', freshnessLabel: 'f' },
    { field: 'b', sourceSystem: 'sys-x', mode: 'm', freshnessLabel: 'f' },
    { field: 'c', sourceSystem: 'sys-y', mode: 'm', freshnessLabel: 'f' }
  ]);
  assert.equal(text, 'sys-x · sys-y');
});
