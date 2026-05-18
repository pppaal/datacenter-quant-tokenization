import assert from 'node:assert/strict';
import test from 'node:test';
import { readCapexBreakdown, readUnderwritingAssumptions } from '@/lib/services/im/assumptions';

const sampleBlob = {
  metrics: {
    capRatePct: 6.58,
    discountRatePct: 9.94,
    occupancyPct: 73.25,
    monthlyRatePerKwKrw: 220000,
    powerPriceKrwPerKwh: 143,
    pueTarget: 1.31,
    stageFactor: 0.72,
    locationPremium: 1.04,
    permitPenalty: 0.93,
    floodPenalty: 0.973,
    wildfirePenalty: 0.992
  },
  taxes: {
    corporateTaxPct: 24.2,
    propertyTaxPct: 0.35,
    exitTaxPct: 1,
    acquisitionTaxPct: 4.6,
    vatRecoveryPct: 90
  },
  spv: {
    managementFeePct: 1.25,
    performanceFeePct: 8,
    promoteThresholdPct: 10,
    promoteSharePct: 15,
    reserveTargetMonths: 6
  },
  capex: {
    landValueKrw: 39_360_000_000,
    shellCoreKrw: 54_120_000_000,
    electricalKrw: 59_040_000_000,
    mechanicalKrw: 39_360_000_000,
    itFitOutKrw: 19_680_000_000,
    softCostKrw: 24_600_000_000,
    contingencyKrw: 9_840_000_000,
    hardCostKrw: 172_200_000_000,
    totalCapexKrw: 246_000_000_000
  }
};

test('readUnderwritingAssumptions extracts metrics + taxes + SPV', () => {
  const a = readUnderwritingAssumptions(sampleBlob);
  assert.equal(a.capRatePct, 6.58);
  assert.equal(a.discountRatePct, 9.94);
  assert.equal(a.occupancyPct, 73.25);
  assert.equal(a.corporateTaxPct, 24.2);
  assert.equal(a.managementFeePct, 1.25);
  assert.equal(a.promoteThresholdPct, 10);
});

test('readUnderwritingAssumptions returns nulls on empty blob', () => {
  const a = readUnderwritingAssumptions(null);
  assert.equal(a.capRatePct, null);
  assert.equal(a.corporateTaxPct, null);
  assert.equal(a.managementFeePct, null);
});

test('readUnderwritingAssumptions ignores non-finite numbers', () => {
  const a = readUnderwritingAssumptions({ metrics: { capRatePct: NaN, discountRatePct: 'oops' } });
  assert.equal(a.capRatePct, null);
  assert.equal(a.discountRatePct, null);
});

test('readCapexBreakdown extracts the 9 line items', () => {
  const c = readCapexBreakdown(sampleBlob);
  assert.equal(c.landValueKrw, 39_360_000_000);
  assert.equal(c.totalCapexKrw, 246_000_000_000);
  assert.equal(c.contingencyKrw, 9_840_000_000);
});

test('readCapexBreakdown returns nulls when capex is missing', () => {
  const c = readCapexBreakdown({});
  assert.equal(c.landValueKrw, null);
  assert.equal(c.totalCapexKrw, null);
});
