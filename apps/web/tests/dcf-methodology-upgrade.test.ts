import assert from 'node:assert/strict';
import test from 'node:test';

import { discountValue } from '@/lib/services/valuation/utils';
import { computeIrr } from '@/lib/services/valuation/return-metrics';
import { buildTerminalValueCrossCheck } from '@/lib/services/valuation/lease-dcf';
import { buildTornadoSensitivity } from '@/lib/services/valuation/sensitivity';
import type { ProFormaBaseCase, ProFormaYear } from '@/lib/services/valuation/types';

// ---------------------------------------------------------------------------
// FIX A — Mid-year discounting convention
// ---------------------------------------------------------------------------

test('FIX A: mid-year PV exceeds end-of-year PV by ~half-period factor', () => {
  const value = 1_000_000;
  const ratePct = 8;
  const year = 3;

  const eoy = discountValue(value, ratePct, year, false);
  const mid = discountValue(value, ratePct, year, true);

  // Mid-year unwinds half a period of discounting: mid / eoy = (1+r)^0.5.
  const expectedFactor = (1 + ratePct / 100) ** 0.5;
  assert.ok(mid > eoy, `mid-year PV (${mid}) should exceed end-of-year (${eoy})`);
  assert.ok(
    Math.abs(mid / eoy - expectedFactor) < 1e-9,
    `ratio ${mid / eoy} should equal (1.08)^0.5 = ${expectedFactor}`
  );
  // Pin numbers.
  assert.equal(Number(eoy.toFixed(4)), 793832.241); // 1e6 / 1.08^3
  assert.equal(Number(mid.toFixed(4)), 824974.6645); // 1e6 / 1.08^2.5
});

test('FIX A: year-0 outlay is never shifted under mid-year', () => {
  // Initial outlay at index 0 stays at t=0 in both conventions.
  assert.equal(discountValue(500, 10, 0, true), 500);
  assert.equal(discountValue(500, 10, 0, false), 500);
});

test('FIX A: mid-year IRR exceeds end-of-year IRR for identical flows', () => {
  const flows = [-10_000, 1_500, 1_500, 1_500, 1_500, 1_500 + 12_000];
  const eoyIrr = computeIrr(flows, 200, 1e-8, false);
  const midIrr = computeIrr(flows, 200, 1e-8, true);
  assert.ok(eoyIrr !== null && midIrr !== null);
  // Receiving cash mid-period instead of period-end pulls cash forward → higher IRR.
  assert.ok(midIrr! > eoyIrr!, `mid IRR ${midIrr} should exceed eoy IRR ${eoyIrr}`);
});

// ---------------------------------------------------------------------------
// FIX B — Terminal value cross-check (Gordon growth + divergence flag)
// ---------------------------------------------------------------------------

test('FIX B: Gordon TV matches NOI_{n+1} / (r - g) for known inputs', () => {
  // NOI = 100, r = 9%, g = 3% → 100 / 0.06 = 1666.667
  const cc = buildTerminalValueCrossCheck({
    forwardNoiKrw: 100,
    exitCapTerminalValueKrw: 1_666, // close to Gordon → no flag
    exitCapRatePct: 6,
    goingInCapRatePct: 5.5,
    discountRatePct: 9,
    growthPct: 3
  });
  assert.equal(cc.gordonValid, true);
  assert.equal(cc.gordonTerminalValueKrw, 1_667); // round(1666.6667)
  // divergence = (1667 - 1666)/1666 * 100 ≈ 0.06%, well under 10% threshold
  assert.equal(cc.divergesBeyondThreshold, false);
  // exit cap (6%) > going-in (5.5%) → positive 50bps spread, not inverted
  assert.equal(cc.terminalCapSpreadBps, 50);
  assert.equal(cc.terminalSpreadInverted, false);
});

test('FIX B: divergence flag triggers when exit-cap and Gordon TV diverge > threshold', () => {
  // Gordon = 100 / (9% - 3%) = 1666.67, but exit-cap TV is 1000 → +66.7% divergence.
  const cc = buildTerminalValueCrossCheck({
    forwardNoiKrw: 100,
    exitCapTerminalValueKrw: 1_000,
    exitCapRatePct: 10,
    goingInCapRatePct: 6,
    discountRatePct: 9,
    growthPct: 3
  });
  assert.equal(cc.gordonTerminalValueKrw, 1_667);
  assert.equal(cc.divergencePct, 66.67);
  assert.equal(cc.divergesBeyondThreshold, true);
});

test('FIX B: inverted terminal spread flagged when exit cap below going-in', () => {
  const cc = buildTerminalValueCrossCheck({
    forwardNoiKrw: 100,
    exitCapTerminalValueKrw: 2_000,
    exitCapRatePct: 5,
    goingInCapRatePct: 6,
    discountRatePct: 9,
    growthPct: 3
  });
  assert.equal(cc.terminalCapSpreadBps, -100);
  assert.equal(cc.terminalSpreadInverted, true);
});

