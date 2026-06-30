import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assessKoreaCapitalFeasibility,
  DEFAULT_KR_PROFILE,
  KR_PROFILE_CAVEAT,
  type KoreaRegulatoryProfile
} from '@/lib/services/feasibility/korea-capital';

const near = (a: number | null, b: number, eps = 1e-6) => a != null && Math.abs(a - b) < eps;

test('feasible deal: 70% LTV, 30% equity, no offering → feasible, no flags', () => {
  const r = assessKoreaCapitalFeasibility({
    assetValueKrw: 1000,
    proposedDebtKrw: 700,
    sponsorEquityKrw: 300
  });
  assert.ok(near(r.ltvPct, 70));
  assert.ok(near(r.equityPct, 30));
  assert.equal(r.ltvOk, true);
  assert.equal(r.equityOk, true);
  assert.equal(r.retentionOk, null); // no offering → retention not applicable
  assert.equal(r.feasible, true);
  assert.deepEqual(r.flags, []);
  assert.equal(r.profileLabel, DEFAULT_KR_PROFILE.label);
  assert.equal(r.caveat, KR_PROFILE_CAVEAT);
});

test('LTV breach: 90% debt exceeds the 80% cap → not feasible, debt-headroom negative', () => {
  const r = assessKoreaCapitalFeasibility({
    assetValueKrw: 1000,
    proposedDebtKrw: 900,
    sponsorEquityKrw: 300
  });
  assert.ok(near(r.ltvPct, 90));
  assert.equal(r.ltvOk, false);
  assert.equal(r.maxDebtKrw, 800);
  assert.equal(r.debtHeadroomKrw, -100); // over-levered by 100
  assert.equal(r.feasible, false);
  assert.ok(r.flags.some((f) => f.includes('LTV')));
});

test('equity shortfall: 10% equity below the 20% minimum → flag + shortfall amount', () => {
  const r = assessKoreaCapitalFeasibility({
    assetValueKrw: 1000,
    proposedDebtKrw: 700,
    sponsorEquityKrw: 100
  });
  assert.ok(near(r.equityPct, 10));
  assert.equal(r.equityOk, false);
  assert.equal(r.requiredMinEquityKrw, 200);
  assert.equal(r.equityShortfallKrw, 100); // needs 200, has 100
  assert.equal(r.feasible, false);
  assert.ok(r.flags.some((f) => f.includes('Equity')));
});

test('risk retention: offering present but sponsor equity below the 5% retention → not feasible', () => {
  const r = assessKoreaCapitalFeasibility({
    assetValueKrw: 10000,
    proposedDebtKrw: 7000,
    sponsorEquityKrw: 100, // 1% equity — also fails the equity floor
    tokenizedOfferingKrw: 5000
  });
  assert.equal(r.retentionRequiredKrw, 250); // 5% of 5000
  assert.equal(r.retentionOk, false); // 100 < 250
  assert.equal(r.feasible, false);
  assert.ok(r.flags.some((f) => f.includes('risk-retention')));
});

test('risk retention satisfied: sponsor equity covers the retained piece', () => {
  const r = assessKoreaCapitalFeasibility({
    assetValueKrw: 10000,
    proposedDebtKrw: 7000,
    sponsorEquityKrw: 3000, // 30% equity, well above the 250 retention
    tokenizedOfferingKrw: 5000
  });
  assert.equal(r.retentionRequiredKrw, 250);
  assert.equal(r.retentionOk, true);
  assert.equal(r.feasible, true);
  assert.deepEqual(r.flags, []);
});

test('zero asset value is guarded: null ratios, not feasible, explicit flag', () => {
  const r = assessKoreaCapitalFeasibility({
    assetValueKrw: 0,
    proposedDebtKrw: 0,
    sponsorEquityKrw: 0
  });
  assert.equal(r.ltvPct, null);
  assert.equal(r.equityPct, null);
  assert.equal(r.feasible, false);
  assert.ok(r.flags.some((f) => f.includes('positive')));
});

test('profile override: a stricter counsel-confirmed profile changes the verdict', () => {
  const strict: KoreaRegulatoryProfile = {
    label: 'Counsel-confirmed 2026',
    minEquityPct: 35,
    maxLtvPct: 65,
    riskRetentionPct: 10
  };
  // 70% LTV / 30% equity passes the default profile but fails the strict one.
  const r = assessKoreaCapitalFeasibility(
    { assetValueKrw: 1000, proposedDebtKrw: 700, sponsorEquityKrw: 300 },
    strict
  );
  assert.equal(r.profileLabel, 'Counsel-confirmed 2026');
  assert.equal(r.ltvOk, false); // 70 > 65
  assert.equal(r.equityOk, false); // 30 < 35
  assert.equal(r.maxDebtKrw, 650);
  assert.equal(r.feasible, false);
});
