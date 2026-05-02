import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSupplyDemand,
  buildSupplyForecast,
  DEFAULT_STAGE_COMPLETION_PROB
} from '@/lib/services/research/supply-demand';

const PROJECTS = [
  {
    projectName: 'A — under construction',
    stageLabel: 'UNDER_CONSTRUCTION',
    expectedPowerMw: 100,
    expectedDeliveryDate: '2027-06-01'
  },
  {
    projectName: 'B — announced',
    stageLabel: 'ANNOUNCED',
    expectedPowerMw: 100,
    expectedDeliveryDate: '2027-12-01'
  },
  {
    projectName: 'C — permitted',
    stageLabel: 'PERMITTED',
    expectedPowerMw: 200,
    expectedDeliveryDate: '2028-03-01'
  },
  {
    projectName: 'D — far',
    stageLabel: 'ANNOUNCED',
    expectedPowerMw: 500,
    expectedDeliveryDate: '2035-01-01'
  },
  {
    projectName: 'E — undated',
    stageLabel: 'ANNOUNCED',
    expectedPowerMw: 50,
    expectedDeliveryDate: null
  }
];

test('buildSupplyForecast probability-weights by stage', () => {
  const rows = buildSupplyForecast(PROJECTS, {
    unit: 'MW',
    baseYear: 2026,
    horizonYears: 5
  });
  const y2027 = rows.find((r) => r.year === 2027)!;
  assert.equal(y2027.nameplate, 200);
  // 100 × 0.90 + 100 × 0.30 = 120
  assert.ok(Math.abs(y2027.expected - 120) < 0.01);
  assert.equal(y2027.projectCount, 2);
});

test('buildSupplyForecast skips far-future and undated', () => {
  const rows = buildSupplyForecast(PROJECTS, {
    unit: 'MW',
    baseYear: 2026,
    horizonYears: 5
  });
  assert.equal(rows.length, 6);
  const beyond = rows.find((r) => r.year === 2035);
  assert.equal(beyond, undefined);
  const totalNameplate = rows.reduce((s, r) => s + r.nameplate, 0);
  assert.equal(totalNameplate, 400);
});

test('buildSupplyForecast respects custom stage probabilities', () => {
  const rows = buildSupplyForecast(PROJECTS, {
    unit: 'MW',
    baseYear: 2026,
    horizonYears: 5,
    stageProbabilities: { ANNOUNCED: 0.5 }
  });
  const y2027 = rows.find((r) => r.year === 2027)!;
  // 100 × 0.90 + 100 × 0.5 = 140
  assert.ok(Math.abs(y2027.expected - 140) < 0.01);
});

test('buildSupplyForecast handles unrecognized stage as ANNOUNCED', () => {
  const rows = buildSupplyForecast(
    [
      {
        projectName: 'X',
        stageLabel: 'unknown-stage-name',
        expectedPowerMw: 100,
        expectedDeliveryDate: '2027-06-01'
      }
    ],
    { unit: 'MW', baseYear: 2026, horizonYears: 5 }
  );
  const y2027 = rows.find((r) => r.year === 2027)!;
  assert.ok(Math.abs(y2027.expected - 30) < 0.01);
});

test('buildSupplyDemand produces vacancy path with growing demand', () => {
  const model = buildSupplyDemand(PROJECTS, {
    unit: 'MW',
    baseYear: 2026,
    horizonYears: 5,
    startingSupply: 1000,
    demand: { baselineDemand: 950, growthPct: 8 }
  });
  assert.equal(model.supplyDemand.length, 6);
  const y0 = model.supplyDemand[0]!;
  assert.equal(y0.year, 2026);
  assert.equal(y0.cumulativeSupply, 1000);
  assert.equal(y0.expectedDemand, 950);
  assert.ok(Math.abs(y0.impliedVacancyPct - 5.0) < 0.01);
  const yLast = model.supplyDemand[5]!;
  assert.ok(yLast.expectedDemand > 950);
});

test('buildSupplyDemand pipelineIntensityPct reflects year-1 add', () => {
  const model = buildSupplyDemand(PROJECTS, {
    unit: 'MW',
    baseYear: 2026,
    horizonYears: 5,
    startingSupply: 1000,
    demand: { baselineDemand: 800, growthPct: 5 }
  });
  // 2027 supply delta 120 → 120/1000 = 12%
  assert.ok(Math.abs(model.pipelineIntensityPct - 12) < 0.01);
});

test('DEFAULT_STAGE_COMPLETION_PROB is monotonic increasing', () => {
  const order = [
    'ANNOUNCED',
    'FEASIBILITY',
    'PERMITTED',
    'PRE_CONSTRUCTION',
    'UNDER_CONSTRUCTION',
    'TOPPING_OUT',
    'COMMISSIONING',
    'DELIVERED'
  ] as const;
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(
      DEFAULT_STAGE_COMPLETION_PROB[order[i]!] >=
        DEFAULT_STAGE_COMPLETION_PROB[order[i - 1]!],
      `${order[i]} should be >= ${order[i - 1]}`
    );
  }
});

test('buildSupplyDemand handles empty pipeline', () => {
  const model = buildSupplyDemand([], {
    unit: 'MW',
    baseYear: 2026,
    horizonYears: 3,
    startingSupply: 500,
    demand: { baselineDemand: 400, growthPct: 5 }
  });
  for (const row of model.supplyDemand) {
    assert.equal(row.cumulativeSupply, 500);
    assert.equal(row.expectedSupplyDelta, 0);
  }
  assert.equal(model.pipelineIntensityPct, 0);
});
