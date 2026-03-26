import assert from 'node:assert/strict';
import test from 'node:test';
import { computeLeaseDcf } from '@/lib/services/valuation/lease-dcf';
import type { PreparedUnderwritingInputs, ScenarioInput } from '@/lib/services/valuation/types';

const baseScenario: ScenarioInput = {
  name: 'Base',
  scenarioOrder: 2,
  note: 'Base case',
  revenueFactor: 1,
  capRateShiftPct: 0,
  discountRateShiftPct: 0,
  costFactor: 1,
  floorFactor: 1,
  leaseProbabilityBumpPct: 0,
  debtSpreadBumpPct: 0
};

test('lease DCF applies renewal term, rent-free, and repeated renewal cycles', () => {
  const prepared = {
    capacityKw: 100,
    occupancyPct: 90,
    baseMonthlyRatePerKwKrw: 100000,
    annualGrowthPct: 0,
    baseCapRatePct: 6.5,
    baseDiscountRatePct: 9.5,
    baseOpexKrw: 1000000,
    powerPriceKrwPerKwh: 100,
    pueTarget: 1.2,
    stageFactor: 1,
    permitPenalty: 1,
    floodPenalty: 1,
    wildfirePenalty: 1,
    locationPremium: 1,
    capexBreakdown: {
      totalCapexKrw: 1000000000
    },
    leases: [
      {
        leasedKw: 100,
        startYear: 1,
        termYears: 1,
        baseRatePerKwKrw: 100000,
        probabilityPct: 100,
        annualEscalationPct: 0,
        downtimeMonths: 0,
        rentFreeMonths: 0,
        renewProbabilityPct: 100,
        rolloverDowntimeMonths: 1,
        renewalRentFreeMonths: 2,
        renewalTermYears: 1,
        renewalCount: 2,
        markToMarketRatePerKwKrw: 110000,
        renewalTenantImprovementKrw: 5000000,
        renewalLeasingCommissionKrw: 1000000,
        tenantImprovementKrw: null,
        leasingCommissionKrw: null,
        fitOutCostKrw: null,
        recoverableOpexRatioPct: 0,
        fixedRecoveriesKrw: null,
        expenseStopKrwPerKwMonth: null,
        utilityPassThroughPct: 0,
        steps: []
      }
    ]
  } as unknown as PreparedUnderwritingInputs;

  const result = computeLeaseDcf(prepared, baseScenario);

  assert.equal(result.years[0]?.year, 1);
  assert.equal(result.years[1]?.year, 2);
  assert.equal(result.years[2]?.year, 3);
  assert.equal(result.years[3]?.year, 4);

  assert.equal(result.years[1]?.rentFreeLossKrw, 22000000);
  assert.equal(result.years[2]?.rentFreeLossKrw, 22000000);
  assert.equal(result.years[1]?.downtimeLossKrw, 11000000);
  assert.equal(result.years[2]?.downtimeLossKrw, 11000000);
  assert.equal(result.years[1]?.tenantCapitalCostKrw, 6000000);
  assert.equal(result.years[2]?.tenantCapitalCostKrw, 6000000);
  assert.equal(result.years[3]?.tenantCapitalCostKrw, 0);
  assert.equal(result.years[3]?.contractedRevenueKrw, 0);
  assert.equal(result.years[3]?.downtimeLossKrw, 0);
  assert.equal(result.years[3]?.rentFreeLossKrw, 0);
});
