import assert from 'node:assert/strict';
import test from 'node:test';
import { ResearchSyncTriggerType, SourceRefreshTriggerType } from '@prisma/client';
import { runOpsCycle } from '@/lib/services/ops-worker';

test('runOpsCycle runs source refresh and research sync with aligned trigger metadata', async () => {
  const calls: Array<Record<string, unknown>> = [];
  const fakeDb = {};

  const result = await runOpsCycle(
    {
      actorIdentifier: 'ops@example.com',
      scheduled: true
    },
    fakeDb as never,
    {
      runSourceRefreshJob: async (input) => {
        calls.push({ step: 'source', ...input });
        return {
          id: 'source_run_1',
          statusLabel: 'SUCCESS',
          triggerType: input!.triggerType,
          refreshedAssetCount: 2,
          failedAssetCount: 0
        } as never;
      },
      runResearchWorkspaceSync: async (input) => {
        calls.push({ step: 'research', ...input });
        return {
          id: 'research_run_1',
          statusLabel: 'SUCCESS',
          triggerType: input!.triggerType,
          officialSourceCount: 8,
          assetDossierCount: 5
        } as never;
      }
    }
  );

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], {
    step: 'source',
    actorIdentifier: 'ops@example.com',
    triggerType: SourceRefreshTriggerType.SCHEDULED
  });
  assert.deepEqual(calls[1], {
    step: 'research',
    actorIdentifier: 'ops@example.com',
    triggerType: ResearchSyncTriggerType.SCHEDULED
  });
  assert.equal(result.sourceRun.id, 'source_run_1');
  assert.equal(result.researchRun.id, 'research_run_1');
  assert.equal(result.attemptSummary.sourceAttemptCount, 1);
  assert.equal(result.attemptSummary.researchAttemptCount, 1);
});

test('runOpsCycle retries failed steps before surfacing an error', async () => {
  let sourceCalls = 0;
  let researchCalls = 0;
  process.env.OPS_CYCLE_RETRY_ATTEMPTS = '2';
  process.env.OPS_CYCLE_RETRY_BACKOFF_MS = '0';

  const result = await runOpsCycle(
    {
      actorIdentifier: 'ops@example.com',
      scheduled: false
    },
    {} as never,
    {
      runSourceRefreshJob: async () => {
        sourceCalls += 1;
        if (sourceCalls === 1) {
          throw new Error('temporary source failure');
        }
        return {
          id: 'source_run_retry',
          statusLabel: 'SUCCESS',
          triggerType: SourceRefreshTriggerType.MANUAL,
          refreshedAssetCount: 1,
          failedAssetCount: 0
        } as never;
      },
      runResearchWorkspaceSync: async () => {
        researchCalls += 1;
        if (researchCalls === 1) {
          throw new Error('temporary research failure');
        }
        return {
          id: 'research_run_retry',
          statusLabel: 'SUCCESS',
          triggerType: ResearchSyncTriggerType.MANUAL,
          officialSourceCount: 2,
          assetDossierCount: 1
        } as never;
      }
    }
  );

  assert.equal(sourceCalls, 2);
  assert.equal(researchCalls, 2);
  assert.equal(result.attemptSummary.sourceAttemptCount, 2);
  assert.equal(result.attemptSummary.researchAttemptCount, 2);
  assert.match(result.alertSummary, /recovered after retry/i);

  delete process.env.OPS_CYCLE_RETRY_ATTEMPTS;
  delete process.env.OPS_CYCLE_RETRY_BACKOFF_MS;
});
