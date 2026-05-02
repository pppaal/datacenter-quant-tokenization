import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeCovenants } from '@/lib/services/valuation/covenants';
import type { ProFormaYear } from '@/lib/services/valuation/types';

function makeYear(overrides: Partial<ProFormaYear>): ProFormaYear {
  return {
    year: 1,
    occupiedKw: 0,
    contractedKw: 0,
    residualOccupiedKw: 0,
    grossPotentialRevenueKrw: 0,
    contractedRevenueKrw: 0,
    renewalRevenueKrw: 0,
    residualRevenueKrw: 0,
    downtimeLossKrw: 0,
    renewalDowntimeLossKrw: 0,
    rentFreeLossKrw: 0,
    renewalRentFreeLossKrw: 0,
    fixedRecoveriesKrw: 0,
    siteRecoveriesKrw: 0,
    utilityPassThroughRevenueKrw: 0,
    reimbursementRevenueKrw: 0,
    totalOperatingRevenueKrw: 0,
    revenueKrw: 0,
    powerCostKrw: 0,
    siteOperatingExpenseKrw: 0,
    nonRecoverableOperatingExpenseKrw: 0,
    maintenanceReserveKrw: 0,
    operatingExpenseKrw: 0,
    tenantImprovementKrw: 0,
    leasingCommissionKrw: 0,
    tenantCapitalCostKrw: 0,
    renewalTenantCapitalCostKrw: 0,
    fitOutCostKrw: 0,
    noiKrw: 0,
    cfadsBeforeDebtKrw: 0,
    activeRenewalLeaseCount: 0,
    weightedRenewalRatePerKwKrw: null,
    drawAmountKrw: 0,
    interestKrw: 0,
    principalKrw: 0,
    debtServiceKrw: 0,
    endingDebtBalanceKrw: 0,
    dscr: null,
    propertyTaxKrw: 0,
    jongbuseKrw: 0,
    insuranceKrw: 0,
    managementFeeKrw: 0,
    reserveContributionKrw: 0,
    capexReserveKrw: 0,
    corporateTaxKrw: 0,
    afterTaxDistributionKrw: 0,
    ...overrides
  };
}

test('healthy deal passes all covenants', () => {
  const years = [
    makeYear({
      year: 1,
      noiKrw: 10_000_000_000,
      endingDebtBalanceKrw: 100_000_000_000,
      dscr: 1.5,
      afterTaxDistributionKrw: 5_000_000_000
    }),
    makeYear({
      year: 2,
      noiKrw: 10_500_000_000,
      endingDebtBalanceKrw: 97_000_000_000,
      dscr: 1.6,
      afterTaxDistributionKrw: 5_500_000_000
    })
  ];
  // implied value = 10B / 6% = 166.7B → LTV = 60% ✓, debt yield = 10% ✓
  const result = analyzeCovenants(years, { capRatePct: 6.0 });
  assert.equal(result.anyBreach, false);
  assert.equal(result.totalCashSweptKrw, 0);
  assert.match(result.summary, /Clean/);
});

test('LTV breach flagged when debt outstrips implied value', () => {
  const years = [
    // LTV 90% > 65% threshold → breach
    makeYear({
      year: 1,
      noiKrw: 5_000_000_000,
      endingDebtBalanceKrw: 75_000_000_000,
      dscr: 1.3,
      afterTaxDistributionKrw: 1_000_000_000
    })
  ];
  // implied = 5B / 6% = 83.3B → LTV = 90%
  const result = analyzeCovenants(years, { capRatePct: 6.0 });
  assert.equal(result.years[0]!.ltvBreach, true);
  assert.equal(result.anyBreach, true);
  assert.equal(result.firstBreachYear, 1);
});

test('cash sweep diverts distribution when DSCR below sweep threshold', () => {
  const years = [
    makeYear({
      year: 1,
      noiKrw: 8_000_000_000,
      endingDebtBalanceKrw: 90_000_000_000,
      dscr: 1.2,
      afterTaxDistributionKrw: 2_000_000_000
    })
  ];
  // DSCR 1.2 < sweep threshold 1.25 → sweep active
  const result = analyzeCovenants(years, { capRatePct: 6.0 });
  assert.equal(result.years[0]!.cashSweepActive, true);
  assert.equal(result.years[0]!.cashSweptKrw, 2_000_000_000);
  assert.equal(result.years[0]!.distributionAfterSweepKrw, 0);
});

test('debt yield breach when NOI/debt below 8%', () => {
  const years = [
    makeYear({
      year: 1,
      noiKrw: 4_000_000_000,
      endingDebtBalanceKrw: 100_000_000_000,
      dscr: 1.3,
      afterTaxDistributionKrw: 0
    })
  ];
  // debt yield = 4%
  const result = analyzeCovenants(years, { capRatePct: 6.0 });
  assert.equal(result.years[0]!.debtYieldBreach, true);
  assert.ok(result.years[0]!.debtYieldPct! < 8);
});

test('summary mentions sweep amount in 억 units', () => {
  const years = [
    makeYear({
      year: 1,
      noiKrw: 8_000_000_000,
      endingDebtBalanceKrw: 90_000_000_000,
      dscr: 1.1,
      afterTaxDistributionKrw: 3_000_000_000
    })
  ];
  const result = analyzeCovenants(years, { capRatePct: 6.0 });
  assert.ok(result.totalCashSweptKrw > 0);
  assert.match(result.summary, /억/);
});
