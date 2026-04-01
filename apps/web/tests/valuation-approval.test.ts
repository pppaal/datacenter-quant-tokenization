import assert from 'node:assert/strict';
import test from 'node:test';
import { updateValuationApproval } from '@/lib/services/valuations';

test('updateValuationApproval stores approval status, notes, and approver label', async () => {
  const now = new Date('2026-03-30T12:00:00.000Z');
  let updated: any;
  const fakeDb = {
    valuationRun: {
      async findUnique() {
        return {
          id: 'run_1',
          assetId: 'asset_1'
        };
      },
      async update(args: any) {
        updated = args.data;
        return {
          id: 'run_1',
          assetId: 'asset_1',
          approvalStatus: args.data.approvalStatus,
          approvalNotes: args.data.approvalNotes,
          approvedByLabel: args.data.approvedByLabel,
          approvedAt: args.data.approvedAt ?? now,
          asset: { id: 'asset_1', address: null },
          scenarios: []
        };
      }
    }
  };

  const result = await updateValuationApproval(
    'run_1',
    {
      approvalStatus: 'CONDITIONAL',
      approvalNotes: 'Approve subject to power and financing reconfirmation.'
    },
    { identifier: 'chief.investment.officer' },
    fakeDb as any
  );

  assert.equal(updated.approvalStatus, 'CONDITIONAL');
  assert.equal(updated.approvedByLabel, 'chief.investment.officer');
  assert.equal(result.approvalStatus, 'CONDITIONAL');
});
