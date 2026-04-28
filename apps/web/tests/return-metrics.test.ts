import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeIrr,
  computeReturnMetrics,
  computeReturnMetricsFromProForma
} from '@/lib/services/valuation/return-metrics';

// ---------------------------------------------------------------------------
// IRR core
// ---------------------------------------------------------------------------

test('computeIrr returns ~10% for simple doubling cash flow', () => {
  // -1000 now, +1100 in year 1 → ~10%
  const irr = computeIrr([-1000, 1100]);
  assert.ok(irr !== null);
  assert.ok(Math.abs(irr - 10) < 0.5, `Expected ~10%, got ${irr}%`);
});

test('computeIrr returns null for all-positive cash flows', () => {
  const irr = computeIrr([100, 200, 300]);
  assert.equal(irr, null);
});

test('computeIrr returns null for empty or single cash flow', () => {
  assert.equal(computeIrr([]), null);
  assert.equal(computeIrr([-100]), null);
});

test('computeIrr handles multi-year project with terminal value', () => {
  // -10000 initial, 1500/yr for 5 years, + 12000 exit at year 5
  const irr = computeIrr([-10000, 1500, 1500, 1500, 1500, 1500 + 12000]);
  assert.ok(irr !== null);
  assert.ok(irr > 10 && irr < 30, `Expected 10-30%, got ${irr}%`);
});

test('computeIrr handles negative IRR project', () => {
  // Lose money: -1000 upfront, only get 500 back
  const irr = computeIrr([-1000, 200, 200, 100]);
  assert.ok(irr !== null);
  assert.ok(irr < 0, `Expected negative IRR, got ${irr}%`);
});

// ---------------------------------------------------------------------------
// Full Return Metrics
// ---------------------------------------------------------------------------

test('computeReturnMetrics computes all metrics from valuation components', () => {
  const result = computeReturnMetrics({
    leaseDcf: {
      years: [
        {
          year: 1,
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
          totalOperatingRevenueKrw: 5100,
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
          noiKrw: 4000,
          cfadsBeforeDebtKrw: 3800,
          activeRenewalLeaseCount: 0,
          weightedRenewalRatePerKwKrw: null
        },
        {
          year: 2,
          occupiedKw: 10,
          contractedKw: 6,
          residualOccupiedKw: 4,
          grossPotentialRevenueKrw: 5200,
          contractedRevenueKrw: 3100,
          renewalRevenueKrw: 600,
          residualRevenueKrw: 1600,
          downtimeLossKrw: 80,
          renewalDowntimeLossKrw: 40,
          rentFreeLossKrw: 40,
          renewalRentFreeLossKrw: 15,
          fixedRecoveriesKrw: 220,
          siteRecoveriesKrw: 110,
          utilityPassThroughRevenueKrw: 55,
          reimbursementRevenueKrw: 385,
          totalOperatingRevenueKrw: 5400,
          revenueKrw: 5100,
          powerCostKrw: 620,
          siteOperatingExpenseKrw: 420,
          nonRecoverableOperatingExpenseKrw: 310,
          maintenanceReserveKrw: 105,
          operatingExpenseKrw: 520,
          tenantImprovementKrw: 105,
          leasingCommissionKrw: 22,
          tenantCapitalCostKrw: 127,
          renewalTenantCapitalCostKrw: 32,
          fitOutCostKrw: 52,
          noiKrw: 4200,
          cfadsBeforeDebtKrw: 4000,
          activeRenewalLeaseCount: 0,
          weightedRenewalRatePerKwKrw: null
        }
      ],
      annualRevenueKrw: 5100,
      annualOpexKrw: 1100,
      stabilizedNoiKrw: 4200,
      incomeApproachValueKrw: 50000,
      leaseDrivenValueKrw: 55000,
      terminalValueKrw: 60000,
      terminalYear: 2
    },
    debtSchedule: {
      years: [
        {
          year: 1,
          drawAmountKrw: 3000,
          openingBalanceKrw: 3000,
          interestKrw: 165,
          principalKrw: 300,
          debtServiceKrw: 465,
          endingBalanceKrw: 2700,
          dscr: 8.17
        },
        {
          year: 2,
          drawAmountKrw: 0,
          openingBalanceKrw: 2700,
          interestKrw: 148,
          principalKrw: 300,
          debtServiceKrw: 448,
          endingBalanceKrw: 2400,
          dscr: 8.93
        }
      ],
      initialDebtFundingKrw: 3000,
      weightedInterestRatePct: 5.5,
      reserveRequirementKrw: 200,
      endingDebtBalanceKrw: 2400
    },
    equityWaterfall: {
      years: [
        {
          year: 1,
          propertyTaxKrw: 50,
          insuranceKrw: 30,
          managementFeeKrw: 40,
          reserveContributionKrw: 100,
          debtServiceKrw: 465,
          corporateTaxKrw: 100,
          afterTaxDistributionKrw: 3015
        },
        {
          year: 2,
          propertyTaxKrw: 52,
          insuranceKrw: 31,
          managementFeeKrw: 42,
          reserveContributionKrw: 0,
          debtServiceKrw: 448,
          corporateTaxKrw: 110,
          afterTaxDistributionKrw: 3317
        }
      ],
      leveredEquityValueKrw: 45000,
      enterpriseEquivalentValueKrw: 48000,
      grossExitValueKrw: 65000,
      promoteFeeKrw: 500,
      exitTaxKrw: 1000,
      netExitProceedsKrw: 55000
    },
    totalCapexKrw: 10000
  });

  // Initial equity = 10000 - 3000 = 7000
  assert.equal(result.peakEquityExposureKrw, 7000);

  // Equity IRR should be positive (strong returns)
  assert.ok(result.equityIrr !== null);
  assert.ok(result.equityIrr! > 0);

  // Unleveraged IRR should also be positive
  assert.ok(result.unleveragedIrr !== null);

  // Equity multiple > 1 (profitable)
  assert.ok(result.equityMultiple > 1);

  // Cash-on-cash for each year
  assert.equal(result.cashOnCashByYear.length, 2);
  assert.ok(result.cashOnCashByYear[0]! > 0);
  assert.ok(result.cashOnCashByYear[1]! > 0);

  // Average CoC positive
  assert.ok(result.averageCashOnCash > 0);

  // With only 2 years of distributions (3015 + 3317 = 6332 < 7000 equity),
  // payback is not reached within the horizon
  assert.equal(result.paybackYear, null);
});

