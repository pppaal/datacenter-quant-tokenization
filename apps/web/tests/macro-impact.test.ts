import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMacroImpactMatrix } from '@/lib/services/macro/impact';

test('macro impact engine interprets multidimensional transmission paths', () => {
  const matrix = buildMacroImpactMatrix({
    assetClass: 'OFFICE',
    profile: {
      assetClass: 'OFFICE',
      market: 'US',
      country: 'US',
      submarket: 'Manhattan',
      label: 'Long-duration leasing and capital-markets sensitive',
      adjustmentSummary: [
        'US liquidity and capital-market depth',
        'NYC office duration and liquidity premium'
      ],
      capitalRateSensitivity: 1.15,
      liquiditySensitivity: 1.1,
      leasingSensitivity: 1.15,
      constructionSensitivity: 0.95
    },
    factors: [
      {
        key: 'rate_level',
        label: 'Rate Level',
        value: 6.1,
        unit: '%',
        isObserved: true,
        direction: 'NEGATIVE',
        commentary: 'Rates are high.',
        inputs: ['Rate level 6.1%']
      },
      {
        key: 'credit_stress',
        label: 'Credit Stress',
        value: 240,
        unit: 'bps',
        isObserved: true,
        direction: 'NEGATIVE',
        commentary: 'Credit is stressed.',
        inputs: ['Credit stress 240 bps']
      },
      {
        key: 'liquidity',
        label: 'Liquidity',
        value: 78,
        unit: 'idx',
        isObserved: true,
        direction: 'NEGATIVE',
        commentary: 'Liquidity is weak.',
        inputs: ['Liquidity 78']
      },
      {
        key: 'property_demand',
        label: 'Property Demand',
        value: -12,
        unit: 'score',
        isObserved: true,
        direction: 'NEGATIVE',
        commentary: 'Demand is weak.',
        inputs: ['Demand -12']
      },
      {
        key: 'construction_pressure',
        label: 'Construction Pressure',
        value: 28,
        unit: 'score',
        isObserved: true,
        direction: 'NEGATIVE',
        commentary: 'Construction is pressured.',
        inputs: ['Construction 28']
      },
      {
        key: 'inflation_trend',
        label: 'Inflation Trend',
        value: 3.7,
        unit: '%',
        isObserved: true,
        direction: 'NEGATIVE',
        commentary: 'Inflation is high.',
        inputs: ['Inflation 3.7%']
      },
      {
        key: 'growth_momentum',
        label: 'Growth Momentum',
        value: 0.4,
        unit: '%',
        isObserved: true,
        direction: 'NEGATIVE',
        commentary: 'Growth is weak.',
        inputs: ['Growth 0.4%']
      },
      {
        key: 'rate_momentum_bps',
        label: 'Rate Momentum',
        value: 35,
        unit: 'bps',
        isObserved: true,
        direction: 'NEGATIVE',
        commentary: 'Rates are still rising.',
        inputs: ['Rate momentum 35 bps']
      }
    ],
    regimes: {
      capitalMarkets: { state: 'TIGHT' },
      leasing: { state: 'SOFT' },
      construction: { state: 'HIGH' },
      refinance: { state: 'HIGH' }
    },
    guidance: {
      discountRateShiftPct: 0.52,
      exitCapRateShiftPct: 0.24,
      debtCostShiftPct: 0.4,
      occupancyShiftPct: -5.75,
      growthShiftPct: -0.4,
      replacementCostShiftPct: 7.6
    }
  });

  const pricing = matrix.dimensions.find((item) => item.key === 'pricing');
  const financing = matrix.dimensions.find((item) => item.key === 'financing');
  const leasing = matrix.dimensions.find((item) => item.key === 'leasing');
  const refiPath = matrix.paths.find(
    (item) => item.factorKey === 'credit_stress' && item.targetKey === 'refinancing'
  );

  assert.ok(pricing);
  assert.equal(pricing.direction, 'HEADWIND');
  assert.ok(financing);
  assert.equal(financing.direction, 'HEADWIND');
  assert.ok(leasing);
  assert.equal(leasing.direction, 'HEADWIND');
  assert.ok(refiPath);
  assert.equal(refiPath.direction, 'HEADWIND');
  assert.ok(matrix.summary.some((line) => line.includes('Largest headwind')));
});
