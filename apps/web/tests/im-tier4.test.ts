import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEmissionsBreakdown } from '@/lib/services/im/esg';
import { buildInsuranceSummary } from '@/lib/services/im/insurance';
import { buildPeerComparison, pickSectorKey } from '@/lib/services/im/peer-benchmarks';

// ---- Peer expansion ----

test('pickSectorKey routes all asset classes', () => {
  assert.equal(pickSectorKey('DATA_CENTER', 'KR'), 'KR_DATA_CENTER');
  assert.equal(pickSectorKey('OFFICE', 'KR'), 'KR_OFFICE');
  assert.equal(pickSectorKey('INDUSTRIAL', 'KR'), 'KR_INDUSTRIAL');
  assert.equal(pickSectorKey('RETAIL', 'KR'), 'KR_RETAIL');
  assert.equal(pickSectorKey('LAND', 'KR'), 'KR_DATA_CENTER'); // default fallback
});

test('buildPeerComparison covers all 8 ratios in the office set', () => {
  const r = buildPeerComparison(
    { leverage: 4.0, ebitdaMargin: 50, roeProxy: 0.20 },
    'KR_OFFICE'
  );
  assert.equal(r.comparisons.length, 8);
  assert.match(r.sectorLabel, /office/);
});

test('buildPeerComparison covers retail set', () => {
  const r = buildPeerComparison({ leverage: 4.5 }, 'KR_RETAIL');
  assert.equal(r.comparisons.length, 8);
  assert.match(r.sectorLabel, /retail/);
});

test('buildPeerComparison covers industrial set', () => {
  const r = buildPeerComparison({ leverage: 3.5 }, 'KR_INDUSTRIAL');
  assert.equal(r.comparisons.length, 8);
  assert.match(r.sectorLabel, /industrial/);
});

// ---- ESG emissions ----

test('buildEmissionsBreakdown computes Scope 1/2/3 from inputs', () => {
  const e = buildEmissionsBreakdown({
    powerCapacityMw: 32,
    pueTarget: 1.31,
    renewableSharePct: 32,
    backupFuelHours: 48,
    totalCapexKrw: 246_000_000_000,
    holdYears: 10
  });
  assert.ok(e.scope1tCO2e !== null);
  assert.ok(e.scope2tCO2e !== null);
  assert.ok(e.scope3tCO2e !== null);
  assert.ok(e.totalAnnualtCO2e !== null);
  assert.ok(e.notes.length >= 3);
  // Scope 2 should dominate for a hyperscale DC
  assert.ok(e.scope2tCO2e! > e.scope1tCO2e!);
});

test('buildEmissionsBreakdown handles missing inputs', () => {
  const e = buildEmissionsBreakdown({
    powerCapacityMw: null,
    pueTarget: null,
    renewableSharePct: null,
    backupFuelHours: null,
    totalCapexKrw: null
  });
  assert.equal(e.scope1tCO2e, null);
  assert.equal(e.scope2tCO2e, null);
  assert.equal(e.scope3tCO2e, null);
  assert.equal(e.totalAnnualtCO2e, null);
});

test('buildEmissionsBreakdown renewable share reduces Scope 2 linearly', () => {
  const a = buildEmissionsBreakdown({
    powerCapacityMw: 32,
    pueTarget: 1.31,
    renewableSharePct: 0,
    backupFuelHours: null,
    totalCapexKrw: null
  });
  const b = buildEmissionsBreakdown({
    powerCapacityMw: 32,
    pueTarget: 1.31,
    renewableSharePct: 50,
    backupFuelHours: null,
    totalCapexKrw: null
  });
  // 50% renewable should ~halve Scope 2
  assert.ok(b.scope2tCO2e! < a.scope2tCO2e!);
  assert.ok(Math.abs(b.scope2tCO2e! / a.scope2tCO2e! - 0.5) < 0.01);
});

// ---- Insurance ----

test('buildInsuranceSummary aggregates coverage + premium + flags expiring policies', () => {
  const now = new Date('2026-04-30T00:00:00Z');
  const summary = buildInsuranceSummary(
    [
      {
        policyType: 'PROPERTY',
        insurer: 'Samsung F&M',
        coverageKrw: 280_000_000_000,
        premiumKrw: 980_000_000,
        deductibleKrw: 500_000_000,
        status: 'ACTIVE',
        effectiveFrom: new Date('2026-01-01'),
        expiresOn: new Date('2027-01-01')
      },
      {
        policyType: 'BI',
        insurer: 'Samsung F&M',
        coverageKrw: 60_000_000_000,
        premiumKrw: 320_000_000,
        deductibleKrw: 0,
        status: 'ACTIVE',
        effectiveFrom: new Date('2026-01-01'),
        expiresOn: new Date('2026-06-01') // expiring within 90 days
      }
    ],
    now
  );
  assert.ok(summary);
  assert.equal(summary!.totalCoverageKrw, 340_000_000_000);
  assert.equal(summary!.totalPremiumKrw, 1_300_000_000);
  assert.equal(summary!.expiringSoonCount, 1);
  assert.equal(summary!.tilesByType.length, 2);
  assert.equal(summary!.tilesByType.find((t) => t.policyType === 'BI')?.status, 'EXPIRING');
});

test('buildInsuranceSummary returns null on empty policies', () => {
  assert.equal(buildInsuranceSummary([]), null);
});
