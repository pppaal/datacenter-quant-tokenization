import assert from 'node:assert/strict';
import test from 'node:test';
import { LeaseStatus, ReviewStatus } from '@prisma/client';
import { createAssetLease, deleteAssetLease, updateAssetLease } from '@/lib/services/lease-book';

test('lease book create normalizes currency and creates a new lease row', async () => {
  let capturedCreate: any;
  let promotedAssetId: string | null = null;

  const result = await createAssetLease(
    'asset_lease_1',
    {
      inputCurrency: 'USD',
      tenantName: 'US Cloud Co.',
      leaseStatus: LeaseStatus.SIGNED,
      leasedKw: 9000,
      termYears: 8,
      baseRatePerKwKrw: 150,
      markToMarketRatePerKwKrw: 165,
      renewalTermYears: 4,
      renewalRentFreeMonths: 2,
      renewalCount: 2,
      rentFreeMonths: 3,
      rolloverDowntimeMonths: 4,
      renewalTenantImprovementKrw: 18000,
      renewalLeasingCommissionKrw: 2200,
      tenantImprovementKrw: 100000,
      leasingCommissionKrw: 20000,
      recoverableOpexRatioPct: 55,
      fixedRecoveriesKrw: 15000,
      expenseStopKrwPerKwMonth: 8,
      utilityPassThroughPct: 67,
      fitOutCostKrw: 250000,
      steps: [
        {
          startYear: 1,
          endYear: 2,
          ratePerKwKrw: 140,
          leasedKw: 4000,
          occupancyPct: 85,
          rentFreeMonths: 1,
          renewProbabilityPct: 64,
          rolloverDowntimeMonths: 2,
          renewalTermYears: 3,
          renewalRentFreeMonths: 1,
          renewalCount: 3,
          markToMarketRatePerKwKrw: 155,
          renewalTenantImprovementKrw: 6400,
          renewalLeasingCommissionKrw: 950,
          tenantImprovementKrw: 12000,
          leasingCommissionKrw: 1800,
          recoverableOpexRatioPct: 62,
          fixedRecoveriesKrw: 9000,
          expenseStopKrwPerKwMonth: 6,
          utilityPassThroughPct: 73
        }
      ]
    },
    {
      db: {
        asset: {
          async findUnique() {
            return {
              id: 'asset_lease_1',
              market: 'US',
              address: { country: 'US' }
            };
          }
        },
        lease: {
          async create(args: any) {
            capturedCreate = args;
            return {
              id: 'lease_created',
              ...args.data,
              steps: []
            };
          }
        }
      } as any,
      promoter: async (assetId) => {
        promotedAssetId = assetId;
        return [];
      }
    }
  );

  assert.equal(capturedCreate.data.assetId, 'asset_lease_1');
  assert.equal(capturedCreate.data.reviewStatus, ReviewStatus.PENDING);
  assert.equal(capturedCreate.data.baseRatePerKwKrw, 202500);
  assert.equal(capturedCreate.data.markToMarketRatePerKwKrw, 222750);
  assert.equal(capturedCreate.data.renewalTermYears, 4);
  assert.equal(capturedCreate.data.renewalRentFreeMonths, 2);
  assert.equal(capturedCreate.data.renewalCount, 2);
  assert.equal(capturedCreate.data.rentFreeMonths, 3);
  assert.equal(capturedCreate.data.rolloverDowntimeMonths, 4);
  assert.equal(capturedCreate.data.renewalTenantImprovementKrw, 24300000);
  assert.equal(capturedCreate.data.renewalLeasingCommissionKrw, 2970000);
  assert.equal(capturedCreate.data.tenantImprovementKrw, 135000000);
  assert.equal(capturedCreate.data.leasingCommissionKrw, 27000000);
  assert.equal(capturedCreate.data.recoverableOpexRatioPct, 55);
  assert.equal(capturedCreate.data.fixedRecoveriesKrw, 20250000);
  assert.equal(capturedCreate.data.expenseStopKrwPerKwMonth, 10800);
  assert.equal(capturedCreate.data.utilityPassThroughPct, 67);
  assert.equal(capturedCreate.data.fitOutCostKrw, 337500000);
  assert.equal(capturedCreate.data.steps.create[0].ratePerKwKrw, 189000);
  assert.equal(capturedCreate.data.steps.create[0].rentFreeMonths, 1);
  assert.equal(capturedCreate.data.steps.create[0].renewProbabilityPct, 64);
  assert.equal(capturedCreate.data.steps.create[0].rolloverDowntimeMonths, 2);
  assert.equal(capturedCreate.data.steps.create[0].renewalTermYears, 3);
  assert.equal(capturedCreate.data.steps.create[0].renewalRentFreeMonths, 1);
  assert.equal(capturedCreate.data.steps.create[0].renewalCount, 3);
  assert.equal(capturedCreate.data.steps.create[0].markToMarketRatePerKwKrw, 209250);
  assert.equal(capturedCreate.data.steps.create[0].renewalTenantImprovementKrw, 8640000);
  assert.equal(capturedCreate.data.steps.create[0].renewalLeasingCommissionKrw, 1282500);
  assert.equal(capturedCreate.data.steps.create[0].tenantImprovementKrw, 16200000);
  assert.equal(capturedCreate.data.steps.create[0].leasingCommissionKrw, 2430000);
  assert.equal(capturedCreate.data.steps.create[0].recoverableOpexRatioPct, 62);
  assert.equal(capturedCreate.data.steps.create[0].fixedRecoveriesKrw, 12150000);
  assert.equal(capturedCreate.data.steps.create[0].expenseStopKrwPerKwMonth, 8100);
  assert.equal(capturedCreate.data.steps.create[0].utilityPassThroughPct, 73);
  assert.equal(capturedCreate.data.steps.create[0].stepOrder, 1);
  assert.equal(result.id, 'lease_created');
  assert.equal(promotedAssetId, 'asset_lease_1');
});

