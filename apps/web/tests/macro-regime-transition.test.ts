import assert from 'node:assert/strict';
import test from 'node:test';
import { detectRegimeTransitions } from '@/lib/services/macro/regime-transition';
import type { MacroInterpretation, RegimeState } from '@/lib/services/macro/regime';

function makeInterpretation(regimeStates: {
  capitalMarkets: RegimeState;
  leasing: RegimeState;
  construction: RegimeState;
  refinance: RegimeState;
}): MacroInterpretation {
  return {
    market: 'KR',
    asOf: '2026-03-01',
    series: [],
    assetClass: 'DATA_CENTER',
    profile: { assetClass: 'DATA_CENTER', label: 'Data Center', market: 'KR', country: 'KR', submarket: null, adjustmentSummary: [], capitalRateSensitivity: 1.2, liquiditySensitivity: 0.9, leasingSensitivity: 0.8, constructionSensitivity: 1.3 },
    regimes: {
      capitalMarkets: { key: 'capitalMarkets', label: 'Capital Markets', state: regimeStates.capitalMarkets, commentary: '', signals: [] },
      leasing: { key: 'leasing', label: 'Leasing', state: regimeStates.leasing, commentary: '', signals: [] },
      construction: { key: 'construction', label: 'Construction', state: regimeStates.construction, commentary: '', signals: [] },
      refinance: { key: 'refinance', label: 'Refinancing', state: regimeStates.refinance, commentary: '', signals: [] }
    },
    guidance: { discountRateShiftPct: 0, exitCapRateShiftPct: 0, debtCostShiftPct: 0, occupancyShiftPct: 0, growthShiftPct: 0, replacementCostShiftPct: 0, summary: [] },
    factors: [],
    impacts: { dimensions: [], paths: [], summary: [] }
  };
}

test('detectRegimeTransitions returns STABLE when no prior regime', () => {
  const current = makeInterpretation({ capitalMarkets: 'NEUTRAL', leasing: 'BALANCED', construction: 'CONTAINED', refinance: 'LOW' });
  const result = detectRegimeTransitions(current, null);

  assert.equal(result.hasTransition, false);
  assert.equal(result.overallDirection, 'STABLE');
  assert.equal(result.alertLevel, 'NONE');
});

test('detectRegimeTransitions returns STABLE when states unchanged', () => {
  const current = makeInterpretation({ capitalMarkets: 'NEUTRAL', leasing: 'BALANCED', construction: 'CONTAINED', refinance: 'LOW' });
  const previous = makeInterpretation({ capitalMarkets: 'NEUTRAL', leasing: 'BALANCED', construction: 'CONTAINED', refinance: 'LOW' });
  const result = detectRegimeTransitions(current, previous);

  assert.equal(result.hasTransition, false);
  assert.equal(result.overallDirection, 'STABLE');
  assert.equal(result.alertLevel, 'NONE');
});

test('detectRegimeTransitions detects single TIGHTENING', () => {
  const current = makeInterpretation({ capitalMarkets: 'TIGHT', leasing: 'BALANCED', construction: 'CONTAINED', refinance: 'LOW' });
  const previous = makeInterpretation({ capitalMarkets: 'NEUTRAL', leasing: 'BALANCED', construction: 'CONTAINED', refinance: 'LOW' });
  const result = detectRegimeTransitions(current, previous);

  assert.equal(result.hasTransition, true);
  assert.equal(result.overallDirection, 'TIGHTENING');
  assert.equal(result.transitions.length, 1);
  assert.equal(result.transitions[0]!.block, 'capitalMarkets');
  assert.equal(result.transitions[0]!.direction, 'TIGHTENING');
  assert.ok(result.alertLevel === 'WATCH' || result.alertLevel === 'ALERT');
});

test('detectRegimeTransitions detects EASING', () => {
  const current = makeInterpretation({ capitalMarkets: 'SUPPORTIVE', leasing: 'BALANCED', construction: 'CONTAINED', refinance: 'LOW' });
  const previous = makeInterpretation({ capitalMarkets: 'TIGHT', leasing: 'BALANCED', construction: 'CONTAINED', refinance: 'LOW' });
  const result = detectRegimeTransitions(current, previous);

  assert.equal(result.hasTransition, true);
  assert.equal(result.overallDirection, 'EASING');
  assert.equal(result.transitions[0]!.direction, 'EASING');
  assert.equal(result.transitions[0]!.severity, 'MAJOR');
});

test('detectRegimeTransitions detects MIXED when both tightening and easing', () => {
  const current = makeInterpretation({ capitalMarkets: 'TIGHT', leasing: 'STRONG', construction: 'CONTAINED', refinance: 'LOW' });
  const previous = makeInterpretation({ capitalMarkets: 'NEUTRAL', leasing: 'BALANCED', construction: 'CONTAINED', refinance: 'LOW' });
  const result = detectRegimeTransitions(current, previous);

  assert.equal(result.hasTransition, true);
  assert.equal(result.overallDirection, 'MIXED');
  assert.equal(result.transitions.length, 2);
});

test('detectRegimeTransitions CRITICAL alert on multiple major shifts', () => {
  const current = makeInterpretation({ capitalMarkets: 'TIGHT', leasing: 'SOFT', construction: 'HIGH', refinance: 'HIGH' });
  const previous = makeInterpretation({ capitalMarkets: 'SUPPORTIVE', leasing: 'STRONG', construction: 'CONTAINED', refinance: 'LOW' });
  const result = detectRegimeTransitions(current, previous);

  assert.equal(result.hasTransition, true);
  assert.equal(result.alertLevel, 'CRITICAL');
  assert.ok(result.headline.includes('Multiple major'));
});