test('computeReturnMetrics handles zero equity (100% debt)', () => {
  const result = computeReturnMetrics({
    leaseDcf: {
      years: [
        {
          year: 1,
          occupiedKw: 10,
          contractedKw: 6,
          residualOccupiedKw: 4,
          grossPotentialRevenueKrw: 1000,
          contractedRevenueKrw: 600,
          renewalRevenueKrw: 0,
          residualRevenueKrw: 400,
          downtimeLossKrw: 0,
          renewalDowntimeLossKrw: 0,
          rentFreeLossKrw: 0,
          renewalRentFreeLossKrw: 0,
          fixedRecoveriesKrw: 0,
          siteRecoveriesKrw: 0,
          utilityPassThroughRevenueKrw: 0,
          reimbursementRevenueKrw: 0,
          totalOperatingRevenueKrw: 1000,
          revenueKrw: 1000,
          powerCostKrw: 100,
          siteOperatingExpenseKrw: 100,
          nonRecoverableOperatingExpenseKrw: 50,
          maintenanceReserveKrw: 20,
          operatingExpenseKrw: 100,
          tenantImprovementKrw: 0,
          leasingCommissionKrw: 0,
          tenantCapitalCostKrw: 0,
          renewalTenantCapitalCostKrw: 0,
          fitOutCostKrw: 0,
          noiKrw: 800,
          cfadsBeforeDebtKrw: 700,
          activeRenewalLeaseCount: 0,
          weightedRenewalRatePerKwKrw: null
        }
      ],
      annualRevenueKrw: 1000,
      annualOpexKrw: 200,
      stabilizedNoiKrw: 800,
      incomeApproachValueKrw: 10000,
      leaseDrivenValueKrw: 11000,
      terminalValueKrw: 12000,
      terminalYear: 1
    },
    debtSchedule: {
      years: [
        {
          year: 1,
          drawAmountKrw: 5000,
          openingBalanceKrw: 5000,
          interestKrw: 250,
          principalKrw: 500,
          debtServiceKrw: 750,
          endingBalanceKrw: 4500,
          dscr: 0.93
        }
      ],
      initialDebtFundingKrw: 5000,
      weightedInterestRatePct: 5.0,
      reserveRequirementKrw: 100,
      endingDebtBalanceKrw: 4500
    },
    equityWaterfall: {
      years: [
        {
          year: 1,
          propertyTaxKrw: 10,
          insuranceKrw: 5,
          managementFeeKrw: 5,
          reserveContributionKrw: 50,
          debtServiceKrw: 750,
          corporateTaxKrw: 0,
          afterTaxDistributionKrw: -120
        }
      ],
      leveredEquityValueKrw: 4000,
      enterpriseEquivalentValueKrw: 9000,
      grossExitValueKrw: 13000,
      promoteFeeKrw: 0,
      exitTaxKrw: 0,
      netExitProceedsKrw: 8500
    },
    totalCapexKrw: 5000
  });

  // 100% debt = 0 initial equity
  assert.equal(result.equityMultiple, 0);
  assert.equal(result.averageCashOnCash, 0);
});

// ---------------------------------------------------------------------------
// From stored pro forma
// ---------------------------------------------------------------------------

