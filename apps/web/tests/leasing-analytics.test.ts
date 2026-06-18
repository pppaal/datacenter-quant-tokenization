import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLeasingAnalytics } from '@/lib/services/valuation/leasing-analytics';

const leases = [
  {
    id: 'lease_1',
    tenantName: 'Anchor Cloud',
    leasedKw: 5000,
    baseRatePerKwKrw: 200000,
    startYear: 1,
    termYears: 5,
    markToMarketRatePerKwKrw: 220000,
    steps: []
  },
  {
    id: 'lease_2',
    tenantName: 'Inference Pod',
    leasedKw: 3000,
    baseRatePerKwKrw: 200000,
    startYear: 2,
    termYears: 4,
    markToMarketRatePerKwKrw: 220000,
    steps: []
  }
] as never[];

test('leasing analytics computes income, WALT, and concentration', () => {
  const a = buildLeasingAnalytics(leases);

  // 5000*200000*12 = 12,000,000,000 ; 3000*200000*12 = 7,200,000,000
  assert.equal(a.inPlaceAnnualIncomeKrw, 19_200_000_000);
  assert.equal(a.totalContractedKw, 8000);
  assert.equal(a.tenantCount, 2);

  // WALT (income) = (5*12.0 + 4*7.2) / 19.2 = 4.625
  assert.ok(a.waltByIncomeYears != null && Math.abs(a.waltByIncomeYears - 4.625) < 1e-9);
  // WALT (area) = (5*5000 + 4*3000) / 8000 = 4.625
  assert.ok(a.waltByAreaYears != null && Math.abs(a.waltByAreaYears - 4.625) < 1e-9);

  // Top tenant 12.0 / 19.2 = 62.5%
  assert.ok(a.topTenantSharePct != null && Math.abs(a.topTenantSharePct - 62.5) < 1e-9);
  assert.ok(a.topThreeSharePct != null && Math.abs(a.topThreeSharePct - 100) < 1e-9);
  // HHI = 0.625^2 + 0.375^2 = 0.53125 → single-tenant risk band
  assert.ok(a.herfindahlIndex != null && Math.abs(a.herfindahlIndex - 0.53125) < 1e-9);
  assert.equal(a.diversificationLabel, 'Single-tenant risk');

  // Both leases expire at Y5 → 100% within near-term window
  assert.ok(
    a.nearTermRolloverSharePct != null && Math.abs(a.nearTermRolloverSharePct - 100) < 1e-9
  );
  assert.equal(a.latestExpiryYear, 5);

  // In-place weighted rate = income / (kW*12) = 19.2e9 / (8000*12) = 200,000
  assert.ok(
    a.inPlaceWeightedRatePerKwKrw != null && Math.abs(a.inPlaceWeightedRatePerKwKrw - 200000) < 1e-6
  );
});

test('leasing analytics is empty-safe', () => {
  const a = buildLeasingAnalytics([]);
  assert.equal(a.tenantCount, 0);
  assert.equal(a.inPlaceAnnualIncomeKrw, 0);
  assert.equal(a.waltByIncomeYears, null);
  assert.equal(a.diversificationLabel, null);
});
