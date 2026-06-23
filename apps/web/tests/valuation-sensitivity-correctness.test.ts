/**
 * Correctness fixes for the valuation sensitivity engine + synthetic pro-forma.
 * Each test pins a specific bug present before the fix; it fails against the
 * prior code and passes after. Tests are added alongside their fix commit.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCapRateExitSensitivity,
  buildOccupancyRentSensitivity
} from '@/lib/services/valuation/sensitivity';
import {
  buildSyntheticProForma,
  type ProFormaInputs
} from '@/lib/services/valuation/synthetic-pro-forma';
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

function baseProFormaInputs(): ProFormaInputs {
  const purchase = 100_000_000_000;
  const capRatePct = 5.0;
  return {
    purchasePriceKrw: purchase,
    ltvPct: 55,
    interestRatePct: 4.5,
    amortTermMonths: 360,
    capRatePct,
    exitCapRatePct: 5.5,
    year1Noi: Math.round((purchase * capRatePct) / 100),
    growthPct: 2.5,
    opexRatio: 0.3,
    propertyTaxPct: 0.3,
    insurancePct: 0.1,
    corpTaxPct: 22,
    exitTaxPct: 22,
    acquisitionTaxPct: 4.6,
    landValuePct: 70,
    depreciationYears: 40,
    exitCostPct: 2.0,
    propertyTaxGrowthPct: 2.0,
    capexReservePct: 2.0
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

// ===========================================================================
// FIX 2 — opexRatio >= 1 no longer divides by zero (revenue stays finite/positive).
// ===========================================================================
test('FIX 2: buildSyntheticProForma guards opexRatio >= 1 (no Infinity/NaN revenue)', () => {
  const built = buildSyntheticProForma({ ...baseProFormaInputs(), opexRatio: 1.0 });
  const y1 = built.proForma.years[0]!;
  assert.ok(Number.isFinite(y1.revenueKrw), 'revenue must be finite for opexRatio = 1.0');
  assert.ok(y1.revenueKrw > 0, 'revenue must stay positive (clamped denominator)');
  assert.ok(Number.isFinite(y1.operatingExpenseKrw) && y1.operatingExpenseKrw >= 0);

  // opexRatio just above 1 (pathological) must also stay finite, not negative.
  const over = buildSyntheticProForma({ ...baseProFormaInputs(), opexRatio: 1.4 });
  const oy1 = over.proForma.years[0]!;
  assert.ok(Number.isFinite(oy1.revenueKrw) && oy1.revenueKrw > 0);

  // A normal opexRatio is unaffected (no behavioral change inside the band).
  const normal = buildSyntheticProForma({ ...baseProFormaInputs(), opexRatio: 0.3 });
  const ny1 = normal.proForma.years[0]!;
  // year1Noi = 5B, revenue = 5B / 0.7 ≈ 7.142857B.
  assert.equal(ny1.revenueKrw, Math.round(5_000_000_000 / 0.7));
});

// ===========================================================================
// FIX 3 — going-in cap-rate ROW axis actually moves the result (not inert).
// ===========================================================================
test('FIX 3: buildCapRateExitSensitivity going-in cap-rate row is no longer inert', () => {
  const matrix = buildCapRateExitSensitivity(makeProForma(), 10000, 5000, 6.0, 6.5, 4000);

  // Hold exit cap fixed (center column) and vary the going-in cap row. A higher
  // going-in cap = higher entry NOI yield = higher operating distributions =
  // higher multiple. Pre-fix every row was identical because noiMultiplier was
  // computed but never applied.
  const col = matrix.baseColIndex;
  const lowCapRow = matrix.cells[0]![col]!; // going-in cap 5.0%
  const highCapRow = matrix.cells[4]![col]!; // going-in cap 7.0%

  assert.notEqual(
    lowCapRow.equityMultiple,
    highCapRow.equityMultiple,
    'going-in cap-rate rows must differ — the row axis must not be inert'
  );
  assert.ok(
    highCapRow.equityMultiple > lowCapRow.equityMultiple,
    `higher going-in cap (${highCapRow.equityMultiple}x) must out-earn lower (${lowCapRow.equityMultiple}x)`
  );
});

// ===========================================================================
// FIX 4 — exit cap floored at >0 rather than zeroing the terminal value.
// ===========================================================================
test('FIX 4: buildCapRateExitSensitivity floors the exit cap instead of zeroing the terminal', () => {
  // Base exit cap 0.5%, steps [-1.0,-0.5,0,0.5,1.0] → col values
  // [-0.5, 0, 0.5, 1.0, 1.5]. The first two columns are <= 0 and pre-fix zeroed
  // the terminal value, cratering the most-bullish (lowest-exit-cap) corner.
  const matrix = buildCapRateExitSensitivity(makeProForma(), 10000, 5000, 6.0, 0.5, 4000);

  const row = matrix.baseRowIndex;
  const lowestExitCapCell = matrix.cells[row]![0]!; // exit cap −0.5% (clamped to 0.1%)
  const highestExitCapCell = matrix.cells[row]![4]!; // exit cap 1.5%

  // The lowest exit cap implies the HIGHEST terminal value → highest multiple.
  assert.ok(
    lowestExitCapCell.equityMultiple > 0,
    'lowest-exit-cap corner must not crater to ~0 (terminal must be floored, not zeroed)'
  );
  assert.ok(
    lowestExitCapCell.equityMultiple > highestExitCapCell.equityMultiple,
    `lower exit cap (${lowestExitCapCell.equityMultiple}x) must out-earn higher exit cap (${highestExitCapCell.equityMultiple}x)`
  );
});
