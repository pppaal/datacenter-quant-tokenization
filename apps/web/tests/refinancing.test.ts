import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeRefinancing } from '@/lib/services/valuation/refinancing';
import type { ProFormaYear } from '@/lib/services/valuation/types';

function makeYears(overrides?: Partial<Record<number, Partial<ProFormaYear>>>): ProFormaYear[] {
  return Array.from({ length: 5 }, (_, i) => {
    const year = i + 1;
    const base: ProFormaYear = {
      year,
      occupiedKw: 10, contractedKw: 6, residualOccupiedKw: 4,
      grossPotentialRevenueKrw: 5000, contractedRevenueKrw: 3000, renewalRevenueKrw: 500,
      residualRevenueKrw: 1500, downtimeLossKrw: 100, renewalDowntimeLossKrw: 50,
      rentFreeLossKrw: 50, renewalRentFreeLossKrw: 20, fixedRecoveriesKrw: 200,
      siteRecoveriesKrw: 100, utilityPassThroughRevenueKrw: 50, reimbursementRevenueKrw: 350,
      totalOperatingRevenueKrw: 5000, revenueKrw: 4800, powerCostKrw: 600,
      siteOperatingExpenseKrw: 400, nonRecoverableOperatingExpenseKrw: 300,
      maintenanceReserveKrw: 100, operatingExpenseKrw: 500, tenantImprovementKrw: 100,
      leasingCommissionKrw: 20, tenantCapitalCostKrw: 120, renewalTenantCapitalCostKrw: 30,
      fitOutCostKrw: 50, noiKrw: 4000, cfadsBeforeDebtKrw: 3800,
      activeRenewalLeaseCount: 0, weightedRenewalRatePerKwKrw: null,
      drawAmountKrw: 0, interestKrw: 200, principalKrw: 300, debtServiceKrw: 500,
      endingDebtBalanceKrw: 3000 - year * 300, dscr: 3800 / 500,
      propertyTaxKrw: 50, insuranceKrw: 30, managementFeeKrw: 40,
      reserveContributionKrw: 0, corporateTaxKrw: 100, afterTaxDistributionKrw: 2880
    };
    return { ...base, ...overrides?.[year] };
  });
}

test('analyzeRefinancing returns no critical triggers for healthy deal', () => {
  const result = analyzeRefinancing(makeYears(), 5.5, 84);

  assert.ok(result.triggers.every((t) => t.severity !== 'CRITICAL'));
  assert.ok(result.recommendation.length > 0);
});

test('analyzeRefinancing detects critical DSCR breach', () => {
  const years = makeYears({
    3: { dscr: 0.95, cfadsBeforeDebtKrw: 475, debtServiceKrw: 500 }
  });

  const result = analyzeRefinancing(years, 5.5, 84);

  const criticalTriggers = result.triggers.filter((t) => t.severity === 'CRITICAL');
  assert.ok(criticalTriggers.length > 0);
  assert.ok(criticalTriggers.some((t) => t.reason.includes('DSCR')));
  assert.ok(result.recommendation.includes('Critical'));
});

test('analyzeRefinancing detects negative equity cash flow', () => {
  const years = makeYears({
    2: { afterTaxDistributionKrw: -500 }
  });

  const result = analyzeRefinancing(years, 5.5, 84);

  assert.ok(result.triggers.some((t) => t.severity === 'CRITICAL' && t.reason.includes('Negative')));
});

test('analyzeRefinancing detects high debt service ratio', () => {
  const years = makeYears({
    1: { cfadsBeforeDebtKrw: 900, debtServiceKrw: 500 }
  });

  const result = analyzeRefinancing(years, 5.5, 84);

  assert.ok(result.triggers.some((t) => t.reason.includes('CFADS')));
});

test('analyzeRefinancing generates refi scenarios at year 3 and 5', () => {
  const result = analyzeRefinancing(makeYears(), 5.5, 84);

  assert.ok(result.scenarios.length >= 2);
  assert.ok(result.scenarios.some((s) => s.refiYear === 3));
  assert.ok(result.scenarios.some((s) => s.refiYear === 5));

  for (const scenario of result.scenarios) {
    assert.ok(scenario.newRatePct < 5.5);
    assert.ok(scenario.prepaymentPenaltyPct === 2.0);
    assert.ok(scenario.prepaymentCostKrw > 0);
  }
});

test('analyzeRefinancing flags high interest rate environment', () => {
  const result = analyzeRefinancing(makeYears(), 7.0, 84);

  assert.ok(result.triggers.some((t) => t.reason.includes('rate') && t.reason.includes('7.0')));
});

test('analyzeRefinancing refi scenarios have consistent debt balance and prepayment cost', () => {
  const result = analyzeRefinancing(makeYears(), 6.0, 84);

  assert.ok(result.scenarios.length > 0);
  for (const s of result.scenarios) {
    assert.ok(s.newRatePct > 0);
    assert.ok(s.prepaymentCostKrw > 0);
    assert.ok(s.newDebtBalanceKrw > 0);
    assert.equal(s.prepaymentPenaltyPct, 2.0);
    // Break-even: null (no saving) or positive
    if (s.breakEvenYears !== null) {
      assert.ok(s.breakEvenYears > 0);
    }
  }
});
