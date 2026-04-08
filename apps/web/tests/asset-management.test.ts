import assert from 'node:assert/strict';
import test from 'node:test';
import { TaskPriority, TaskStatus } from '@prisma/client';
import {
  createAssetManagementInitiative,
  updateAssetManagementInitiative
} from '@/lib/services/asset-management';

test('createAssetManagementInitiative validates the title and stamps done initiatives', async () => {
  let capturedCreate: any = null;

  const result = await createAssetManagementInitiative(
    'portfolio-asset-1',
    {
      title: 'Refinance lender pack readiness',
      status: TaskStatus.DONE,
      priority: TaskPriority.HIGH,
      targetDate: '2026-06-10',
      nextStep: 'Send final data room package'
    },
    {
      portfolioAsset: {
        findUnique: async () => ({ id: 'portfolio-asset-1', portfolioId: 'portfolio-1', assetId: 'asset-1' })
      },
      assetManagementInitiative: {
        create: async (args: any) => {
          capturedCreate = args;
          return { id: 'initiative-1', ...args.data };
        }
      }
    } as any
  );

  assert.equal(capturedCreate.data.title, 'Refinance lender pack readiness');
  assert.equal(capturedCreate.data.status, TaskStatus.DONE);
  assert.ok(capturedCreate.data.completedAt instanceof Date);
  assert.equal(result.id, 'initiative-1');
});

test('updateAssetManagementInitiative clears completedAt when reopening an item', async () => {
  let capturedUpdate: any = null;

  const result = await updateAssetManagementInitiative(
    'portfolio-asset-1',
    'initiative-1',
    {
      status: TaskStatus.BLOCKED,
      blockerSummary: 'Lender credit committee still pending'
    },
    {
      assetManagementInitiative: {
        findUnique: async () => ({
          id: 'initiative-1',
          portfolioAssetId: 'portfolio-asset-1',
          status: TaskStatus.DONE,
          completedAt: new Date('2026-04-01')
        }),
        update: async (args: any) => {
          capturedUpdate = args;
          return { id: 'initiative-1', ...args.data };
        }
      }
    } as any
  );

  assert.equal(capturedUpdate.data.status, TaskStatus.BLOCKED);
  assert.equal(capturedUpdate.data.completedAt, null);
  assert.equal(result.blockerSummary, 'Lender credit committee still pending');
});
