import assert from 'node:assert/strict';
import test from 'node:test';
import { getValuationRecommendation } from '@/lib/valuation/recommendation';

test('getValuationRecommendation maps the 0-10 confidence scale to tiers', () => {
  assert.equal(getValuationRecommendation(9.9), 'Proceed To Committee');
  assert.equal(getValuationRecommendation(7.5), 'Proceed To Committee'); // boundary
  assert.equal(getValuationRecommendation(6.9), 'Proceed With Conditions');
  assert.equal(getValuationRecommendation(5.5), 'Proceed With Conditions'); // boundary
  assert.equal(getValuationRecommendation(5.4), 'Further Diligence Required');
  assert.equal(getValuationRecommendation(0), 'Further Diligence Required');
});

test('getValuationRecommendation defaults nullish confidence to further diligence', () => {
  assert.equal(getValuationRecommendation(null), 'Further Diligence Required');
  assert.equal(getValuationRecommendation(undefined), 'Further Diligence Required');
});

test('regression: realistic engine scores are not always "Further Diligence"', () => {
  // The engine clamps confidence to ~4.5-9.9. Before the fix the thresholds were
  // 75/55 (a 0-100 assumption), so committee-grade assets always read "Further
  // Diligence Required". A typical strong score must now reach committee.
  assert.equal(getValuationRecommendation(8.6), 'Proceed To Committee');
  assert.equal(getValuationRecommendation(7.9), 'Proceed To Committee');
});
