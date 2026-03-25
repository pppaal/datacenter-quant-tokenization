import assert from 'node:assert/strict';
import test from 'node:test';
import { CapexCategory } from '@prisma/client';
import {
  createCapexLineItem,
  deleteCapexLineItem,
  updateCapexLineItem
} from '@/lib/services/capex-book';

test('capex book create normalizes currency and creates a new line item', async () => {
  let capturedCreate: any;

  const result = await createCapexLineItem(
    'asset_capex_1',
    {
      inputCurrency: 'USD',
      category: CapexCategory.ELECTRICAL,
      label: 'Switchgear package',
      amountKrw: 12000000,
      spendYear: 1,
      isEmbedded: false
    },
    {
      db: {
        asset: {
          async findUnique() {
            return {
              id: 'asset_capex_1',
              market: 'US',
              address: { country: 'US' }
            };
          }
        },
        capexLineItem: {
          async create(args: any) {
            capturedCreate = args;
            return { id: 'capex_1', ...args.data };
          }
        }
      } as any
    }
  );

  assert.equal(capturedCreate.data.assetId, 'asset_capex_1');
  assert.equal(capturedCreate.data.amountKrw, 16200000000);
  assert.equal(capturedCreate.data.category, CapexCategory.ELECTRICAL);
  assert.equal(result.id, 'capex_1');
});

test('capex book update and delete enforce asset ownership', async () => {
  let capturedUpdate: any;
  let capturedDelete: any;

  const db = {
    asset: {
      async findUnique() {
        return {
          id: 'asset_capex_2',
          market: 'KR',
          address: { country: 'KR' }
        };
      }
    },
    capexLineItem: {
      async findUnique() {
        return {
          id: 'capex_2',
          assetId: 'asset_capex_2',
          category: CapexCategory.SOFT_COST,
          label: 'Permitting',
          amountKrw: 2000000000,
          spendYear: 0,
          isEmbedded: false,
          notes: null
        };
      },
      async update(args: any) {
        capturedUpdate = args;
        return { id: 'capex_2', ...args.data };
      },
      async delete(args: any) {
        capturedDelete = args;
        return { id: 'capex_2' };
      }
    }
  } as any;

  await updateCapexLineItem(
    'asset_capex_2',
    'capex_2',
    {
      category: CapexCategory.CONTINGENCY,
      label: 'Revised contingency',
      amountKrw: 2500000000,
      spendYear: 2,
      isEmbedded: true
    },
    { db }
  );

  await deleteCapexLineItem('asset_capex_2', 'capex_2', { db });

  assert.equal(capturedUpdate.where.id, 'capex_2');
  assert.equal(capturedUpdate.data.category, CapexCategory.CONTINGENCY);
  assert.equal(capturedUpdate.data.spendYear, 2);
  assert.equal(capturedUpdate.data.isEmbedded, true);
  assert.equal(capturedDelete.where.id, 'capex_2');
});
