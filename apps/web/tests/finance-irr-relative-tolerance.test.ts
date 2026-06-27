import assert from 'node:assert/strict';
import test from 'node:test';
import { computeXirr, type DatedCashflow } from '@/lib/finance/irr';

function date(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

function scale(flows: DatedCashflow[], k: number): DatedCashflow[] {
  return flows.map((f) => ({ date: f.date, amountKrw: f.amountKrw * k }));
}

// XIRR is mathematically scale-invariant: multiplying every cashflow by a
// positive constant leaves the rate that zeroes the NPV unchanged. The old
// bisection used an ABSOLUTE |xnpv| < 1 convergence threshold, which is not
// scale-invariant — for sub-won (tiny/scaled) flows 1 exceeds the whole flow
// set, so the check fired on the first midpoint and returned the bracket centre
// (≈49.5 → 4950%) instead of the true rate. The relative tolerance ε·Σ|amount|
// fixes this.

// A high-return half-year flow whose annualized XIRR pins to the 100% (→ 10000)
// ceiling and routes through the bisection fallback (Newton overshoots the
// [−0.9999, 100] bound). This is exactly the regime the old absolute threshold
// mishandled at small scale.
const BISECTION_FLOWS: DatedCashflow[] = [
  { date: date(2020, 1, 1), amountKrw: -100 },
  { date: date(2020, 7, 1), amountKrw: 5000 }
];

test('XIRR is scale-invariant across tiny AND large flow sets (bisection path)', () => {
  const reference = computeXirr(BISECTION_FLOWS);
  assert.ok(reference !== null);
  for (const k of [1e-6, 1e-3, 1, 1e6, 1e12]) {
    const r = computeXirr(scale(BISECTION_FLOWS, k));
    assert.ok(r !== null, `k=${k} returned null`);
    assert.equal(r, reference, `k=${k}: ${r} ≠ reference ${reference}`);
  }
});

test('XIRR does not collapse to the bracket centre for sub-won flows', () => {
  // The old absolute |xnpv| < 1 produced ~4950% here; the correct (capped) rate
  // is 10000. Assert we are NOT near the spurious bracket-centre value.
  const r = computeXirr(scale(BISECTION_FLOWS, 1e-3));
  assert.ok(r !== null);
  assert.ok(Math.abs(r! - 4950.005) > 100, `collapsed to bracket centre: ${r}`);
});

test('XIRR ranking is preserved at any flow scale (earlier inflow ranks higher)', () => {
  const early: DatedCashflow[] = [
    { date: date(2024, 1, 1), amountKrw: -100 },
    { date: date(2024, 7, 1), amountKrw: 130 }
  ];
  const late: DatedCashflow[] = [
    { date: date(2024, 1, 1), amountKrw: -100 },
    { date: date(2026, 1, 1), amountKrw: 130 }
  ];
  for (const k of [1e-4, 1, 1e9, 1e15]) {
    const e = computeXirr(scale(early, k))!;
    const l = computeXirr(scale(late, k))!;
    assert.ok(e > l, `k=${k}: early ${e} should outrank late ${l}`);
  }
});

test('ordinary-scale XIRR results are unchanged by the relative tolerance', () => {
  // Plain one-year [-100, +110] ≈ 10% (slightly under, 366/365 leap span).
  const oneYear: DatedCashflow[] = [
    { date: date(2024, 1, 1), amountKrw: -100 },
    { date: date(2025, 1, 1), amountKrw: 110 }
  ];
  const r = computeXirr(oneYear)!;
  assert.ok(Math.abs(r - 10) < 0.5, `expected ~10, got ${r}`);

  // A larger multi-flow fund at ₩-billion scale converges to the same rate as
  // its unit-scaled twin.
  const fund: DatedCashflow[] = [
    { date: date(2018, 1, 1), amountKrw: -1_000_000_000 },
    { date: date(2019, 1, 1), amountKrw: 200_000_000 },
    { date: date(2020, 1, 1), amountKrw: 300_000_000 },
    { date: date(2021, 1, 1), amountKrw: 400_000_000 },
    { date: date(2022, 1, 1), amountKrw: 500_000_000 }
  ];
  assert.equal(computeXirr(fund), computeXirr(scale(fund, 1e-9)));
});
