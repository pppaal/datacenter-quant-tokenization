import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetStage } from '@prisma/client';
import {
  createComparableEntry,
  deleteComparableEntry,
  updateComparableEntry
} from '@/lib/services/comparable-book';

test('comparable book create normalizes currency and upserts comparable set metadata', async () => {
  let capturedSetUpsert: any;
  let capturedEntryCreate: any;

  const result = await createComparableEntry(
    'asset_comp_1',
    {
      inputCurrency: 'USD',
      setName: 'US office screening set',
      label: 'Peer 1',
      location: 'Manhattan',
      assetType: 'Office',
      stage: AssetStage.STABILIZED,
      valuationKrw: 125000000,
      monthlyRatePerKwKrw: 180,
      capRatePct: 5.9,
      weightPct: 0.55
    },
    {
      db: {
        asset: {
          async findUnique() {
            return {
              id: 'asset_comp_1',
              name: 'Manhattan Office Tower',
              assetType: 'Office',
              market: 'US',
              address: { country: 'US' },
              comparableSet: null
            };
          }
        },
        comparableSet: {
          async upsert(args: any) {
            capturedSetUpsert = args;
            return { id: 'comp_set_1', assetId: 'asset_comp_1' };
          }
        },
        comparableEntry: {
          async create(args: any) {
            capturedEntryCreate = args;
            return { id: 'comp_entry_1', ...args.data };
          }
        }
      } as any
    }
  );

  assert.equal(capturedSetUpsert.create.name, 'US office screening set');
  assert.equal(capturedEntryCreate.data.comparableSetId, 'comp_set_1');
  assert.equal(capturedEntryCreate.data.valuationKrw, 168750000000);
  assert.equal(capturedEntryCreate.data.monthlyRatePerKwKrw, 243000);
  assert.equal(result.id, 'comp_entry_1');
});

test('comparable book update and delete enforce asset ownership', async () => {
  let capturedUpdate: any;
  let capturedDelete: any;

  const db = {
    asset: {
      async findUnique() {
        return {
          id: 'asset_comp_2',
          name: 'Seoul Data Center',
          assetType: 'Data Center',
          market: 'KR',
          address: { country: 'KR' },
          comparableSet: {
            id: 'comp_set_2',
            assetId: 'asset_comp_2',
            name: 'Existing set',
            notes: null
          }
        };
      }
    },
    comparableSet: {
      async upsert() {
        return { id: 'comp_set_2', assetId: 'asset_comp_2' };
      }
    },
    comparableEntry: {
      async findUnique() {
        return {
          id: 'entry_1',
          label: 'Peer A',
          location: 'Seoul',
          assetType: 'Data Center',
          stage: AssetStage.LIVE,
          sourceLink: null,
          powerCapacityMw: 14,
          grossFloorAreaSqm: 36000,
          occupancyPct: 82,
          valuationKrw: 140000000000,
          pricePerMwKrw: null,
          monthlyRatePerKwKrw: 198000,
          capRatePct: 6.1,
          discountRatePct: 9.2,
          weightPct: 0.5,
          notes: null,
          comparableSet: {
            id: 'comp_set_2',
            assetId: 'asset_comp_2'
          }
        };
      },
      async update(args: any) {
        capturedUpdate = args;
        return { id: 'entry_1', ...args.data };
      },
      async delete(args: any) {
        capturedDelete = args;
        return { id: 'entry_1' };
      }
    }
  } as any;

  await updateComparableEntry(
    'asset_comp_2',
    'entry_1',
    {
      setName: 'Refreshed set',
      label: 'Peer A refreshed',
      location: 'Incheon',
      assetType: 'Data Center',
      capRatePct: 6.4
    },
    { db }
  );

  await deleteComparableEntry('asset_comp_2', 'entry_1', { db });

  assert.equal(capturedUpdate.where.id, 'entry_1');
  assert.equal(capturedUpdate.data.label, 'Peer A refreshed');
  assert.equal(capturedUpdate.data.location, 'Incheon');
  assert.equal(capturedUpdate.data.capRatePct, 6.4);
  assert.equal(capturedDelete.where.id, 'entry_1');
});
