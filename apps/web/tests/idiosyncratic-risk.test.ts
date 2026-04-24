import assert from 'node:assert/strict';
import test from 'node:test';
import { computeIdiosyncraticRisk } from '@/lib/services/valuation/idiosyncratic-risk';

const Y = 2026;

test('clean asset → LOW band, benign summary', () => {
  const r = computeIdiosyncraticRisk({
    asOfYear: Y,
    rentRoll: [
      { tenantName: 'A', annualRentKrw: 1e9, leaseEndYear: Y + 8, creditGrade: 'AA' },
      { tenantName: 'B', annualRentKrw: 1e9, leaseEndYear: Y + 7, creditGrade: 'A' },
      { tenantName: 'C', annualRentKrw: 1e9, leaseEndYear: Y + 6, creditGrade: 'A' },
      { tenantName: 'D', annualRentKrw: 1e9, leaseEndYear: Y + 9, creditGrade: 'BBB' },
      { tenantName: 'E', annualRentKrw: 1e9, leaseEndYear: Y + 10, creditGrade: 'A' }
    ],
    buildingValueKrw: 100e9,
    deferredCapexKrw: 0.5e9, // 0.5%
    buildingAgeYears: 8,
    soilContaminationFlag: false,
    asbestosFlag: false,
    floodZoneFlag: false,
    zoningChangeRisk: 'NONE',
    redevelopmentFreezeFlag: false,
    pendingLitigationFlag: false,
    titleEncumbranceFlag: false
  });

  assert.equal(r.band, 'LOW');
  assert.ok(r.overallScore < 35, `expected <35, got ${r.overallScore}`);
  assert.ok(r.factors.length >= 6);
});

test('single-tenant + sub-IG + heavy rollover → HIGH/CRITICAL band', () => {
  const r = computeIdiosyncraticRisk({
    asOfYear: Y,
    rentRoll: [
      { tenantName: 'WeakCo', annualRentKrw: 9e9, leaseEndYear: Y + 1, creditGrade: 'B' },
      { tenantName: 'TinyCo', annualRentKrw: 1e9, leaseEndYear: Y + 2, creditGrade: 'BB' }
    ],
    buildingValueKrw: 50e9,
    deferredCapexKrw: 5e9, // 10%
    buildingAgeYears: 45
  });

  const tc = r.factors.find((f) => f.key === 'tenant_concentration')!;
  assert.ok(tc.score >= 75, `tenant_concentration expected ≥75, got ${tc.score}`);

  const lr = r.factors.find((f) => f.key === 'lease_rollover')!;
  assert.ok(lr.score >= 70, `lease_rollover expected ≥70, got ${lr.score}`);

  const cb = r.factors.find((f) => f.key === 'capex_backlog')!;
  assert.ok(cb.score >= 75, `capex_backlog expected ≥75, got ${cb.score}`);

  assert.ok(r.band === 'HIGH' || r.band === 'CRITICAL', `expected HIGH/CRITICAL, got ${r.band}`);
  assert.ok(r.topRisks.length === 3);
  assert.ok(r.topRisks[0]!.score >= r.topRisks[1]!.score);
});

test('environmental flags trigger high score with recommendation', () => {
  const r = computeIdiosyncraticRisk({
    asOfYear: Y,
    soilContaminationFlag: true,
    asbestosFlag: true
  });
  const env = r.factors.find((f) => f.key === 'environmental')!;
  assert.equal(env.severity, 'CRITICAL');
  assert.ok(env.recommendation && env.recommendation.includes('Phase II'));
});

test('missing inputs → no factor, weighted score normalizes over present factors only', () => {
  const r = computeIdiosyncraticRisk({
    asOfYear: Y,
    buildingAgeYears: 50 // only this one input
  });
  assert.equal(r.factors.length, 1);
  assert.equal(r.factors[0]!.key, 'building_age');
  // Score should reflect just the building-age factor, not be diluted by absent factors.
  assert.ok(r.overallScore >= 60, `expected ≥60 from age=50, got ${r.overallScore}`);
});

test('continuous scoring: small input change → small score change (no cliffs)', () => {
  const base = computeIdiosyncraticRisk({
    asOfYear: Y,
    buildingValueKrw: 100e9,
    deferredCapexKrw: 4.99e9 // 4.99%
  });
  const bump = computeIdiosyncraticRisk({
    asOfYear: Y,
    buildingValueKrw: 100e9,
    deferredCapexKrw: 5.01e9 // 5.01%
  });
  const baseScore = base.factors.find((f) => f.key === 'capex_backlog')!.score;
  const bumpScore = bump.factors.find((f) => f.key === 'capex_backlog')!.score;
  assert.ok(Math.abs(bumpScore - baseScore) < 1, `expected smooth, got jump ${baseScore}→${bumpScore}`);
});
