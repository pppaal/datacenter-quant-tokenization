import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_H3_RESOLUTION,
  toH3Cell,
  catchmentCells,
  binValuedPoints,
  summarizeCatchmentValues,
  distanceKm,
  buildSiteSpatialContext,
  type ValuedPoint
} from '@/lib/services/geo/h3-grid';

const APGUJEONG = { latitude: 37.527, longitude: 127.028 };
const YEOUIDO = { latitude: 37.521, longitude: 126.924 }; // ~9 km west

test('toH3Cell is deterministic and resolution-aware', () => {
  const cell = toH3Cell(APGUJEONG);
  assert.equal(typeof cell, 'string');
  assert.equal(cell, toH3Cell(APGUJEONG)); // stable
  // Coarser resolution → different (shorter-grain) cell.
  assert.notEqual(cell, toH3Cell(APGUJEONG, 7));
});

test('catchmentCells grows as the hex ring formula 3k(k+1)+1', () => {
  const c = toH3Cell(APGUJEONG);
  assert.equal(catchmentCells(c, 0).length, 1);
  assert.equal(catchmentCells(c, 1).length, 7); // 1 + 6
  assert.equal(catchmentCells(c, 2).length, 19); // 1 + 6 + 12
});

test('binValuedPoints aggregates points per cell', () => {
  const pts: ValuedPoint[] = [
    { ...APGUJEONG, value: 100 },
    { ...APGUJEONG, value: 200 }, // same cell as above
    { latitude: 37.6, longitude: 127.2, value: 50 } // far → different cell
  ];
  const bins = binValuedPoints(pts);
  const subjectCell = toH3Cell(APGUJEONG);
  const bin = bins.get(subjectCell)!;
  assert.equal(bin.count, 2);
  assert.equal(bin.mean, 150);
  assert.equal(bin.min, 100);
  assert.equal(bin.max, 200);
  assert.equal(bins.size, 2); // two distinct occupied cells
});

test('summarizeCatchmentValues includes near comps and excludes far ones', () => {
  const comps: ValuedPoint[] = [
    { latitude: 37.5275, longitude: 127.0285, value: 30_000_000 }, // ~tens of m
    { latitude: 37.528, longitude: 127.029, value: 32_000_000 }, // ~150 m
    { ...YEOUIDO, value: 18_000_000 } // ~9 km → outside a 2-ring catchment
  ];
  const summary = summarizeCatchmentValues(APGUJEONG, comps, 2);
  assert.equal(summary.count, 2, 'only the two nearby comps are in-catchment');
  assert.ok(summary.median !== null && summary.median >= 30_000_000);
  // Yeouido's cheap comp must not drag the catchment down.
  assert.ok(summary.min! >= 30_000_000);
  assert.ok(summary.weightedMean !== null);
});

test('summarizeCatchmentValues returns nulls when no comps land in the catchment', () => {
  const summary = summarizeCatchmentValues(APGUJEONG, [{ ...YEOUIDO, value: 1 }], 2);
  assert.equal(summary.count, 0);
  assert.equal(summary.median, null);
  assert.equal(summary.weightedMean, null);
});

test('distanceKm is sane (Apgujeong↔Yeouido ≈ 9 km)', () => {
  const d = distanceKm(APGUJEONG, YEOUIDO);
  assert.ok(d > 7 && d < 12, `expected ~9km, got ${d}`);
});

test('buildSiteSpatialContext assembles cell + catchment comps + scalar signals', () => {
  const ctx = buildSiteSpatialContext({
    subject: APGUJEONG,
    comps: [
      { latitude: 37.5275, longitude: 127.0285, value: 30_000_000 },
      { ...YEOUIDO, value: 18_000_000 }
    ],
    signals: { amenityScore: 78, hazardScore: 22, carbonIntensityGco2PerKwh: 430 },
    rings: 2
  });
  assert.equal(ctx.cell, toH3Cell(APGUJEONG));
  assert.equal(ctx.resolution, DEFAULT_H3_RESOLUTION);
  assert.equal(ctx.catchmentCellCount, 19);
  assert.equal(ctx.comps.count, 1); // Yeouido excluded
  assert.equal(ctx.signals.amenityScore, 78);
  assert.equal(ctx.signals.hazardScore, 22);
  assert.ok(Math.abs(ctx.centroid.latitude - APGUJEONG.latitude) < 0.01);
});
