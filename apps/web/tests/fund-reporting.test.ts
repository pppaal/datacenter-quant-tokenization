import assert from 'node:assert/strict';
import test from 'node:test';
import { updateInvestorReportRelease } from '@/lib/services/fund-reporting';

test('updateInvestorReportRelease stamps review metadata and publish timestamp on release', async () => {
  let capturedUpdate: any = null;

  const result = await updateInvestorReportRelease(
    'report-1',
        {
      releaseStatus: 'RELEASED',
      draftSummary: 'Quarterly investor letter draft',
      reviewNotes: 'IC follow-up closed'
    },
    {
      userId: 'user-1',
      identifier: 'analyst@nexusseoul.local'
    },
    {
      investorReport: {
        findUnique: async () => ({
              id: 'report-1',
              fundId: 'fund-1',
              releaseStatus: 'READY',
              publishedAt: null,
              reviewedAt: null
        }),
        update: async (args: any) => {
          capturedUpdate = args;
          return { id: 'report-1', fundId: 'fund-1', ...args.data };
        }
      }
    } as any
  );

  assert.equal(capturedUpdate.data.releaseStatus, 'RELEASED');
  assert.equal(capturedUpdate.data.reviewedById, 'user-1');
  assert.equal(capturedUpdate.data.releasedById, 'user-1');
  assert.ok(capturedUpdate.data.publishedAt instanceof Date);
  assert.equal(result.fundId, 'fund-1');
});

test('updateInvestorReportRelease does not allow released reports to move backward', async () => {
  await assert.rejects(
    () =>
      updateInvestorReportRelease(
        'report-2',
        {
          releaseStatus: 'INTERNAL_REVIEW'
        },
        {
          userId: 'user-1',
          identifier: 'analyst@nexusseoul.local'
        },
        {
          investorReport: {
            findUnique: async () => ({
              id: 'report-2',
              fundId: 'fund-1',
              releaseStatus: 'RELEASED',
              publishedAt: new Date('2026-04-01'),
              reviewedAt: new Date('2026-03-30')
            })
          }
        } as any
      ),
    /cannot be moved back/
  );
});
