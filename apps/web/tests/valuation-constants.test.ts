import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_ANNUAL_PRICE_GROWTH_PCT,
  DEFAULT_DSCR_COVENANT,
  DEFAULT_FLOOR_P10_IRR_PCT,
  DEFAULT_MAX_MACRO_SCORE,
  DEFAULT_MAX_PROB_BELOW_8_PCT,
  DEFAULT_MIN_MOIC_P50,
  DEFAULT_TARGET_LEVERED_IRR_PCT,
  ENGINE_CONFIDENCE_BOUNDS,
  ENGINE_CONFIDENCE_CEILING,
  ENGINE_CONFIDENCE_FLOOR,
  MAX_ANNUAL_GROWTH_PCT,
  MAX_FACTOR_ADJUSTMENT_PCT,
  MAX_NET_ADJUSTMENT_PCT,
  SIZE_ELASTICITY,
  TERMINAL_NOI_FLOOR_RATIO
} from '@/lib/services/valuation/constants';
import {
  DEFAULT_ANNUAL_PRICE_GROWTH_PCT as COMP_DEFAULT_GROWTH,
  MAX_ANNUAL_GROWTH_PCT as COMP_MAX_GROWTH,
  MAX_FACTOR_ADJUSTMENT_PCT as COMP_MAX_FACTOR,
  MAX_NET_ADJUSTMENT_PCT as COMP_MAX_NET,
  SIZE_ELASTICITY as COMP_SIZE_ELASTICITY
} from '@/lib/services/valuation/comp-adjustments';
import { DEFAULT_HURDLES } from '@/lib/services/valuation/investment-verdict';

// These pinned values guard the analyst-auditable assumptions so an accidental
// edit re-prices deals only with an explicit, reviewed test change.
test('comp-adjustment constants are pinned', () => {
  assert.equal(MAX_FACTOR_ADJUSTMENT_PCT, 35);
  assert.equal(MAX_NET_ADJUSTMENT_PCT, 60);
  assert.equal(DEFAULT_ANNUAL_PRICE_GROWTH_PCT, 2.5);
  assert.equal(MAX_ANNUAL_GROWTH_PCT, 12);
  assert.equal(SIZE_ELASTICITY, 0.1);
});

test('engine-wide confidence bounds are pinned', () => {
  assert.equal(ENGINE_CONFIDENCE_FLOOR, 4.5);
  assert.equal(ENGINE_CONFIDENCE_CEILING, 9.9);
  assert.deepEqual(ENGINE_CONFIDENCE_BOUNDS, { floor: 4.5, ceiling: 9.9 });
});

test('lease-DCF terminal floor ratio is pinned', () => {
  assert.equal(TERMINAL_NOI_FLOOR_RATIO, 0.01);
});

test('investment-verdict default hurdles are pinned', () => {
  assert.equal(DEFAULT_TARGET_LEVERED_IRR_PCT, 12);
  assert.equal(DEFAULT_FLOOR_P10_IRR_PCT, 6);
  assert.equal(DEFAULT_MAX_PROB_BELOW_8_PCT, 0.25);
  assert.equal(DEFAULT_MIN_MOIC_P50, 1.5);
  assert.equal(DEFAULT_MAX_MACRO_SCORE, 70);
  assert.equal(DEFAULT_DSCR_COVENANT, 1.15);
});

test('comp-adjustments re-exports the centralized constants unchanged', () => {
  assert.equal(COMP_MAX_FACTOR, MAX_FACTOR_ADJUSTMENT_PCT);
  assert.equal(COMP_MAX_NET, MAX_NET_ADJUSTMENT_PCT);
  assert.equal(COMP_DEFAULT_GROWTH, DEFAULT_ANNUAL_PRICE_GROWTH_PCT);
  assert.equal(COMP_MAX_GROWTH, MAX_ANNUAL_GROWTH_PCT);
  assert.equal(COMP_SIZE_ELASTICITY, SIZE_ELASTICITY);
});

test('DEFAULT_HURDLES is wired from the centralized constants', () => {
  assert.deepEqual(DEFAULT_HURDLES, {
    targetLeveredIrrPct: DEFAULT_TARGET_LEVERED_IRR_PCT,
    floorP10IrrPct: DEFAULT_FLOOR_P10_IRR_PCT,
    maxProbBelow8Pct: DEFAULT_MAX_PROB_BELOW_8_PCT,
    minMoicP50: DEFAULT_MIN_MOIC_P50,
    maxMacroScore: DEFAULT_MAX_MACRO_SCORE,
    dscrCovenant: DEFAULT_DSCR_COVENANT
  });
});
