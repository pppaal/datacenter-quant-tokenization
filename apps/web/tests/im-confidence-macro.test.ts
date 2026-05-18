import assert from 'node:assert/strict';
import test from 'node:test';
import { buildConfidenceBreakdown } from '@/lib/services/im/confidence';
import { readMacroGuidance } from '@/lib/services/im/macro-guidance';

test('buildConfidenceBreakdown flags present signals + counts coverage', () => {
  const result = buildConfidenceBreakdown(
    {
      siteProfile: { floodRiskScore: 0.4, wildfireRiskScore: 0 },
      buildingSnapshot: {},
      marketSnapshot: {},
      taxAssumption: {},
      spvStructure: {},
      capexLineItems: [{ id: 'x' }],
      leases: [{ id: 'l1' }, { id: 'l2' }],
      debtFacilities: [{ id: 'd1' }],
      address: { latitude: 37.5, longitude: 127 },
      purchasePriceKrw: 100_000_000,
      stabilizedOccupancyPct: 80
    },
    8.1
  );
  assert.equal(result.finalScore, 8.1);
  // 5 external (3 present), 6 structured (5 present), 3 anchors (3 present)
  // totalCount sums all `add`-direction signals = 5 + 6 + 3 = 14
  assert.equal(result.totalCount, 14);
  assert.ok(result.presentCount >= 10);
  // flood penalty signal exists
  const flood = result.signals.find((s) => s.label.startsWith('Flood risk'));
  assert.ok(flood);
  assert.equal(flood?.direction, 'subtract');
  assert.equal(flood?.present, true);
});

test('buildConfidenceBreakdown handles empty bundle', () => {
  const result = buildConfidenceBreakdown({}, 4.5);
  assert.equal(result.presentCount, 0);
  assert.equal(result.signals.find((s) => s.label === 'Site profile')?.present, false);
});

test('readMacroGuidance parses stringified JSON value', () => {
  const guidance = readMacroGuidance([
    {
      field: 'macro.guidance',
      sourceSystem: 'macro-regime-engine',
      freshnessLabel:
        'Asset weighting: capital 1.2x, liquidity 0.96x, leasing 0.95x, construction 1.37x.',
      value: JSON.stringify({
        discountRateShiftPct: 0.54,
        exitCapRateShiftPct: 0.48,
        debtCostShiftPct: 0.66,
        occupancyShiftPct: -4.75,
        growthShiftPct: -0.33,
        replacementCostShiftPct: 10.96,
        summary: ['line A', 'line B']
      })
    },
    { field: 'address', sourceSystem: 'manual-intake', value: '...' }
  ]);
  assert.ok(guidance);
  assert.equal(guidance!.shifts.discountRateShiftPct, 0.54);
  assert.equal(guidance!.shifts.occupancyShiftPct, -4.75);
  assert.equal(guidance!.shifts.replacementCostShiftPct, 10.96);
  assert.deepEqual(guidance!.summary, ['line A', 'line B']);
  assert.ok(guidance!.weightLine.startsWith('Asset weighting'));
});

test('readMacroGuidance accepts object value', () => {
  const guidance = readMacroGuidance([
    {
      field: 'macro.guidance',
      value: { discountRateShiftPct: 0.5, summary: ['x'] }
    }
  ]);
  assert.ok(guidance);
  assert.equal(guidance!.shifts.discountRateShiftPct, 0.5);
  assert.equal(guidance!.shifts.exitCapRateShiftPct, null);
});

test('readMacroGuidance returns null on missing entry', () => {
  assert.equal(readMacroGuidance([{ field: 'address', value: 'x' }]), null);
  assert.equal(readMacroGuidance([]), null);
  assert.equal(readMacroGuidance(null), null);
});

test('readMacroGuidance returns null on malformed JSON string', () => {
  assert.equal(
    readMacroGuidance([{ field: 'macro.guidance', value: 'not-json{' }]),
    null
  );
});
