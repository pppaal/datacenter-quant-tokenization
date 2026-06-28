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
      async updateMany() {
        // Conditional claim transition (status QUEUED -> RUNNING) succeeds.
        return { count: 1 };
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
  // The retry budget must be reset, else a replayed DEAD_LETTER item (whose
  // attemptCount == maxAttempts) re-dead-letters after a single attempt.
  assert.equal(updated.attemptCount, 0, 'replay must reset attemptCount');
  assert.equal(result.status, 'QUEUED');
});

test('ops queue drain skips an item another worker already claimed (atomic claim)', async () => {
  let runs = 0;
  const db = {
    opsWorkItem: {
      async findFirst() {
        return {
          id: 'work_race',
          workType: 'OPS_CYCLE',
          actorIdentifier: 'ops',
          payload: null,
          scheduledFor: new Date(Date.now() - 1000),
          attemptCount: 0,
          maxAttempts: 3
        };
      },
      async updateMany() {
        // Lost the race: the conditional QUEUED->RUNNING transition matched 0 rows.
        return { count: 0 };
      },
      async update() {
        throw new Error('update must not run when the claim was lost');
      }
    },
    opsWorkAttempt: {
      async create() {
        runs += 1;
        return { id: 'attempt_x' };
      },
      async update() {
        return null;
      }
    }
  };

  const result = await drainOpsWorkQueue(db as any, { limit: 3 });
  assert.deepEqual(result, [], 'a lost claim must process nothing');
  assert.equal(runs, 0, 'the work must never execute when the claim was lost');
});
