import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDebtBreakdown } from '@/lib/valuation/debt-breakdown';

test('debt breakdown allocates reserve and balance impact across facilities', () => {
  const summary = buildDebtBreakdown(
    {
      weightedInterestRatePct: 6.4,
      reserveRequirementKrw: 1200000000,
      endingDebtBalanceKrw: 8400000000
    },
    [
      {
        facilityType: 'CONSTRUCTION',
        lenderName: 'Senior Construction',
        commitmentKrw: 12000000000,
        drawnAmountKrw: 8000000000,
        interestRatePct: 6.8,
        gracePeriodMonths: 18,
        amortizationTermMonths: 84,
        amortizationProfile: 'SCULPTED',
        balloonPct: 10,
        reserveMonths: 9,
        draws: [{ amountKrw: 3000000000 }, { amountKrw: 5000000000 }]
      },
      {
        facilityType: 'REVOLVER',
        lenderName: 'Working Capital',
        commitmentKrw: 3000000000,
        drawnAmountKrw: 1500000000,
        interestRatePct: 7.5,
        gracePeriodMonths: 6,
        amortizationTermMonths: 24,
        amortizationProfile: 'BULLET',
        balloonPct: 25,
        reserveMonths: 3,
        draws: [{ amountKrw: 1500000000 }]
      }
    ],
    [{ name: 'Base', debtServiceCoverage: 1.28 }]
  );

  assert.equal(summary.totalCommitmentKrw, 15000000000);
  assert.equal(summary.totalDrawnAmountKrw, 9500000000);
  assert.equal(summary.baseDscr, 1.28);
  assert.equal(summary.facilities[0]?.label, 'Senior Construction');
  assert.equal(summary.facilities[0]?.commitmentSharePct, 80);
  assert.equal(summary.facilities[0]?.reserveContributionKrw, 960000000);
  assert.equal(summary.facilities[1]?.watchpoint, 'Balloon-heavy');
});
