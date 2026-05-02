import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCashFlowSlice, DEFAULT_CASH_FLOW_ASSUMPTIONS } from '@/lib/services/im/cash-flow';
import { buildCovenantHeadroom } from '@/lib/services/im/covenant';
import { buildLiquidityLadder } from '@/lib/services/im/liquidity';
import { buildWaterfall, readSpvFromAssumptions } from '@/lib/services/im/waterfall';
import type { ProjectionRow } from '@/lib/services/im/credit-analysis';

const SAMPLE_FS = {
  revenueKrw: 27_060_000_000,
  ebitdaKrw: 8_856_000_000,
  interestExpenseKrw: 1_968_000_000
};

// ---- cash-flow ----

test('buildCashFlowSlice computes EBIT, net income, FCF, CFADS', () => {
  const cf = buildCashFlowSlice({
    ebitdaKrw: SAMPLE_FS.ebitdaKrw,
    revenueKrw: SAMPLE_FS.revenueKrw,
    interestExpenseKrw: SAMPLE_FS.interestExpenseKrw,
    taxRate: 0.242,
    daRateOfRevenue: 0.06,
    maintCapexRateOfRevenue: 0.025,
    wcChangeRate: -0.005,
    principalRepaymentKrw: 1_000_000_000
  });
  // D&A = 27.06B × 6% = 1.6236B
  assert.ok(Math.abs(cf.daKrw! - 27_060_000_000 * 0.06) < 1);
  // EBIT = EBITDA − D&A = 8.856B − 1.6236B = 7.2324B
  assert.ok(Math.abs(cf.ebitKrw! - (8_856_000_000 - 27_060_000_000 * 0.06)) < 1);
  // Net income = (EBIT − interest) × (1 − tax) = (7.2324B − 1.968B) × 0.758
  const expectedNI = (8_856_000_000 - 27_060_000_000 * 0.06 - 1_968_000_000) * (1 - 0.242);
  assert.ok(Math.abs(cf.netIncomeKrw! - expectedNI) < 1);
  // CFADS DSCR = CFADS / debt service. Debt service = 1.968B + 1B = 2.968B
  assert.ok(cf.cfadsDscr! > 0);
  assert.equal(cf.debtServiceKrw, 2_968_000_000);
});

test('buildCashFlowSlice handles missing inputs', () => {
  const cf = buildCashFlowSlice({
    ebitdaKrw: null,
    revenueKrw: null,
    interestExpenseKrw: null,
    taxRate: 0.242,
    daRateOfRevenue: 0.06,
    maintCapexRateOfRevenue: 0.025,
    wcChangeRate: -0.005
  });
  assert.equal(cf.ebitdaKrw, null);
  assert.equal(cf.netIncomeKrw, null);
  assert.equal(cf.cfadsDscr, null);
});

test('DEFAULT_CASH_FLOW_ASSUMPTIONS exposes all four assumption rates', () => {
  assert.equal(typeof DEFAULT_CASH_FLOW_ASSUMPTIONS.daRateOfRevenue, 'number');
  assert.equal(typeof DEFAULT_CASH_FLOW_ASSUMPTIONS.maintCapexRateOfRevenue, 'number');
  assert.equal(typeof DEFAULT_CASH_FLOW_ASSUMPTIONS.wcChangeRate, 'number');
  assert.equal(typeof DEFAULT_CASH_FLOW_ASSUMPTIONS.taxRate, 'number');
});

// ---- covenant headroom ----

const PROJ: ProjectionRow[] = [
  {
    year: '2026A',
    revenueKrw: 100,
    ebitdaKrw: 32,
    ebitdaMarginPct: 32,
    interestExpenseKrw: 8,
    totalDebtKrw: 124,
    leverage: 3.875, // pass
    interestCoverage: 4.0 // pass
  },
  {
    year: '2027E',
    revenueKrw: 105,
    ebitdaKrw: 34,
    ebitdaMarginPct: 32,
    interestExpenseKrw: 8,
    totalDebtKrw: 130,
    leverage: 3.82,
    interestCoverage: 4.25
  },
  {
    year: '2028E',
    revenueKrw: 110,
    ebitdaKrw: 25,
    ebitdaMarginPct: 22,
    interestExpenseKrw: 8,
    totalDebtKrw: 130,
    leverage: 5.2, // BREACH at 5.2 > 4.0
    interestCoverage: 3.13
  }
];

