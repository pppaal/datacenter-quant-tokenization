import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLeaseRolloverDrilldown } from '@/lib/valuation/lease-rollover-drilldown';

test('lease rollover drilldown expands renewal downtime, rent-free, and return month events', () => {
  const drilldown = buildLeaseRolloverDrilldown([
    {
      id: 'lease_1',
      tenantName: 'Anchor Cloud',
      leasedKw: 5000,
      startYear: 1,
      termYears: 5,
      renewProbabilityPct: 70,
      rolloverDowntimeMonths: 2,
      renewalRentFreeMonths: 1,
      renewalTermYears: 3,
      renewalCount: 2,
      markToMarketRatePerKwKrw: 210000,
      renewalTenantImprovementKrw: 100000000,
      renewalLeasingCommissionKrw: 15000000,
      steps: []
    },
    {
      id: 'lease_2',
      tenantName: 'Inference Pod',
      leasedKw: 3200,
      startYear: 2,
      termYears: 4,
      renewProbabilityPct: 65,
      rolloverDowntimeMonths: 1,
      renewalRentFreeMonths: 2,
      renewalTermYears: 4,
      renewalCount: 1,
      markToMarketRatePerKwKrw: 235000,
      renewalTenantImprovementKrw: 85000000,
      renewalLeasingCommissionKrw: 9000000,
      steps: []
    }
  ] as any);

  assert.equal(drilldown.firstModeledMonthIndex, 61);
  assert.equal(drilldown.windowMonths, 24);
  assert.equal(drilldown.peakDowntimeKw, 8200);
  assert.equal(drilldown.peakRentFreeKw, 8200);
  assert.equal(drilldown.totalRenewalCapitalKrw, 209000000);
  assert.equal(drilldown.rows[0]?.periodLabel, 'Y6 M1');
  assert.equal(drilldown.rows[0]?.downtimeKw, 8200);
  assert.equal(drilldown.rows[1]?.periodLabel, 'Y6 M2');
  assert.equal(drilldown.rows[1]?.downtimeKw, 5000);
  assert.equal(drilldown.rows[1]?.rentFreeKw, 3200);
  assert.equal(drilldown.rows[2]?.periodLabel, 'Y6 M3');
  assert.equal(drilldown.rows[2]?.rentFreeKw, 8200);
  assert.equal(drilldown.rows[2]?.returningKw, 0);
  assert.equal(drilldown.rows[2]?.tenantCapitalCostKrw, 0);
  assert.equal(drilldown.rows[2]?.weightedMarkToMarketRatePerKwKrw, null);
  assert.equal(drilldown.rows[3]?.periodLabel, 'Y6 M4');
  assert.equal(drilldown.rows[3]?.returningKw, 8200);
  assert.equal(drilldown.rows[3]?.tenantCapitalCostKrw, 209000000);
  assert.equal(drilldown.rows[3]?.weightedMarkToMarketRatePerKwKrw, 219756.0975609756);
  assert.equal(drilldown.rows.length, 4);
});
