import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCapRateExitSensitivity,
  buildOccupancyRentSensitivity,
  buildInterestRateSensitivity,
  buildMacroDrivenSensitivity
} from '@/lib/services/valuation/sensitivity';
import type { MacroStressScenario } from '@/lib/services/macro/deal-risk';
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

test('buildCapRateExitSensitivity produces 5x5 matrix with base case at center', () => {
  const matrix = buildCapRateExitSensitivity(makeProForma(), 10000, 5000, 6.0, 6.5, 4000);

  assert.equal(matrix.rowAxis.values.length, 5);
  assert.equal(matrix.colAxis.values.length, 5);
  assert.equal(matrix.cells.length, 5);
  assert.equal(matrix.cells[0]!.length, 5);

  // Base case should be at center
  assert.equal(matrix.baseRowIndex, 2);
  assert.equal(matrix.baseColIndex, 2);

  // Center cell should have non-null IRR
  const baseCell = matrix.cells[2]![2]!;
  assert.ok(baseCell.equityIrr !== null || baseCell.equityMultiple > 0);

  // Higher exit cap rate → lower IRR
  const lowerExitCap = matrix.cells[2]![1]!;
  const higherExitCap = matrix.cells[2]![3]!;
  if (lowerExitCap.equityIrr !== null && higherExitCap.equityIrr !== null) {
    assert.ok(lowerExitCap.equityIrr > higherExitCap.equityIrr);
  }
});

test('buildOccupancyRentSensitivity produces 5x5 matrix', () => {
  const matrix = buildOccupancyRentSensitivity(makeProForma(), 10000, 5000, 85, 50000);

  assert.equal(matrix.rowAxis.values.length, 5);
  assert.equal(matrix.colAxis.values.length, 5);
  assert.equal(matrix.baseRowIndex, 3); // 0% occupancy shift is at index 3

  // Higher occupancy → higher equity multiple
  const lowOcc = matrix.cells[0]![2]!;
  const highOcc = matrix.cells[4]![2]!;
  assert.ok(highOcc.equityMultiple > lowOcc.equityMultiple);
});

test('buildMacroDrivenSensitivity uses worst-case shocks from dynamic scenarios as axis bounds', () => {
  const scenarios: MacroStressScenario[] = [
    {
      name: 'Trend Continuation',
      description: '6-month projected trend',
      shocks: {
        rateShiftBps: 80,
        spreadShiftBps: 20,
        vacancyShiftPct: 1.0,
        growthShiftPct: -0.5,
        constructionCostShiftPct: 2.0
      }
    },
    {
      name: 'Tail Risk',
      description: '2-sigma adverse',
      shocks: {
        rateShiftBps: 250,
        spreadShiftBps: 150,
        vacancyShiftPct: 4.0,
        growthShiftPct: -2.5,
        constructionCostShiftPct: 18.0
      }
    }
  ];

  const matrix = buildMacroDrivenSensitivity({
    proForma: makeProForma(),
    totalCapexKrw: 10000,
    initialDebtFundingKrw: 5000,
    baseInterestRatePct: 5.5,
    baseOccupancyPct: 85,
    terminalValueKrw: 50000,
    scenarios
  });

  assert.equal(matrix.axisSource, 'macro');
  assert.equal(matrix.rateAxisSourceScenario, 'Tail Risk');
  assert.equal(matrix.occupancyAxisSourceScenario, 'Tail Risk');
  assert.equal(matrix.rowAxis.values[0], 0);
  assert.equal(matrix.rowAxis.values[4], 250);
  assert.equal(matrix.colAxis.values[0], 0);
  assert.equal(matrix.colAxis.values[4], 4.0);

  // Worse macro combo should produce lower IRR
  const bestCell = matrix.cells[0]![0]!;
  const worstCell = matrix.cells[4]![4]!;
  if (bestCell.equityIrr !== null && worstCell.equityIrr !== null) {
    assert.ok(bestCell.equityIrr > worstCell.equityIrr);
  }
});

test('buildInterestRateSensitivity returns 7 rows with base at 0bps', () => {
  const rows = buildInterestRateSensitivity(makeProForma(), 10000, 5000, 5.5, 50000);

  assert.equal(rows.length, 7);
  assert.ok(rows.some((r) => r.shiftBps === 0));

  const baseRow = rows.find((r) => r.shiftBps === 0)!;
  assert.ok(baseRow.equityIrr !== null || baseRow.equityMultiple > 0);

  // Lower rates → higher IRR
  const lowestRate = rows.find((r) => r.shiftBps === -200)!;
  const highestRate = rows.find((r) => r.shiftBps === 200)!;
  if (lowestRate.equityIrr !== null && highestRate.equityIrr !== null) {
    assert.ok(lowestRate.equityIrr > highestRate.equityIrr);
  }
});
