/**
 * Correctness fixes for the valuation sensitivity engine + synthetic pro-forma.
 * Each test pins a specific bug present before the fix; it fails against the
 * prior code and passes after. Tests are added alongside their fix commit.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOccupancyRentSensitivity } from '@/lib/services/valuation/sensitivity';
import type { ProFormaBaseCase } from '@/lib/services/valuation/types';

function makeProForma(): ProFormaBaseCase {
  const makeYear = (year: number, noi: number, dist: number) => ({
    year,
    occupiedKw: 10,
    contractedKw: 6,
    residualOccupiedKw: 4,
    grossPotentialRevenueKrw: 5000,
    contractedRevenueKrw: 3000,
    renewalRevenueKrw: 500,
    residualRevenueKrw: 1500,
    downtimeLossKrw: 100,
    renewalDowntimeLossKrw: 50,
    rentFreeLossKrw: 50,
    renewalRentFreeLossKrw: 20,
    fixedRecoveriesKrw: 200,
    siteRecoveriesKrw: 100,
    utilityPassThroughRevenueKrw: 50,
    reimbursementRevenueKrw: 350,
    totalOperatingRevenueKrw: 5000,
    revenueKrw: 4800,
    powerCostKrw: 600,
    siteOperatingExpenseKrw: 400,
    nonRecoverableOperatingExpenseKrw: 300,
    maintenanceReserveKrw: 100,
    operatingExpenseKrw: 500,
    tenantImprovementKrw: 100,
    leasingCommissionKrw: 20,
    tenantCapitalCostKrw: 120,
    renewalTenantCapitalCostKrw: 30,
    fitOutCostKrw: 50,
    noiKrw: noi,
    cfadsBeforeDebtKrw: noi - 200,
    activeRenewalLeaseCount: 0,
    weightedRenewalRatePerKwKrw: null,
    drawAmountKrw: 0,
    interestKrw: 200,
    principalKrw: 300,
    debtServiceKrw: 500,
    endingDebtBalanceKrw: 2500,
    dscr: (noi - 200) / 500,
    propertyTaxKrw: 50,
    insuranceKrw: 30,
    managementFeeKrw: 40,
    reserveContributionKrw: 0,
    corporateTaxKrw: 100,
    afterTaxDistributionKrw: dist
  });

  return {
    summary: {
      annualRevenueKrw: 5000,
      annualOpexKrw: 1000,
      stabilizedNoiKrw: 4000,
      terminalValueKrw: 50000,
      terminalYear: 3,
      reserveRequirementKrw: 200,
      endingDebtBalanceKrw: 2500,
      grossExitValueKrw: 55000,
      netExitProceedsKrw: 48000,
      leveredEquityValueKrw: 40000,
      equityIrr: 15,
      unleveragedIrr: 12,
      equityMultiple: 2.5,
      averageCashOnCash: 8.0,
      paybackYear: 2,
      peakEquityExposureKrw: 5000,
      initialEquityKrw: 5000,
      initialDebtFundingKrw: 5000
    },
    years: [makeYear(1, 4000, 3000), makeYear(2, 4200, 3200), makeYear(3, 4400, 3400)]
  };
}

// ===========================================================================
// FIX 1 — occupancy axis floors at 0; negative occupancy can't sign-flip flows.
// ===========================================================================
test('FIX 1: buildOccupancyRentSensitivity floors occupancy at 0 (no negative-occupancy sign flip)', () => {
  // Base occupancy 10% with steps [-15,-10,-5,0,5] would produce row values
  // [-5, 0, 5, 10, 15] without a lower floor. The −5% row makes occMultiplier
  // (-5/10 = -0.5) negative, flipping every operating distribution into a
  // spurious INFLOW and making the worst-occupancy cell look BETTER.
  const matrix = buildOccupancyRentSensitivity(makeProForma(), 10000, 5000, 10, 50000);

  // No axis value may be negative.
  for (const v of matrix.rowAxis.values) {
    assert.ok(v >= 0, `occupancy axis value ${v} must be floored at 0`);
  }
  assert.equal(matrix.rowAxis.values[0], 0, 'the −15% step from base 10 must clamp to 0, not −5');

  // Monotonicity sanity: at a fixed rent column, the lowest-occupancy row must
  // NOT out-earn the highest-occupancy row (the pre-fix sign flip violated this).
  const col = 2; // 0% rent growth
  const lowestOcc = matrix.cells[0]![col]!;
  const highestOcc = matrix.cells[4]![col]!;
  assert.ok(
    highestOcc.equityMultiple >= lowestOcc.equityMultiple,
    `higher occupancy (${highestOcc.equityMultiple}x) must not under-earn lower occupancy (${lowestOcc.equityMultiple}x)`
  );
});
