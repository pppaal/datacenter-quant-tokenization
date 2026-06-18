import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clamp, round, toNumber, toNumberOrNull } from '../lib/math';

test('clamp constrains values to the inclusive range', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(42, 0, 10), 10);
  assert.equal(clamp(0, 0, 10), 0);
  assert.equal(clamp(10, 0, 10), 10);
});

test('clamp works with negative and fractional bounds', () => {
  assert.equal(clamp(-0.5, -1, 1), -0.5);
  assert.equal(clamp(-2, -1, 1), -1);
  assert.equal(clamp(2.5, -1, 1), 1);
});

test('round defaults to one decimal place and returns a number', () => {
  assert.equal(round(1.234), 1.2);
  assert.equal(round(1.25), 1.3);
  assert.equal(typeof round(1.234), 'number');
});

test('round honours an explicit precision', () => {
  assert.equal(round(1.23456, 2), 1.23);
  assert.equal(round(1.23456, 0), 1);
  assert.equal(round(100, 2), 100);
});

test('toNumber passes through finite numbers', () => {
  assert.equal(toNumber(3.14), 3.14);
  assert.equal(toNumber(0), 0);
  assert.equal(toNumber(-12), -12);
});

test('toNumber falls back for nullish and non-finite input', () => {
  assert.equal(toNumber(null), 0);
  assert.equal(toNumber(undefined), 0);
  assert.equal(toNumber(Number.NaN), 0);
  assert.equal(toNumber(Number.POSITIVE_INFINITY), 0);
  assert.equal(toNumber(null, -1), -1);
});

test('toNumber unwraps Decimal-like objects via toNumber()', () => {
  const decimalish = { toNumber: () => 7.5 };
  assert.equal(toNumber(decimalish), 7.5);

  const throwing = {
    toNumber: () => {
      throw new Error('overflow');
    }
  };
  assert.equal(toNumber(throwing), 0);
  assert.equal(toNumber(throwing, 9), 9);
});

test('toNumber parses numeric strings and rejects garbage', () => {
  assert.equal(toNumber('42.5'), 42.5);
  assert.equal(toNumber('not-a-number'), 0);
  assert.equal(toNumber('garbage', 5), 5);
});

test('toNumberOrNull preserves null/undefined instead of folding to 0', () => {
  assert.equal(toNumberOrNull(null), null);
  assert.equal(toNumberOrNull(undefined), null);
  // Decimal-like and plain numbers unwrap to a number; 0 stays 0 (not null).
  assert.equal(toNumberOrNull({ toNumber: () => 14_000_000_000 }), 14_000_000_000);
  assert.equal(toNumberOrNull(0), 0);
  assert.equal(toNumberOrNull(-12.5), -12.5);
  // Non-finite / unconvertible collapses to null (no misleading 0).
  assert.equal(toNumberOrNull(Number.NaN), null);
  assert.equal(toNumberOrNull('garbage'), null);
});
