import assert from 'node:assert/strict';
import test from 'node:test';
import { projectRentRoll, synthesizeRentRoll, type RentRollTenant } from '@/lib/services/valuation/rent-roll';

const baseTenant: RentRollTenant = {
  tenantId: 't1',
  name: 'Tenant 1',
  gfaSqm: 1000,
  currentRentPerSqmMonthly: 50_000,
  leaseExpiryYear: 5,
  rentBumpPct: 3,
  renewalProbabilityPct: 80,
  markToMarketGapPct: 5,
  downtimeMonths: 6,
  freeRentMonths: 3,
  tiPerSqmNew: 500_000,
  tiPerSqmRenewal: 200_000,
  leasingCommissionPct: 10
};

test('in-place lease produces stable rent with annual bumps', () => {
  const result = projectRentRoll([baseTenant], 3);
  assert.equal(result.years.length, 3);
  // Year 1: bumped once → 50_000 × 1.03 × 1000 × 12 = 618_000_000
  assert.equal(result.years[0]!.totalRentKrw, 618_000_000);
  // Year 2: bumped twice → 50_000 × 1.03² × 1000 × 12
  assert.ok(result.years[1]!.totalRentKrw > result.years[0]!.totalRentKrw);
});

test('lease expiry + non-renewal creates downtime year', () => {
  // Force non-renewal: 0% probability
  const tenant = { ...baseTenant, leaseExpiryYear: 2, renewalProbabilityPct: 0, downtimeMonths: 6 };
  const result = projectRentRoll([tenant], 4);
  // Year 2: lease expires, 6mo downtime, 3mo free rent → only 3mo paid rent
  assert.equal(result.years[1]!.tenants[0]!.state, 'NEW_LEASE');
  // Year 2 rent should be < Year 1 rent (we only get 3 months)
  assert.ok(result.years[1]!.totalRentKrw < result.years[0]!.totalRentKrw);
  assert.ok(result.years[1]!.totalTiLcKrw > 0);
});

test('TI/LC fires at lease roll, not in stable years', () => {
  const tenant = { ...baseTenant, leaseExpiryYear: 3 };
  const result = projectRentRoll([tenant], 5);
  assert.equal(result.years[0]!.totalTiLcKrw, 0);
  assert.equal(result.years[1]!.totalTiLcKrw, 0);
  assert.ok(result.years[2]!.totalTiLcKrw > 0);
  assert.equal(result.years[3]!.totalTiLcKrw, 0);
});

test('synthesizeRentRoll splits building across 3 tenants totaling GFA', () => {
  const tenants = synthesizeRentRoll({
    totalGfaSqm: 10_000,
    year1NoiKrw: 5_000_000_000,
    opexRatio: 0.25,
    averageRentPerSqmMonthly: 55_000
  });
  assert.equal(tenants.length, 3);
  const totalGfa = tenants.reduce((s, t) => s + t.gfaSqm, 0);
  assert.equal(totalGfa, 10_000);
  // Staggered expiries
  const expiries = tenants.map((t) => t.leaseExpiryYear);
  assert.deepEqual([...expiries].sort(), [2, 4, 7]);
});

test('multi-tenant rent roll tracks worst-occupancy year', () => {
  // All tenants expire year 3 with 0% renewal → heavy downtime cluster
  const tenants: RentRollTenant[] = [
    { ...baseTenant, tenantId: 'a', leaseExpiryYear: 3, renewalProbabilityPct: 0 },
    { ...baseTenant, tenantId: 'b', leaseExpiryYear: 3, renewalProbabilityPct: 0 },
    { ...baseTenant, tenantId: 'c', leaseExpiryYear: 3, renewalProbabilityPct: 0 }
  ];
  const result = projectRentRoll(tenants, 5);
  // Downtime kicks in the year AFTER expiry (6mo) — that's the trough.
  assert.equal(result.worstYearNumber, 4);
  assert.ok(result.worstYearOccupancyPct < 80);
});

test('deterministic renewal outcome across re-runs', () => {
  const tenant = { ...baseTenant, renewalProbabilityPct: 50 };
  const first = projectRentRoll([tenant], 10);
  const second = projectRentRoll([tenant], 10);
  // Identical series → identical outcome path
  assert.deepEqual(
    first.years.map((y) => y.tenants[0]!.state),
    second.years.map((y) => y.tenants[0]!.state)
  );
});