test('buildCovenantHeadroom returns headroom + first-breach-year for both covenants', () => {
  const out = buildCovenantHeadroom(PROJ);
  assert.equal(out.length, 2);
  const lev = out.find((r) => r.ratioKey === 'leverage')!;
  // (4.0 − 3.875) / 4.0 = 3.125% headroom
  assert.ok(Math.abs(lev.headroomPct! - 3.125) < 0.01);
  assert.equal(lev.firstBreachYear, '2028E');
  assert.equal(lev.worstYear, '2028E');
  assert.ok(lev.worstValue! > 5);

  const cov = out.find((r) => r.ratioKey === 'interestCoverage')!;
  // (4.0 − 2.0) / 2.0 = 100% headroom
  assert.ok(Math.abs(cov.headroomPct! - 100) < 0.01);
  // Coverage 3.13 still above 2.0 → no breach
  assert.equal(cov.firstBreachYear, null);
});

test('buildCovenantHeadroom returns no breach when path stays inside band', () => {
  const out = buildCovenantHeadroom([
    { year: '2026A', revenueKrw: 100, ebitdaKrw: 32, ebitdaMarginPct: 32,
      interestExpenseKrw: 8, totalDebtKrw: 100, leverage: 3.0, interestCoverage: 4.0 }
  ]);
  for (const r of out) {
    assert.equal(r.firstBreachYear, null);
  }
});

// ---- waterfall ----

test('readSpvFromAssumptions extracts spv subobject', () => {
  const spv = readSpvFromAssumptions({
    spv: {
      managementFeePct: 1.25,
      performanceFeePct: 8,
      promoteThresholdPct: 10,
      promoteSharePct: 15,
      reserveTargetMonths: 6
    }
  });
  assert.equal(spv?.promoteThresholdPct, 10);
  assert.equal(spv?.promoteSharePct, 15);
});

test('readSpvFromAssumptions returns null on missing input', () => {
  assert.equal(readSpvFromAssumptions(null), null);
  assert.equal(readSpvFromAssumptions({}), null);
});

test('buildWaterfall returns 4-tier waterfall with hurdle and promote', () => {
  const w = buildWaterfall(
    {
      managementFeePct: 1.25,
      performanceFeePct: 8,
      promoteThresholdPct: 10,
      promoteSharePct: 15,
      reserveTargetMonths: 6
    },
    14.0 // projected IRR above hurdle
  );
  assert.equal(w.tiers.length, 4);
  assert.equal(w.hurdleRatePct, 10);
  assert.equal(w.promoteSharePct, 15);
  assert.ok(w.lpTakePct! < 100);
  assert.ok(w.gpTakePct! > 0);
});

test('buildWaterfall gives 100% to LP when IRR ≤ hurdle', () => {
  const w = buildWaterfall(
    { promoteThresholdPct: 10, promoteSharePct: 15 },
    8.0
  );
  assert.equal(w.lpTakePct, 100);
  assert.equal(w.gpTakePct, 0);
});

test('buildWaterfall handles null SPV', () => {
  const w = buildWaterfall(null, 12);
  assert.equal(w.tiers.length, 0);
  assert.equal(w.hurdleRatePct, null);
});

// ---- liquidity ladder ----

test('buildLiquidityLadder computes 12-month debt service and coverage', () => {
  const lad = buildLiquidityLadder(
    [
      {
        id: 'f1',
        facilityType: 'CONSTRUCTION',
        lenderName: 'KIB',
        commitmentKrw: 98_000_000_000,
        drawnAmountKrw: 98_000_000_000,
        interestRatePct: 5.4,
        amortizationTermMonths: 84,
        balloonPct: 15
      }
    ],
    { cashKrw: 5_000_000_000, estimatedAnnualCashFlowKrw: 8_000_000_000 },
    2026
  );
  assert.equal(lad.rows.length, 1);
  // yearly amort = 98B × 85% / 7yr = 11.9B; interest = 98B × 5.4% = 5.292B
  // 12mo debt service = 11.9B + 5.292B = 17.192B
  const expectedAmort = (98_000_000_000 * 0.85) / 7;
  const expectedInterest = 98_000_000_000 * 0.054;
  assert.ok(
    Math.abs(lad.twelveMonthDebtServiceKrw - (expectedAmort + expectedInterest)) < 1
  );
  // coverage = (5B + 8B) / 17.192B ≈ 0.756x
  assert.ok(lad.liquidityCoverage! < 1);
  // balloon year = 2026 + 7 = 2033
  assert.equal(lad.rows[0]!.balloonYear, '2033');
});

test('buildLiquidityLadder returns no rows when no drawn debt', () => {
  const lad = buildLiquidityLadder(
    [],
    { cashKrw: 1_000_000_000, estimatedAnnualCashFlowKrw: 0 },
    2026
  );
  assert.equal(lad.rows.length, 0);
  assert.equal(lad.liquidityCoverage, null);
});
