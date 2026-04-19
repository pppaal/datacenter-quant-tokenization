import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStoredBaseCaseProForma, readStoredBaseCaseProForma } from '@/lib/services/valuation/pro-forma';

test('pro forma serializer aligns lease, debt, and equity years into one stored shape', () => {
  const proForma = buildStoredBaseCaseProForma({
    totalCapexKrw: 5000,
    leaseDcf: {
      years: [
        {
          year: 1,
          occupiedKw: 10,
          contractedKw: 6,
          residualOccupiedKw: 4,
          grossPotentialRevenueKrw: 1000,
          contractedRevenueKrw: 600,
          renewalRevenueKrw: 120,
          residualRevenueKrw: 300,
          downtimeLossKrw: 50,
          renewalDowntimeLossKrw: 15,
          rentFreeLossKrw: 50,
          renewalRentFreeLossKrw: 10,
          fixedRecoveriesKrw: 40,
          siteRecoveriesKrw: 20,
          utilityPassThroughRevenueKrw: 10,
          reimbursementRevenueKrw: 70,
          totalOperatingRevenueKrw: 970,
          revenueKrw: 900,
          powerCostKrw: 120,
          siteOperatingExpenseKrw: 110,
          nonRecoverableOperatingExpenseKrw: 90,
          maintenanceReserveKrw: 20,
          operatingExpenseKrw: 130,
          tenantImprovementKrw: 30,
          leasingCommissionKrw: 5,
          tenantCapitalCostKrw: 35,
          renewalTenantCapitalCostKrw: 12,
          fitOutCostKrw: 35,
          noiKrw: 720,
          cfadsBeforeDebtKrw: 685,
          activeRenewalLeaseCount: 1,
          weightedRenewalRatePerKwKrw: 110000
        }
      ],
      annualRevenueKrw: 970,
      annualOpexKrw: 250,
      stabilizedNoiKrw: 720,
      incomeApproachValueKrw: 10000,
      leaseDrivenValueKrw: 11000,
      terminalValueKrw: 12000,
      terminalYear: 10
    },
    debtSchedule: {
      years: [
        {
          year: 1,
          drawAmountKrw: 100,
          openingBalanceKrw: 200,
          interestKrw: 10,
          principalKrw: 15,
          debtServiceKrw: 25,
          endingBalanceKrw: 185,
          dscr: 2.4
        }
      ],
      initialDebtFundingKrw: 100,
      weightedInterestRatePct: 5.5,
      reserveRequirementKrw: 12,
      endingDebtBalanceKrw: 185
    },
    equityWaterfall: {
      years: [
        {
          year: 1,
          propertyTaxKrw: 11,
          insuranceKrw: 7,
          managementFeeKrw: 8,
          reserveContributionKrw: 6,
          debtServiceKrw: 25,
          corporateTaxKrw: 14,
          afterTaxDistributionKrw: 614
        }
      ],
      leveredEquityValueKrw: 9000,
      enterpriseEquivalentValueKrw: 9100,
      grossExitValueKrw: 13000,
      promoteFeeKrw: 100,
      exitTaxKrw: 50,
      netExitProceedsKrw: 12700
    }
  });

  assert.equal(proForma.summary.annualRevenueKrw, 970);
  assert.equal(proForma.summary.terminalYear, 10);
  assert.equal(proForma.summary.endingDebtBalanceKrw, 185);
  assert.equal(proForma.years[0]?.debtServiceKrw, 25);
  assert.equal(proForma.years[0]?.propertyTaxKrw, 11);
  assert.equal(proForma.years[0]?.tenantCapitalCostKrw, 35);
  assert.equal(proForma.years[0]?.renewalRevenueKrw, 120);
  assert.equal(proForma.years[0]?.weightedRenewalRatePerKwKrw, 110000);
});

test('pro forma reader returns null for non-pro-forma assumptions and parses stored shape', () => {
  assert.equal(readStoredBaseCaseProForma({}), null);

  const parsed = readStoredBaseCaseProForma({
    proForma: {
      baseCase: {
        summary: {
          annualRevenueKrw: 1,
          annualOpexKrw: 2,
          stabilizedNoiKrw: 3,
          terminalValueKrw: 4,
          terminalYear: 10,
          reserveRequirementKrw: 5,
          endingDebtBalanceKrw: 6,
          grossExitValueKrw: 7,
          netExitProceedsKrw: 8,
          leveredEquityValueKrw: 9
        },
        years: [{ year: 1, revenueKrw: 10 }]
      }
    }
  });

  assert.equal(parsed?.summary.leveredEquityValueKrw, 9);
  assert.equal(parsed?.years[0]?.year, 1);
});
