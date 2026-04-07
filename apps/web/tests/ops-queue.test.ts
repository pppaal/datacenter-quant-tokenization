import assert from 'node:assert/strict';
import test from 'node:test';
import { drainOpsWorkQueue, replayOpsWorkItem } from '@/lib/services/ops-queue';

test('ops queue dead-letters work after max attempts', async () => {
  const updates: Array<any> = [];
  const db = {
    opsWorkItem: {
      async findFirst() {
        return {
          id: 'work_1',
          workType: 'OPS_CYCLE',
          actorIdentifier: 'ops',
          payload: null,
          scheduledFor: new Date(Date.now() - 1000),
          attemptCount: 2,
          maxAttempts: 3
        };
      },
      async update({ data }: any) {
        updates.push(data);
        return {
          id: 'work_1',
          workType: 'OPS_CYCLE',
          actorIdentifier: 'ops',
          payload: null,
          scheduledFor: new Date(),
          attemptCount: data.attemptCount ?? 2,
          maxAttempts: 3
        };
      }
    },
    opsWorkAttempt: {
      async create() {
        return { id: 'attempt_1' };
      },
      async update() {
        return null;
      }
    },
    opsAlertDelivery: {
      async create(args: any) {
        return {
          id: 'delivery_1',
          createdAt: new Date(),
          ...args.data
        };
      }
    }
  };

  const originalNow = Date.now;
  try {
    const result = await drainOpsWorkQueue(db as any, {
      limit: 1
    });
    assert.equal(result[0]?.status, 'DEAD_LETTER');
    assert.ok(updates.some((entry) => entry.status === 'DEAD_LETTER'));
  } finally {
    Date.now = originalNow;
  }
});

test('ops queue replay requeues failed work items for immediate retry', async () => {
  let updated: any;

  const result = await replayOpsWorkItem(
    {
      workItemId: 'work_1',
      actorIdentifier: 'ops-admin'
    },
    {
      opsWorkItem: {
        async findUnique() {
          return {
            id: 'work_1',
            actorIdentifier: 'ops-worker',
            status: 'DEAD_LETTER'
          };
        },
        async update(args: any) {
          updated = args.data;
          return {
            id: 'work_1',
            status: 'QUEUED',
            actorIdentifier: args.data.actorIdentifier
          };
        }
      }
    } as any
  );

  assert.equal(updated.status, 'QUEUED');
  assert.equal(updated.actorIdentifier, 'ops-admin');
  assert.equal(result.status, 'QUEUED');
});
