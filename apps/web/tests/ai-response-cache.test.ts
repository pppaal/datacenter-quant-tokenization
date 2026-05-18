import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeAiPromptHash,
  getCachedAiResponse,
  setCachedAiResponse
} from '@/lib/services/ai/response-cache';

test('computeAiPromptHash is stable across message-array key order in the envelope', () => {
  const a = computeAiPromptHash({
    model: 'claude-haiku-4-5',
    system: 'You are an underwriter.',
    messages: [{ role: 'user', content: 'hi' }]
  });
  const b = computeAiPromptHash({
    system: 'You are an underwriter.',
    model: 'claude-haiku-4-5',
    messages: [{ role: 'user', content: 'hi' }]
  });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('computeAiPromptHash differentiates model and content changes', () => {
  const base = computeAiPromptHash({
    model: 'claude-haiku-4-5',
    messages: [{ role: 'user', content: 'hi' }]
  });
  const otherModel = computeAiPromptHash({
    model: 'claude-sonnet-4-6',
    messages: [{ role: 'user', content: 'hi' }]
  });
  const otherContent = computeAiPromptHash({
    model: 'claude-haiku-4-5',
    messages: [{ role: 'user', content: 'hello' }]
  });
  assert.notEqual(base, otherModel);
  assert.notEqual(base, otherContent);
});

type FakeRow = {
  id: string;
  promptHash: string;
  model: string;
  response: string;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: Date;
  expiresAt: Date;
  hitCount: number;
  lastHitAt: Date | null;
};

function buildFakeDb() {
  const rows = new Map<string, FakeRow>();
  return {
    rows,
    aiResponseCache: {
      async findUnique(args: {
        where: { promptHash_model: { promptHash: string; model: string } };
      }) {
        const key = `${args.where.promptHash_model.promptHash}:${args.where.promptHash_model.model}`;
        return rows.get(key) ?? null;
      },
      async update(args: { where: { id: string }; data: { hitCount?: { increment: number }; lastHitAt?: Date } }) {
        for (const row of rows.values()) {
          if (row.id !== args.where.id) continue;
          if (args.data.hitCount?.increment !== undefined) row.hitCount += args.data.hitCount.increment;
          if (args.data.lastHitAt) row.lastHitAt = args.data.lastHitAt;
          return row;
        }
        throw new Error('not found');
      },
      async upsert(args: {
        where: { promptHash_model: { promptHash: string; model: string } };
        create: Omit<FakeRow, 'id' | 'createdAt' | 'hitCount' | 'lastHitAt'>;
        update: Partial<FakeRow>;
      }) {
        const key = `${args.where.promptHash_model.promptHash}:${args.where.promptHash_model.model}`;
        const existing = rows.get(key);
        if (existing) {
          Object.assign(existing, args.update);
          return existing;
        }
        const fresh: FakeRow = {
          id: `row_${rows.size}`,
          createdAt: new Date(),
          hitCount: 0,
          lastHitAt: null,
          ...args.create
        } as FakeRow;
        rows.set(key, fresh);
        return fresh;
      }
    }
  };
}

test('getCachedAiResponse returns null when entry is missing', async () => {
  const db = buildFakeDb();
  const result = await getCachedAiResponse(
    { promptHash: 'abc', model: 'claude-haiku-4-5' },
    db as never
  );
  assert.equal(result, null);
});

test('setCachedAiResponse + getCachedAiResponse round-trip', async () => {
  const db = buildFakeDb();
  await setCachedAiResponse(
    {
      promptHash: 'abc',
      model: 'claude-haiku-4-5',
      response: 'a memo draft',
      inputTokens: 100,
      outputTokens: 250,
      ttlSeconds: 3600
    },
    db as never
  );
  const hit = await getCachedAiResponse(
    { promptHash: 'abc', model: 'claude-haiku-4-5' },
    db as never
  );
  assert.ok(hit);
  assert.equal(hit.response, 'a memo draft');
  assert.equal(hit.inputTokens, 100);
  assert.equal(hit.outputTokens, 250);
});

test('getCachedAiResponse refuses to serve expired entries', async () => {
  const db = buildFakeDb();
  await setCachedAiResponse(
    {
      promptHash: 'expired',
      model: 'claude-haiku-4-5',
      response: 'stale',
      ttlSeconds: 60
    },
    db as never
  );
  // Force the row's expiresAt into the past.
  const row = [...db.rows.values()][0]!;
  row.expiresAt = new Date(Date.now() - 1000);

  const result = await getCachedAiResponse(
    { promptHash: 'expired', model: 'claude-haiku-4-5' },
    db as never
  );
  assert.equal(result, null);
});

test('getCachedAiResponse bumps hit count on a fresh hit', async () => {
  const db = buildFakeDb();
  await setCachedAiResponse(
    {
      promptHash: 'k',
      model: 'm',
      response: 'r',
      ttlSeconds: 60
    },
    db as never
  );
  await getCachedAiResponse({ promptHash: 'k', model: 'm' }, db as never);
  await getCachedAiResponse({ promptHash: 'k', model: 'm' }, db as never);
  const row = [...db.rows.values()][0]!;
  assert.equal(row.hitCount, 2);
  assert.ok(row.lastHitAt);
});
