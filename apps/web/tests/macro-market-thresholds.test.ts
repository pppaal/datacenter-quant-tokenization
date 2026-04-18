import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getMarketFactorThresholds,
  getMarketInvertedThresholds
} from '@/lib/services/macro/market-thresholds';

test('KR market thresholds have tighter rate bounds than US', () => {
  const kr = getMarketFactorThresholds('KR');
  const us = getMarketFactorThresholds('US');

  assert.ok(kr.rateLevel.negativeAbove < us.rateLevel.negativeAbove);
  assert.ok(kr.rateLevel.positiveBelow < us.rateLevel.positiveBelow);
  assert.ok(kr.rateMomentumBps.negativeAbove < us.rateMomentumBps.negativeAbove);
});

test('JP market thresholds have lowest rate negative threshold', () => {
  const jp = getMarketFactorThresholds('JP');
  const kr = getMarketFactorThresholds('KR');

  assert.ok(jp.rateLevel.negativeAbove < kr.rateLevel.negativeAbove);
  assert.ok(jp.inflation.negativeAbove < kr.inflation.negativeAbove);
});

test('unknown market falls back to US/global thresholds', () => {
  const unknown = getMarketFactorThresholds('XX');
  const us = getMarketFactorThresholds('US');

  assert.equal(unknown.rateLevel.negativeAbove, us.rateLevel.negativeAbove);
  assert.equal(unknown.inflation.positiveBelow, us.inflation.positiveBelow);
});

test('inverted thresholds differ by market for liquidity and rent growth', () => {
  const kr = getMarketInvertedThresholds('KR');
  const us = getMarketInvertedThresholds('US');

  assert.ok(kr.liquidity.negativeBelow <= us.liquidity.negativeBelow);
  assert.ok(kr.rentGrowth.negativeBelow < us.rentGrowth.negativeBelow);
});

test('KR credit spread threshold is lower than US', () => {
  const kr = getMarketFactorThresholds('KR');
  const us = getMarketFactorThresholds('US');

  assert.ok(kr.creditSpreadBps.negativeAbove < us.creditSpreadBps.negativeAbove);
});
