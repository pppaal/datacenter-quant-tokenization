import assert from 'node:assert/strict';
import test from 'node:test';
import { computeValuationInputsHash } from '@/lib/services/valuation/inputs-hash';

test('computeValuationInputsHash is stable across object key order', () => {
  const a = computeValuationInputsHash({
    engineVersion: 'v1.4.0',
    assumptions: {
      capRate: 0.0625,
      discountRate: 0.085,
      exitYear: 7
    }
  });
  const b = computeValuationInputsHash({
    engineVersion: 'v1.4.0',
    assumptions: {
      exitYear: 7,
      discountRate: 0.085,
      capRate: 0.0625
    }
  });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('computeValuationInputsHash changes when an assumption value changes', () => {
  const a = computeValuationInputsHash({
    engineVersion: 'v1.4.0',
    assumptions: { capRate: 0.0625 }
  });
  const b = computeValuationInputsHash({
    engineVersion: 'v1.4.0',
    assumptions: { capRate: 0.0626 }
  });
  assert.notEqual(a, b);
});

test('computeValuationInputsHash changes when engine version changes', () => {
  const a = computeValuationInputsHash({
    engineVersion: 'v1.4.0',
    assumptions: { capRate: 0.0625 }
  });
  const b = computeValuationInputsHash({
    engineVersion: 'v1.4.1',
    assumptions: { capRate: 0.0625 }
  });
  assert.notEqual(a, b);
});

test('computeValuationInputsHash distinguishes nested object differences', () => {
  const a = computeValuationInputsHash({
    engineVersion: 'v1',
    assumptions: { rentRoll: { tenant: { name: 'Samsung', sqm: 1200 } } }
  });
  const b = computeValuationInputsHash({
    engineVersion: 'v1',
    assumptions: { rentRoll: { tenant: { name: 'Samsung', sqm: 1201 } } }
  });
  assert.notEqual(a, b);
});
