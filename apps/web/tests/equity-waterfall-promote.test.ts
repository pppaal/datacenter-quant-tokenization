import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeEquityWaterfall } from '@/lib/services/valuation/equity-waterfall';
import type {
  CostApproachResult,
  DebtScheduleResult,
  LeaseDcfResult,
  PreparedUnderwritingInputs,
  ScenarioInput
} from '@/lib/services/valuation/types';

/**
 * Promote/carry must be charged on the EXCESS above the hurdle, not on gross
 * equity proceeds. Two properties this pins:
 *   1. GP does not capture a slice of the LP's RETURNED CAPITAL (promote base
 *      excludes invested basis grossed up by the threshold).
 *   2. Net exit value is MONOTONIC across the hurdle — crossing it by 1 KRW no
 *      longer instantly carves ~20% off the entire equity exit (the old cliff).
 *
 * The operating loop is isolated out by passing zero lease-DCF years, so the
 * exit-side promote math is exercised directly. Only the fields the function
 * reads are populated; the rest are cast.
 */

const INVESTED_CAPEX = 100;
const THRESHOLD_PCT = 10; // hurdle = 100 * 1.10 = 110
const SHARE_PCT = 20;

const prepared = {
  capexBreakdown: { totalCapexKrw: INVESTED_CAPEX },
  spvProfile: {
    promoteThresholdPct: THRESHOLD_PCT,
    promoteSharePct: SHARE_PCT,
    performanceFeePct: 0,
    managementFeePct: 0
  },
  taxProfile: {
    propertyTaxPct: 0,
    insurancePct: 0,
    corporateTaxPct: 0,
    exitTaxPct: 0,
    withholdingTaxPct: 0
  },
  baseDiscountRatePct: 8,
  annualGrowthPct: 0
} as unknown as PreparedUnderwritingInputs;

const scenario = { discountRateShiftPct: 0 } as unknown as ScenarioInput;
const costApproach = {
  replacementCostFloorKrw: 0,
  directComparableValueKrw: 0
} as unknown as CostApproachResult;
const debtSchedule = {
  years: [],
  endingDebtBalanceKrw: 0,
  reserveRequirementKrw: 0,
  initialDebtFundingKrw: 0
} as unknown as DebtScheduleResult;

function leaseDcf(terminalValueKrw: number): LeaseDcfResult {
  // Zero operating years → leveredEquityPv = 0 and the exit discount exponent is
  // 0, so leveredEquityValueKrw == net exit proceeds (undiscounted) and the
  // promote math is observable directly.
  return { years: [], terminalValueKrw } as unknown as LeaseDcfResult;
}

test('promote is charged only on the excess above the hurdle (not gross / not returned capital)', () => {
  // grossExit 200, hurdle 110 → promote base 90 → fee 90 * 20% = 18.
  // The old gross-proceeds form would have charged 200 * 20% = 40, taxing the
  // LP's returned 100 of capital.
  const r = computeEquityWaterfall(prepared, scenario, costApproach, leaseDcf(200), debtSchedule);
  assert.ok(Math.abs(r.promoteFeeKrw - 18) < 1e-9, `expected ~18, got ${r.promoteFeeKrw}`);
});

test('net exit value is monotonic across the hurdle (no promote cliff)', () => {
  const below = computeEquityWaterfall(
    prepared,
    scenario,
    costApproach,
    leaseDcf(109),
    debtSchedule
  );
  const above = computeEquityWaterfall(
    prepared,
    scenario,
    costApproach,
    leaseDcf(111),
    debtSchedule
  );

  // Just below the hurdle: no promote.
  assert.equal(below.promoteFeeKrw, 0);
  // Just above: promote is tiny (1 * 20% = 0.2), NOT a ~20% cliff.
  assert.ok(above.promoteFeeKrw < 1, `expected a continuous promote, got ${above.promoteFeeKrw}`);
  // More gross proceeds must yield MORE equity value, never less.
  assert.ok(
    above.leveredEquityValueKrw > below.leveredEquityValueKrw,
    `equity value must increase with gross proceeds (got ${above.leveredEquityValueKrw} <= ${below.leveredEquityValueKrw})`
  );
});

test('no promote when proceeds do not clear the hurdle', () => {
  const r = computeEquityWaterfall(prepared, scenario, costApproach, leaseDcf(105), debtSchedule);
  assert.equal(r.promoteFeeKrw, 0);
});
