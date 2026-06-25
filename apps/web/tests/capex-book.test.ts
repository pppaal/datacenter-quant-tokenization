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

test('capex update preserves isEmbedded when the field is omitted from the payload', async () => {
  // Regression: the validation schema defaults `isEmbedded` to false, so a
  // partial update (label only) used to silently flip an embedded line item
  // back to non-embedded. That mis-classifies it as deferred CapEx, which
  // inflates the idiosyncratic risk-register backlog factor.
  let capturedUpdate: any;

  const db = {
    asset: {
      async findUnique() {
        return { id: 'asset_capex_3', market: 'KR', address: { country: 'KR' } };
      }
    },
    capexLineItem: {
      async findUnique() {
        return {
          id: 'capex_3',
          assetId: 'asset_capex_3',
          category: CapexCategory.ELECTRICAL,
          label: 'Embedded switchgear',
          amountKrw: 5000000000,
          spendYear: 1,
          isEmbedded: true,
          notes: null
        };
      },
      async update(args: any) {
        capturedUpdate = args;
        return { id: 'capex_3', ...args.data };
      }
    }
  } as any;

  await updateCapexLineItem(
    'asset_capex_3',
    'capex_3',
    {
      // Operator only edits the label; isEmbedded is intentionally omitted.
      category: CapexCategory.ELECTRICAL,
      label: 'Embedded switchgear (renamed)',
      amountKrw: 5000000000
    },
    { db }
  );

  assert.equal(capturedUpdate.data.label, 'Embedded switchgear (renamed)');
  assert.equal(
    capturedUpdate.data.isEmbedded,
    true,
    'omitted isEmbedded must retain the existing embedded flag'
  );
});

test('capex update can still clear isEmbedded when explicitly set to false', async () => {
  let capturedUpdate: any;

  const db = {
    asset: {
      async findUnique() {
        return { id: 'asset_capex_4', market: 'KR', address: { country: 'KR' } };
      }
    },
    capexLineItem: {
      async findUnique() {
        return {
          id: 'capex_4',
          assetId: 'asset_capex_4',
          category: CapexCategory.ELECTRICAL,
          label: 'Was embedded',
          amountKrw: 1000000000,
          spendYear: 1,
          isEmbedded: true,
          notes: null
        };
      },
      async update(args: any) {
        capturedUpdate = args;
        return { id: 'capex_4', ...args.data };
      }
    }
  } as any;

  await updateCapexLineItem(
    'asset_capex_4',
    'capex_4',
    {
      category: CapexCategory.ELECTRICAL,
      label: 'Now standalone',
      amountKrw: 1000000000,
      isEmbedded: false
    },
    { db }
  );

  assert.equal(capturedUpdate.data.isEmbedded, false);
});
