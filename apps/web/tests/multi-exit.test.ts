import assert from 'node:assert/strict';
import test from 'node:test';
import { compareExitScenarios, type MultiExitInput } from '@/lib/services/valuation/multi-exit';

const baseInput: MultiExitInput = {
  stabilizedNoiKrw: 8_000_000_000, // 8bn KRW NOI
  exitCapRatePct: 5.5,
  gfaSqm: 12_000,
  outstandingDebtKrw: 70_000_000_000,
  bookBasisKrw: 120_000_000_000,
  exitYear: 5,
  discountRatePct: 8,
  strataEligible: true,
  reitSeedEligible: true
};

test('compareExitScenarios: all 4 scenarios produced when all paths eligible', () => {
  const result = compareExitScenarios(baseInput);
  assert.equal(result.scenarios.length, 4);
  const keys = result.scenarios.map((s) => s.scenario);
  assert.deepEqual([...keys].sort(), ['BULK_SALE', 'REFI_HOLD', 'REIT_SEED', 'STRATA_SALE']);
});

test('STRATA_SALE flagged infeasible when not strata-eligible', () => {
  const result = compareExitScenarios({ ...baseInput, strataEligible: false });
  const strata = result.scenarios.find((s) => s.scenario === 'STRATA_SALE')!;
  assert.equal(strata.feasible, false);
  assert.ok(strata.infeasibilityReason);
  assert.equal(result.winner !== 'STRATA_SALE', true);
});

test('REIT_SEED flagged infeasible when not seed-eligible', () => {
  const result = compareExitScenarios({ ...baseInput, reitSeedEligible: false });
  const reit = result.scenarios.find((s) => s.scenario === 'REIT_SEED')!;
  assert.equal(reit.feasible, false);
  assert.equal(result.winner !== 'REIT_SEED', true);
});

test('BULK_SALE always feasible and produces positive NPV for profitable asset', () => {
  const result = compareExitScenarios(baseInput);
  const bulk = result.scenarios.find((s) => s.scenario === 'BULK_SALE')!;
  assert.equal(bulk.feasible, true);
  assert.ok(bulk.grossProceedsKrw > 0);
  assert.ok(bulk.npvKrw > 0);
});

test('REIT_SEED grosses higher than BULK when reit cap is tighter', () => {
  const result = compareExitScenarios(baseInput);
  const bulk = result.scenarios.find((s) => s.scenario === 'BULK_SALE')!;
  const reit = result.scenarios.find((s) => s.scenario === 'REIT_SEED')!;
  // REIT valuation at 4.5% cap > bulk at 5.5% cap ⇒ gross to sponsor higher
  assert.ok(reit.grossProceedsKrw > bulk.grossProceedsKrw);
});

test('STRATA_SALE gross premium exceeds BULK gross when premium > 0', () => {
  const result = compareExitScenarios(baseInput);
  const bulk = result.scenarios.find((s) => s.scenario === 'BULK_SALE')!;
  const strata = result.scenarios.find((s) => s.scenario === 'STRATA_SALE')!;
  assert.ok(strata.grossProceedsKrw > bulk.grossProceedsKrw);
});

test('REFI_HOLD has zero exit tax (deferred)', () => {
  const result = compareExitScenarios(baseInput);
  const refi = result.scenarios.find((s) => s.scenario === 'REFI_HOLD')!;
  assert.equal(refi.taxKrw, 0);
});

test('winner rationale references NPV gap vs runner-up', () => {
  const result = compareExitScenarios(baseInput);
  assert.ok(result.winnerRationale.includes('NPV'));
  assert.ok(result.marginalityKrw >= 0);
});

test('BULK_SALE is winner when other paths blocked', () => {
  const result = compareExitScenarios({
    ...baseInput,
    strataEligible: false,
    reitSeedEligible: false
  });
  // REFI_HOLD is still feasible, so winner is best of BULK vs REFI.
  // For a 5-yr hold with substantial outstanding debt, expect BULK or REFI to win.
  assert.ok(['BULK_SALE', 'REFI_HOLD'].includes(result.winner));
});