test('lease book update and delete enforce asset ownership and re-promote features', async () => {
  let capturedUpdate: any;
  let capturedDelete: any;
  const promoted: string[] = [];

  const db = {
    asset: {
      async findUnique() {
        return {
          id: 'asset_lease_2',
          market: 'KR',
          address: { country: 'KR' }
        };
      }
    },
    lease: {
      async findUnique(args: any) {
        if (args.where.id === 'lease_1') {
          return {
            id: 'lease_1',
            assetId: 'asset_lease_2',
            tenantName: 'Existing Tenant',
            status: LeaseStatus.PIPELINE,
            leasedKw: 5000,
            startYear: 1,
            termYears: 5,
            baseRatePerKwKrw: 180000,
            annualEscalationPct: 2,
            probabilityPct: 70,
            renewProbabilityPct: 45,
            downtimeMonths: 2,
            rolloverDowntimeMonths: 5,
            renewalRentFreeMonths: 1,
            renewalTermYears: 4,
            renewalCount: 1,
            rentFreeMonths: 1,
            markToMarketRatePerKwKrw: 215000,
            renewalTenantImprovementKrw: 150000000,
            renewalLeasingCommissionKrw: 18000000,
            tenantImprovementKrw: 700000000,
            leasingCommissionKrw: 120000000,
            recoverableOpexRatioPct: 35,
            fixedRecoveriesKrw: 45000000,
            expenseStopKrwPerKwMonth: 9000,
            utilityPassThroughPct: 28,
            fitOutCostKrw: 1200000000,
            notes: 'Existing'
          };
        }

        return null;
      },
      async update(args: any) {
        capturedUpdate = args;
        return { id: 'lease_1', ...args.data, steps: [] };
      },
      async delete(args: any) {
        capturedDelete = args;
        return { id: 'lease_1' };
      }
    }
  } as any;

  await updateAssetLease(
    'asset_lease_2',
    'lease_1',
    {
      tenantName: 'Updated Tenant',
      leaseStatus: LeaseStatus.ACTIVE,
      leasedKw: 6400,
      termYears: 7,
      baseRatePerKwKrw: 210000,
      markToMarketRatePerKwKrw: 228000,
      renewalTermYears: 5,
      renewalRentFreeMonths: 3,
      renewalCount: 2,
      rentFreeMonths: 2,
      rolloverDowntimeMonths: 3,
      renewalTenantImprovementKrw: 99000000,
      renewalLeasingCommissionKrw: 15000000,
      tenantImprovementKrw: 330000000,
      leasingCommissionKrw: 42000000,
      recoverableOpexRatioPct: 48,
      fixedRecoveriesKrw: 52000000,
      expenseStopKrwPerKwMonth: 12500,
      utilityPassThroughPct: 54,
      steps: [
        {
          startYear: 1,
          endYear: 3,
          ratePerKwKrw: 210000,
          leasedKw: 5200,
          annualEscalationPct: 2.5,
          rentFreeMonths: 2,
          renewProbabilityPct: 58,
          rolloverDowntimeMonths: 1,
          renewalTermYears: 4,
          renewalRentFreeMonths: 1,
          renewalCount: 2,
          markToMarketRatePerKwKrw: 219000,
          renewalTenantImprovementKrw: 110000000,
          renewalLeasingCommissionKrw: 14000000,
          tenantImprovementKrw: 210000000,
          leasingCommissionKrw: 33000000,
          recoverableOpexRatioPct: 44,
          fixedRecoveriesKrw: 38000000,
          expenseStopKrwPerKwMonth: 11000,
          utilityPassThroughPct: 46
        },
        {
          startYear: 4,
          endYear: 7,
          ratePerKwKrw: 225000,
          leasedKw: 6400,
          occupancyPct: 96,
          recoverableOpexRatioPct: 51,
          utilityPassThroughPct: 58
        }
      ]
    },
    {
      db,
      promoter: async (assetId) => {
        promoted.push(assetId);
        return [];
      }
    }
  );

  await deleteAssetLease('asset_lease_2', 'lease_1', {
    db,
    promoter: async (assetId) => {
      promoted.push(assetId);
      return [];
    }
  });

  assert.equal(capturedUpdate.where.id, 'lease_1');
  assert.equal(capturedUpdate.data.reviewStatus, ReviewStatus.PENDING);
  assert.equal(capturedUpdate.data.tenantName, 'Updated Tenant');
  assert.equal(capturedUpdate.data.status, LeaseStatus.ACTIVE);
  assert.equal(capturedUpdate.data.rentFreeMonths, 2);
  assert.equal(capturedUpdate.data.rolloverDowntimeMonths, 3);
  assert.equal(capturedUpdate.data.renewalTermYears, 5);
  assert.equal(capturedUpdate.data.renewalRentFreeMonths, 3);
  assert.equal(capturedUpdate.data.renewalCount, 2);
  assert.equal(capturedUpdate.data.markToMarketRatePerKwKrw, 228000);
  assert.equal(capturedUpdate.data.renewalTenantImprovementKrw, 99000000);
  assert.equal(capturedUpdate.data.renewalLeasingCommissionKrw, 15000000);
  assert.equal(capturedUpdate.data.tenantImprovementKrw, 330000000);
  assert.equal(capturedUpdate.data.leasingCommissionKrw, 42000000);
  assert.equal(capturedUpdate.data.recoverableOpexRatioPct, 48);
  assert.equal(capturedUpdate.data.fixedRecoveriesKrw, 52000000);
  assert.equal(capturedUpdate.data.expenseStopKrwPerKwMonth, 12500);
  assert.equal(capturedUpdate.data.utilityPassThroughPct, 54);
  assert.deepEqual(
    capturedUpdate.data.steps.create.map((step: any) => [
      step.stepOrder,
      step.startYear,
      step.endYear,
      step.rentFreeMonths ?? null,
      step.tenantImprovementKrw ?? null,
      step.leasingCommissionKrw ?? null,
      step.renewProbabilityPct ?? null,
      step.rolloverDowntimeMonths ?? null,
      step.renewalTermYears ?? null,
      step.renewalRentFreeMonths ?? null,
      step.renewalCount ?? null,
      step.markToMarketRatePerKwKrw ?? null,
      step.renewalTenantImprovementKrw ?? null,
      step.renewalLeasingCommissionKrw ?? null,
      step.utilityPassThroughPct ?? null
    ]),
    [
      [1, 1, 3, 2, 210000000, 33000000, 58, 1, 4, 1, 2, 219000, 110000000, 14000000, 46],
      [2, 4, 7, null, null, null, null, null, null, null, null, null, null, null, 58]
    ]
  );
  assert.equal(capturedDelete.where.id, 'lease_1');
  assert.deepEqual(promoted, ['asset_lease_2', 'asset_lease_2']);
});
