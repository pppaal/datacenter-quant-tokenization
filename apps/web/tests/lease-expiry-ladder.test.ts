import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLeaseExpiryLadder } from '@/lib/valuation/lease-expiry-ladder';

test('lease expiry ladder aggregates expiry concentration and renewal assumptions', () => {
  const ladder = buildLeaseExpiryLadder([
    {
      id: 'lease_1',
      tenantName: 'Anchor Cloud',
      leasedKw: 5000,
      startYear: 1,
      termYears: 5,
      renewProbabilityPct: 70,
      rolloverDowntimeMonths: 2,
      renewalTermYears: 3,
      renewalCount: 2,
      markToMarketRatePerKwKrw: 210000,
      steps: []
    },
    {
      id: 'lease_2',
      tenantName: 'Inference Pod',
      leasedKw: 3000,
      startYear: 2,
      termYears: 4,
      renewProbabilityPct: 60,
      rolloverDowntimeMonths: 1,
      renewalTermYears: 2,
      renewalCount: 1,
      markToMarketRatePerKwKrw: 225000,
      steps: [
        {
          stepOrder: 1,
          startYear: 2,
          endYear: 5,
          leasedKw: 3200,
          renewProbabilityPct: 65,
          rolloverDowntimeMonths: 3,
          renewalTermYears: 4,
          renewalCount: 2,
          markToMarketRatePerKwKrw: 235000
        }
      ]
    }
  ] as any);

  assert.equal(ladder.totalContractedKw, 8200);
  assert.equal(ladder.nearTermExpiryKw, 8200);
  assert.equal(ladder.rows.length, 1);
  assert.equal(ladder.rows[0]?.expiryYear, 5);
  assert.equal(ladder.rows[0]?.expiringKw, 8200);
  assert.equal(ladder.rows[0]?.weightedRenewProbabilityPct, 68.04878048780488);
  assert.equal(ladder.rows[0]?.weightedRolloverDowntimeMonths, 2.3902439024390243);
  assert.equal(ladder.rows[0]?.weightedRenewalTermYears, 3.3902439024390243);
  assert.equal(ladder.rows[0]?.weightedRenewalCount, 2);
  assert.equal(ladder.rows[0]?.weightedMarkToMarketRatePerKwKrw, 219756.09756097562);
  assert.equal(ladder.rows[0]?.lastModeledRenewalEndYear, 13);
  assert.equal(ladder.details[1]?.lastModeledRenewalEndYear, 13);
});
