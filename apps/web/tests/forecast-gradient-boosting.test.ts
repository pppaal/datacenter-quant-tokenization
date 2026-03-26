import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass } from '@prisma/client';
import { buildGradientBoostingForecast } from '@/lib/services/forecast/gradient-boosting';

function run(input: {
  id: string;
  assetId: string;
  createdAt: string;
  baseCaseValueKrw: number;
  confidenceScore: number;
  occupancyPct: number;
  capRatePct: number;
  debtCostPct: number;
  pricingScore: number;
  leasingScore: number;
  financingScore: number;
  refinancingScore: number;
  allocationScore: number;
  dscr: number;
}) {
  return {
    id: input.id,
    assetId: input.assetId,
    createdAt: new Date(input.createdAt),
    baseCaseValueKrw: input.baseCaseValueKrw,
    confidenceScore: input.confidenceScore,
    assumptions: {
      occupancyPct: input.occupancyPct,
      capRatePct: input.capRatePct,
      debtCostPct: input.debtCostPct,
      macroRegime: {
        impacts: {
          dimensions: [
            { key: 'pricing', score: input.pricingScore },
            { key: 'leasing', score: input.leasingScore },
            { key: 'financing', score: input.financingScore },
            { key: 'refinancing', score: input.refinancingScore },
            { key: 'allocation', score: input.allocationScore }
          ]
        }
      }
    },
    asset: {
      id: input.assetId,
      market: 'US',
      assetClass: AssetClass.OFFICE
    },
    scenarios: [{ name: 'Base', debtServiceCoverage: input.dscr }]
  };
}

test('gradient boosting forecast predicts next-run drift when enough sequential history exists', () => {
  const history = [
    run({
      id: 'a1',
      assetId: 'asset-a',
      createdAt: '2026-01-01T00:00:00.000Z',
      baseCaseValueKrw: 100_000_000_000,
      confidenceScore: 72,
      occupancyPct: 90,
      capRatePct: 5.8,
      debtCostPct: 4.8,
      pricingScore: -0.2,
      leasingScore: 0.4,
      financingScore: -0.1,
      refinancingScore: -0.2,
      allocationScore: 0.2,
      dscr: 1.34
    }),
    run({
      id: 'a2',
      assetId: 'asset-a',
      createdAt: '2026-02-01T00:00:00.000Z',
      baseCaseValueKrw: 104_000_000_000,
      confidenceScore: 74,
      occupancyPct: 92,
      capRatePct: 5.6,
      debtCostPct: 4.7,
      pricingScore: 0.1,
      leasingScore: 0.5,
      financingScore: -0.1,
      refinancingScore: -0.1,
      allocationScore: 0.3,
      dscr: 1.39
    }),
    run({
      id: 'a3',
      assetId: 'asset-a',
      createdAt: '2026-03-01T00:00:00.000Z',
      baseCaseValueKrw: 109_000_000_000,
      confidenceScore: 77,
      occupancyPct: 93,
      capRatePct: 5.5,
      debtCostPct: 4.6,
      pricingScore: 0.2,
      leasingScore: 0.6,
      financingScore: -0.1,
      refinancingScore: -0.1,
      allocationScore: 0.4,
      dscr: 1.43
    }),
    run({
      id: 'b1',
      assetId: 'asset-b',
      createdAt: '2026-01-01T00:00:00.000Z',
      baseCaseValueKrw: 98_000_000_000,
      confidenceScore: 65,
      occupancyPct: 87,
      capRatePct: 6.2,
      debtCostPct: 5.2,
      pricingScore: -0.6,
      leasingScore: -0.3,
      financingScore: -0.5,
      refinancingScore: -0.4,
      allocationScore: -0.2,
      dscr: 1.21
    }),
    run({
      id: 'b2',
      assetId: 'asset-b',
      createdAt: '2026-02-01T00:00:00.000Z',
      baseCaseValueKrw: 93_000_000_000,
      confidenceScore: 63,
      occupancyPct: 85,
      capRatePct: 6.5,
      debtCostPct: 5.5,
      pricingScore: -0.7,
      leasingScore: -0.4,
      financingScore: -0.6,
      refinancingScore: -0.5,
      allocationScore: -0.3,
      dscr: 1.14
    }),
    run({
      id: 'b3',
      assetId: 'asset-b',
      createdAt: '2026-03-01T00:00:00.000Z',
      baseCaseValueKrw: 90_000_000_000,
      confidenceScore: 61,
      occupancyPct: 84,
      capRatePct: 6.6,
      debtCostPct: 5.6,
      pricingScore: -0.8,
      leasingScore: -0.5,
      financingScore: -0.7,
      refinancingScore: -0.5,
      allocationScore: -0.4,
      dscr: 1.09
    }),
    run({
      id: 'c1',
      assetId: 'asset-c',
      createdAt: '2026-01-01T00:00:00.000Z',
      baseCaseValueKrw: 110_000_000_000,
      confidenceScore: 78,
      occupancyPct: 94,
      capRatePct: 5.4,
      debtCostPct: 4.6,
      pricingScore: 0.2,
      leasingScore: 0.6,
      financingScore: -0.1,
      refinancingScore: 0,
      allocationScore: 0.4,
      dscr: 1.45
    }),
    run({
      id: 'c2',
      assetId: 'asset-c',
      createdAt: '2026-02-01T00:00:00.000Z',
      baseCaseValueKrw: 116_000_000_000,
      confidenceScore: 81,
      occupancyPct: 95,
      capRatePct: 5.2,
      debtCostPct: 4.5,
      pricingScore: 0.3,
      leasingScore: 0.7,
      financingScore: -0.1,
      refinancingScore: 0.1,
      allocationScore: 0.5,
      dscr: 1.51
    })
  ];

  const current = run({
    id: 'current',
    assetId: 'asset-z',
    createdAt: '2026-03-01T00:00:00.000Z',
    baseCaseValueKrw: 108_000_000_000,
    confidenceScore: 76,
    occupancyPct: 93,
    capRatePct: 5.5,
    debtCostPct: 4.7,
    pricingScore: 0.1,
    leasingScore: 0.5,
    financingScore: -0.2,
    refinancingScore: -0.1,
    allocationScore: 0.3,
    dscr: 1.4
  });

  const forecast = buildGradientBoostingForecast(current, history);

  assert.equal(forecast.status, 'READY');
  assert.equal(forecast.sampleCount, 5);
  assert.ok(forecast.predictedValueChangePct !== null);
  assert.ok(forecast.predictedDscr !== null);
  assert.ok(forecast.topDrivers.length > 0);
});