test('FIX B: Gordon undefined when r <= g (no negative perpetuity)', () => {
  const cc = buildTerminalValueCrossCheck({
    forwardNoiKrw: 100,
    exitCapTerminalValueKrw: 1_000,
    exitCapRatePct: 6,
    goingInCapRatePct: 6,
    discountRatePct: 4,
    growthPct: 5 // g > r
  });
  assert.equal(cc.gordonValid, false);
  assert.equal(cc.gordonTerminalValueKrw, null);
  assert.equal(cc.divergencePct, null);
  assert.equal(cc.divergesBeyondThreshold, false);
});

// ---------------------------------------------------------------------------
// FIX C — Tornado sensitivity ordering + monotonicity
// ---------------------------------------------------------------------------

function makeYear(over: Partial<ProFormaYear>): ProFormaYear {
  const base: ProFormaYear = {
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
    totalOperatingRevenueKrw: 1_000,
    revenueKrw: 1_000,
    powerCostKrw: 0,
    siteOperatingExpenseKrw: 0,
    nonRecoverableOperatingExpenseKrw: 0,
    maintenanceReserveKrw: 0,
    operatingExpenseKrw: 300,
    tenantImprovementKrw: 0,
    leasingCommissionKrw: 0,
    tenantCapitalCostKrw: 0,
    renewalTenantCapitalCostKrw: 0,
    fitOutCostKrw: 0,
    noiKrw: 700,
    cfadsBeforeDebtKrw: 700,
    activeRenewalLeaseCount: 0,
    weightedRenewalRatePerKwKrw: null,
    drawAmountKrw: 0,
    interestKrw: 200,
    principalKrw: 100,
    debtServiceKrw: 300,
    endingDebtBalanceKrw: 0,
    dscr: null,
    propertyTaxKrw: 0,
    insuranceKrw: 0,
    managementFeeKrw: 0,
    reserveContributionKrw: 0,
    corporateTaxKrw: 0,
    afterTaxDistributionKrw: 400
  };
  return { ...base, ...over };
}

function makeProForma(): ProFormaBaseCase {
  const years: ProFormaYear[] = [];
  for (let y = 1; y <= 10; y++) {
    years.push(makeYear({ year: y, endingDebtBalanceKrw: y === 10 ? 5_000 : 0 }));
  }
  return {
    summary: {
      annualRevenueKrw: 1_000,
      annualOpexKrw: 300,
      stabilizedNoiKrw: 700,
      terminalValueKrw: 14_000,
      terminalYear: 10,
      reserveRequirementKrw: 0,
      endingDebtBalanceKrw: 5_000,
      grossExitValueKrw: 14_000,
      netExitProceedsKrw: 9_000,
      leveredEquityValueKrw: 0,
      equityIrr: null,
      unleveragedIrr: null,
      equityMultiple: 0,
      averageCashOnCash: 0,
      paybackYear: null,
      peakEquityExposureKrw: 0,
      initialEquityKrw: 4_000,
      initialDebtFundingKrw: 6_000
    },
    years
  };
}

test('FIX C: tornado orders drivers by descending |IRR swing| and is monotonic', () => {
  const proForma = makeProForma();
  const tornado = buildTornadoSensitivity({
    proForma,
    totalCapexKrw: 10_000,
    initialDebtFundingKrw: 6_000,
    baseCapRatePct: 6,
    baseExitCapRatePct: 6,
    baseInterestRatePct: 5,
    baseOccupancyPct: 90,
    growthPct: 2,
    stabilizedNoiKrw: 700,
    terminalValueKrw: 14_000
  });

  // All seven key drivers present.
  assert.equal(tornado.drivers.length, 7);
  const keys = tornado.drivers.map((d) => d.key).sort();
  assert.deepEqual(keys, [
    'capRate',
    'exitCapRate',
    'growth',
    'interestRate',
    'occupancy',
    'opex',
    'rentNoi'
  ]);

  // Monotonic non-increasing ranking by absolute IRR swing (widest bar first).
  for (let i = 1; i < tornado.drivers.length; i++) {
    assert.ok(
      tornado.drivers[i - 1]!.irrSwing >= tornado.drivers[i]!.irrSwing,
      `driver ${i - 1} swing ${tornado.drivers[i - 1]!.irrSwing} should be >= driver ${i} swing ${tornado.drivers[i]!.irrSwing}`
    );
  }

  // Every reported swing equals |highIrr - lowIrr| and is non-negative.
  for (const d of tornado.drivers) {
    assert.ok(d.irrSwing >= 0);
    if (d.lowIrr !== null && d.highIrr !== null) {
      assert.ok(
        Math.abs(d.irrSwing - Math.abs(d.highIrr - d.lowIrr)) < 1e-3,
        `${d.key}: swing ${d.irrSwing} mismatch with |${d.highIrr} - ${d.lowIrr}|`
      );
    }
  }

  // The top driver must have the maximum swing across all drivers.
  const maxSwing = Math.max(...tornado.drivers.map((d) => d.irrSwing));
  assert.equal(tornado.drivers[0]!.irrSwing, maxSwing);
});
