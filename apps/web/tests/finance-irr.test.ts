import assert from 'node:assert/strict';
import test from 'node:test';
import { bisectIrr, computeIrr, computeXirr, npv, type DatedCashflow } from '@/lib/finance/irr';

// ---------------------------------------------------------------------------
// computeIrr (period-indexed Newton + bisection; percent, 4dp)
// ---------------------------------------------------------------------------

test('computeIrr of [-100, 110] is ~10%', () => {
  const irr = computeIrr([-100, 110]);
  assert.ok(irr !== null);
  assert.ok(Math.abs(irr! - 10) < 1e-6, `expected ~10, got ${irr}`);
});

test('computeIrr returns null without a sign change', () => {
  assert.equal(computeIrr([100, 200, 300]), null);
  assert.equal(computeIrr([-100]), null);
  assert.equal(computeIrr([]), null);
});

test('computeIrr handles a multi-year project with terminal value', () => {
  const irr = computeIrr([-10000, 1500, 1500, 1500, 1500, 1500 + 12000]);
  assert.ok(irr !== null);
  assert.ok(irr! > 10 && irr! < 30, `expected 10-30, got ${irr}`);
});

test('computeIrr handles a negative-IRR project', () => {
  const irr = computeIrr([-1000, 200, 200, 100]);
  assert.ok(irr !== null);
  assert.ok(irr! < 0, `expected negative, got ${irr}`);
});

test('computeIrr returns percent rounded to 4dp', () => {
  const irr = computeIrr([-100, 110]);
  // 4dp rounding means at most 4 decimals.
  assert.equal(irr, Number(irr!.toFixed(4)));
});

test('npv is zero at the IRR rate (within tolerance)', () => {
  const flows = [-100, 110];
  const rate = computeIrr(flows)! / 100;
  assert.ok(Math.abs(npv(flows, rate)) < 1e-3);
});

// ---------------------------------------------------------------------------
// computeXirr (date-aware, act/365; percent, 4dp)
// ---------------------------------------------------------------------------

function date(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

test('computeXirr of a one-year [-100, +110] is ~10%', () => {
  const flows: DatedCashflow[] = [
    { date: date(2024, 1, 1), amountKrw: -100 },
    { date: date(2025, 1, 1), amountKrw: 110 } // 366 days (2024 leap) → act/365 slightly > 1yr
  ];
  const xirr = computeXirr(flows);
  assert.ok(xirr !== null);
  // Slightly under 10% because the period spans 366/365 years.
  assert.ok(Math.abs(xirr! - 10) < 0.5, `expected ~10, got ${xirr}`);
});

test('computeXirr returns null without a sign change or with < 2 flows', () => {
  assert.equal(computeXirr([{ date: date(2024, 1, 1), amountKrw: -100 }]), null);
  assert.equal(
    computeXirr([
      { date: date(2024, 1, 1), amountKrw: 100 },
      { date: date(2025, 1, 1), amountKrw: 200 }
    ]),
    null
  );
});

test('computeXirr rewards earlier inflows with a higher rate', () => {
  const early = computeXirr([
    { date: date(2024, 1, 1), amountKrw: -100 },
    { date: date(2024, 7, 1), amountKrw: 120 }
  ])!;
  const late = computeXirr([
    { date: date(2024, 1, 1), amountKrw: -100 },
    { date: date(2026, 1, 1), amountKrw: 120 }
  ])!;
  assert.ok(early > late);
});

// ---------------------------------------------------------------------------
// bisectIrr (waterfall / fx-hedge variants)
// ---------------------------------------------------------------------------

test('bisectIrr fraction variant (american/fx-hedge) of [-100, 110] is ~0.10', () => {
  const r = bisectIrr([-100, 110], {
    lo: -0.99,
    hi: 10,
    iterations: 100,
    tolerance: 1e-6,
    branch: 'product-sign',
    requireBracket: true,
    scale: 'fraction'
  });
  assert.ok(r !== null);
  assert.ok(Math.abs(r! - 0.1) < 1e-3, `expected ~0.10, got ${r}`);
});

test('bisectIrr percent variant (european) of [-100, 110] is ~10', () => {
  const r = bisectIrr([-100, 110], {
    lo: -0.99,
    hi: 10,
    iterations: 100,
    tolerance: 1,
    branch: 'value-sign',
    scale: 'percent',
    percentDecimals: 3
  });
  assert.ok(r !== null);
  assert.ok(Math.abs(r! - 10) < 1, `expected ~10, got ${r}`);
});

test('bisectIrr returns null without a sign change', () => {
  assert.equal(bisectIrr([100, 200]), null);
  assert.equal(bisectIrr([-100]), null);
});