test('computeReturnMetricsFromProForma produces consistent results', () => {
  const proForma = {
    summary: {
      annualRevenueKrw: 5000,
      annualOpexKrw: 1000,
      stabilizedNoiKrw: 4000,
      terminalValueKrw: 50000,
      terminalYear: 3,
      reserveRequirementKrw: 200,
      endingDebtBalanceKrw: 2000,
      grossExitValueKrw: 55000,
      netExitProceedsKrw: 48000,
      leveredEquityValueKrw: 40000,
      equityIrr: null,
      unleveragedIrr: null,
      equityMultiple: 0,
      averageCashOnCash: 0,
      paybackYear: null,
      peakEquityExposureKrw: 0,
      initialEquityKrw: 5000,
      initialDebtFundingKrw: 5000
    },
    years: [
      {
        year: 1,
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
        totalOperatingRevenueKrw: 5100,
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
        noiKrw: 4000,
        cfadsBeforeDebtKrw: 3800,
        activeRenewalLeaseCount: 0,
        weightedRenewalRatePerKwKrw: null,
        drawAmountKrw: 0,
        interestKrw: 200,
        principalKrw: 300,
        debtServiceKrw: 500,
        endingDebtBalanceKrw: 2500,
        dscr: 7.6,
        propertyTaxKrw: 50,
        insuranceKrw: 30,
        managementFeeKrw: 40,
        reserveContributionKrw: 100,
        corporateTaxKrw: 100,
        afterTaxDistributionKrw: 2980
      },
      {
        year: 2,
        occupiedKw: 10,
        contractedKw: 6,
        residualOccupiedKw: 4,
        grossPotentialRevenueKrw: 5200,
        contractedRevenueKrw: 3100,
        renewalRevenueKrw: 600,
        residualRevenueKrw: 1600,
        downtimeLossKrw: 80,
        renewalDowntimeLossKrw: 40,
        rentFreeLossKrw: 40,
        renewalRentFreeLossKrw: 15,
        fixedRecoveriesKrw: 220,
        siteRecoveriesKrw: 110,
        utilityPassThroughRevenueKrw: 55,
        reimbursementRevenueKrw: 385,
        totalOperatingRevenueKrw: 5400,
        revenueKrw: 5100,
        powerCostKrw: 620,
        siteOperatingExpenseKrw: 420,
        nonRecoverableOperatingExpenseKrw: 310,
        maintenanceReserveKrw: 105,
        operatingExpenseKrw: 520,
        tenantImprovementKrw: 105,
        leasingCommissionKrw: 22,
        tenantCapitalCostKrw: 127,
        renewalTenantCapitalCostKrw: 32,
        fitOutCostKrw: 52,
        noiKrw: 4200,
        cfadsBeforeDebtKrw: 4000,
        activeRenewalLeaseCount: 0,
        weightedRenewalRatePerKwKrw: null,
        drawAmountKrw: 0,
        interestKrw: 180,
        principalKrw: 300,
        debtServiceKrw: 480,
        endingDebtBalanceKrw: 2200,
        dscr: 8.33,
        propertyTaxKrw: 52,
        insuranceKrw: 31,
        managementFeeKrw: 42,
        reserveContributionKrw: 0,
        corporateTaxKrw: 110,
        afterTaxDistributionKrw: 3285
      },
      {
        year: 3,
        occupiedKw: 10,
        contractedKw: 6,
        residualOccupiedKw: 4,
        grossPotentialRevenueKrw: 5400,
        contractedRevenueKrw: 3200,
        renewalRevenueKrw: 700,
        residualRevenueKrw: 1700,
        downtimeLossKrw: 60,
        renewalDowntimeLossKrw: 30,
        rentFreeLossKrw: 30,
        renewalRentFreeLossKrw: 10,
        fixedRecoveriesKrw: 240,
        siteRecoveriesKrw: 120,
        utilityPassThroughRevenueKrw: 60,
        reimbursementRevenueKrw: 420,
        totalOperatingRevenueKrw: 5700,
        revenueKrw: 5400,
        powerCostKrw: 640,
        siteOperatingExpenseKrw: 440,
        nonRecoverableOperatingExpenseKrw: 320,
        maintenanceReserveKrw: 110,
        operatingExpenseKrw: 540,
        tenantImprovementKrw: 110,
        leasingCommissionKrw: 24,
        tenantCapitalCostKrw: 134,
        renewalTenantCapitalCostKrw: 34,
        fitOutCostKrw: 54,
        noiKrw: 4400,
        cfadsBeforeDebtKrw: 4200,
        activeRenewalLeaseCount: 0,
        weightedRenewalRatePerKwKrw: null,
        drawAmountKrw: 0,
        interestKrw: 160,
        principalKrw: 300,
        debtServiceKrw: 460,
        endingDebtBalanceKrw: 2000,
        dscr: 9.13,
        propertyTaxKrw: 54,
        insuranceKrw: 32,
        managementFeeKrw: 44,
        reserveContributionKrw: 0,
        corporateTaxKrw: 120,
        afterTaxDistributionKrw: 3490
      }
    ]
  };

  const result = computeReturnMetricsFromProForma(proForma, 10000, 5000, 48000, 50000);

  assert.ok(result.equityIrr !== null);
  assert.ok(result.equityIrr! > 0);
  assert.ok(result.equityMultiple > 1);
  assert.equal(result.cashOnCashByYear.length, 3);
  assert.ok(result.averageCashOnCash > 0);
});
