import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBreachPointSensitivityRun,
  buildDebtNoiMatrixSensitivityRun,
  buildOneWaySensitivityRun,
  buildSensitivityRuns,
  buildTwoWayMatrixSensitivityRun
} from '@/lib/services/sensitivity/engine';

test('one-way sensitivity engine creates value and dscr shocks', () => {
  const result = buildOneWaySensitivityRun({
    baseCaseValueKrw: 100_000_000_000,
    assumptions: {
      metrics: {
        capRatePct: 5.5,
        discountRatePct: 7.5,
        occupancyPct: 92,
        debtCostPct: 4.8
      }
    },
    scenarios: [
      { name: 'Bull', debtServiceCoverage: 1.7 },
      { name: 'Base', debtServiceCoverage: 1.42 },
      { name: 'Bear', debtServiceCoverage: 1.11 }
    ]
  });

  assert.equal(result.runType, 'ONE_WAY');
  assert.equal(result.points.length, 8);
  assert.ok(result.points.some((point) => point.variableKey === 'cap_rate_pct' && point.metricName === 'Value'));
  assert.ok(result.points.some((point) => point.variableKey === 'debt_cost_pct' && point.metricName === 'DSCR'));
  assert.ok(result.summary.strongestDownsideDriver);
});

test('breach-point sensitivity engine creates dscr break-even and credit stress markers', () => {
  const result = buildBreachPointSensitivityRun({
    baseCaseValueKrw: 100_000_000_000,
    assumptions: {
      occupancyPct: 92,
      debtCostPct: 4.8,
      credit: {
        weakestCounterparty: {
          name: 'Han River Sponsor',
          role: 'SPONSOR',
          riskLevel: 'HIGH',
          score: 41
        },
        riskMix: {
          high: 1,
          moderate: 0,
          low: 0
        }
      }
    },
    scenarios: [
      { name: 'Bull', debtServiceCoverage: 1.7 },
      { name: 'Base', debtServiceCoverage: 1.42 },
      { name: 'Bear', debtServiceCoverage: 1.11 }
    ]
  });

  assert.equal(result.runType, 'BREACH_POINT');
  assert.equal(result.baselineMetricName, 'DSCR');
  assert.equal(result.points.length, 4);
  assert.ok(result.points.some((point) => point.variableKey === 'occupancy_breakeven_pct'));
  assert.ok(result.points.some((point) => point.variableKey === 'counterparty_credit_stress'));
});

test('breach-point sensitivity engine adds refinance covenant stress when liquidity signals exist', () => {
  const result = buildBreachPointSensitivityRun({
    baseCaseValueKrw: 100_000_000_000,
    assumptions: {
      occupancyPct: 92,
      debtCostPct: 4.8,
      credit: {
        weakestCounterparty: {
          name: 'Han River Sponsor',
          role: 'SPONSOR',
          riskLevel: 'HIGH',
          score: 41
        },
        riskMix: {
          high: 1,
          moderate: 0,
          low: 0
        },
        liquiditySignals: {
          refinanceRiskLevel: 'HIGH',
          covenantPressureLevel: 'HIGH',
          downsideDscrHaircutPct: 13.5
        }
      }
    },
    scenarios: [{ name: 'Base', debtServiceCoverage: 1.42 }]
  });

  assert.ok(result.points.some((point) => point.variableKey === 'refinance_covenant_stress'));
  assert.equal(result.points.length, 5);
});

test('buildSensitivityRuns returns one-way, breach-point, and matrix runs', () => {
  const result = buildSensitivityRuns({
    baseCaseValueKrw: 100_000_000_000,
    assumptions: {
      assetClass: 'OFFICE',
      occupancyPct: 92,
      debtCostPct: 4.8
    },
    scenarios: [{ name: 'Base', debtServiceCoverage: 1.42 }]
  });

  assert.equal(result.length, 4);
  assert.deepEqual(
    result.map((run) => run.runType),
    ['ONE_WAY', 'BREACH_POINT', 'MATRIX', 'MATRIX']
  );
});

test('two-way matrix sensitivity engine creates a 3x3 occupancy-cap matrix', () => {
  const result = buildTwoWayMatrixSensitivityRun({
    baseCaseValueKrw: 100_000_000_000,
    assumptions: {
      occupancyPct: 92,
      capRatePct: 5.5
    },
    scenarios: [{ name: 'Base', debtServiceCoverage: 1.42 }]
  });

  assert.equal(result.runType, 'MATRIX');
  assert.equal(result.points.length, 9);
  assert.deepEqual(result.summary.rowLabels, ['-5 pts', 'Base', '+5 pts']);
  assert.deepEqual(result.summary.columnLabels, ['+50 bps', 'Base', '-50 bps']);
});

test('debt-noi matrix sensitivity engine creates a 3x3 dscr matrix', () => {
  const result = buildDebtNoiMatrixSensitivityRun({
    baseCaseValueKrw: 100_000_000_000,
    assumptions: {
      debtCostPct: 4.8
    },
    scenarios: [{ name: 'Base', debtServiceCoverage: 1.42 }]
  });

  assert.equal(result.runType, 'MATRIX');
  assert.equal(result.baselineMetricName, 'DSCR');
  assert.equal(result.points.length, 9);
  assert.deepEqual(result.summary.rowLabels, ['-10%', 'Base', '+10%']);
  assert.deepEqual(result.summary.columnLabels, ['+100 bps', 'Base', '-100 bps']);
});

test('data-center matrix engine switches to utilization and power-price stress', () => {
  const valueMatrix = buildTwoWayMatrixSensitivityRun({
    baseCaseValueKrw: 100_000_000_000,
    assumptions: {
      assetClass: 'DATA_CENTER',
      metrics: {
        occupancyPct: 86,
        capRatePct: 6.2
      }
    },
    scenarios: [{ name: 'Base', debtServiceCoverage: 1.38 }]
  });

  const coverageMatrix = buildDebtNoiMatrixSensitivityRun({
    baseCaseValueKrw: 100_000_000_000,
    assumptions: {
      assetClass: 'DATA_CENTER',
      metrics: {
        debtCostPct: 5.1,
        powerPriceKrwPerKwh: 182
      }
    },
    scenarios: [{ name: 'Base', debtServiceCoverage: 1.38 }]
  });

  assert.equal(valueMatrix.title, 'Two-way matrix: utilization x exit cap');
  assert.equal(valueMatrix.summary.rowAxisLabel, 'Utilization');
  assert.equal(coverageMatrix.title, 'Two-way matrix: power price x debt cost');
  assert.equal(coverageMatrix.summary.rowAxisLabel, 'Power Price');
  assert.equal(coverageMatrix.summary.columnAxisLabel, 'Debt Cost');
  assert.deepEqual(coverageMatrix.summary.rowLabels, ['+10%', 'Base', '-10%']);
});
