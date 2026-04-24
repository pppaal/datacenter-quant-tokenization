import assert from 'node:assert/strict';
import test from 'node:test';
import type { MacroSeries } from '@prisma/client';
import { SourceStatus } from '@prisma/client';
import { detectRegimeShifts } from '@/lib/services/macro/regime-shift';

function makeSeries(seriesKey: string, values: number[]): MacroSeries[] {
  const now = new Date();
  return values.map((value, i) => ({
    id: `${seriesKey}-${i}`,
    assetId: null,
    market: 'KR',
    seriesKey,
    label: seriesKey,
    frequency: 'monthly',
    observationDate: new Date(Date.UTC(2023, i, 1)),
    value,
    unit: '%',
    sourceSystem: 'test',
    sourceStatus: SourceStatus.FRESH,
    sourceUpdatedAt: now,
    citationId: null,
    createdAt: now,
    updatedAt: now
  }));
}

test('detectRegimeShifts: sharp step-change is detected', () => {
  // Deterministic noise — tests should not flap.
  let seed = 7;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const values = [
    ...Array.from({ length: 16 }, () => 3.0 + (rand() * 0.2 - 0.1)),
    ...Array.from({ length: 16 }, () => 6.0 + (rand() * 0.2 - 0.1))
  ];
  const series = makeSeries('cap_rate_pct', values);
  const report = detectRegimeShifts(series, 'cap_rate_pct');
  assert.ok(report.shifts.length >= 1, `expected at least one shift, got ${report.shifts.length}`);
  const shift = report.shifts[0]!;
  assert.ok(shift.postMean > shift.preMean, 'post-segment mean should be higher');
  assert.ok(['MODERATE', 'EXTREME'].includes(shift.shiftMagnitude));
});

test('detectRegimeShifts: stable series produces zero shifts', () => {
  const values = Array.from({ length: 24 }, (_, i) => 5.0 + Math.sin(i / 3) * 0.1);
  const series = makeSeries('stable', values);
  const report = detectRegimeShifts(series, 'stable');
  assert.equal(report.shifts.length, 0);
  assert.equal(report.segments.length, 1);
});

test('detectRegimeShifts: too few observations returns single segment', () => {
  const series = makeSeries('tiny', [1, 2, 3, 4]);
  const report = detectRegimeShifts(series, 'tiny');
  assert.equal(report.shifts.length, 0);
  assert.equal(report.segments.length, 1);
});

test('detectRegimeShifts: segments partition the series without gaps', () => {
  const values = [
    ...Array.from({ length: 12 }, () => 2.0),
    ...Array.from({ length: 12 }, () => 8.0)
  ];
  const series = makeSeries('jump', values);
  const report = detectRegimeShifts(series, 'jump');
  const total = report.segments.reduce((s, seg) => s + seg.observationCount, 0);
  assert.equal(total, 24);
  // Segments should be contiguous
  for (let i = 1; i < report.segments.length; i++) {
    assert.equal(report.segments[i]!.startIndex, report.segments[i - 1]!.endIndex + 1);
  }
});

test('detectRegimeShifts: empty series handled', () => {
  const report = detectRegimeShifts([], 'missing');
  assert.equal(report.observationCount, 0);
  assert.equal(report.shifts.length, 0);
  assert.equal(report.segments.length, 0);
});
