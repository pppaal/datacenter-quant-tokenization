import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { LruCache, hashCacheKey } from '@/lib/services/property-analyzer/report-cache';

test('hashCacheKey is deterministic for identical inputs', () => {
  const a = hashCacheKey(['seoul', 37.5, null, 'data-center']);
  const b = hashCacheKey(['seoul', 37.5, null, 'data-center']);
  assert.equal(a, b);
});

test('hashCacheKey produces a 64-char lowercase hex (SHA-256)', () => {
  const h = hashCacheKey(['seoul', 37.5, undefined, 126.9]);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h.length, 64);
});

test('hashCacheKey matches a direct SHA-256 of the joined parts', () => {
  const parts = ['a', 1, null, undefined, 'b'];
  const joined = parts.map((p) => (p === null || p === undefined ? '∅' : String(p))).join('|');
  const expected = createHash('sha256').update(joined, 'utf8').digest('hex');
  assert.equal(hashCacheKey(parts), expected);
});

test('hashCacheKey differs for different inputs', () => {
  const a = hashCacheKey(['seoul', 37.5]);
  const b = hashCacheKey(['busan', 35.1]);
  assert.notEqual(a, b);
});

test('hashCacheKey distinguishes null from undefined from empty', () => {
  const nul = hashCacheKey([null]);
  const und = hashCacheKey([undefined]);
  const empty = hashCacheKey(['']);
  // null and undefined both map to the sentinel, so they collide by design,
  // but neither should match the empty string.
  assert.equal(nul, und);
  assert.notEqual(nul, empty);
});

test('hashCacheKey is order-sensitive (different ordering → different key)', () => {
  assert.notEqual(hashCacheKey(['a', 'b']), hashCacheKey(['b', 'a']));
});

test('LruCache get/set round-trips a value', () => {
  const cache = new LruCache<number>();
  cache.set('k', 42);
  assert.equal(cache.get('k'), 42);
  assert.equal(cache.get('missing'), undefined);
});

test('LruCache evicts least-recently-used entries past max', () => {
  const cache = new LruCache<number>({ max: 2 });
  cache.set('a', 1);
  cache.set('b', 2);
  // Access 'a' to bump its recency so 'b' becomes the LRU victim.
  assert.equal(cache.get('a'), 1);
  cache.set('c', 3);
  assert.equal(cache.size, 2);
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a'), 1);
  assert.equal(cache.get('c'), 3);
});

test('LruCache expires entries after the TTL', async () => {
  const cache = new LruCache<string>({ ttlMs: 1000 });
  cache.set('k', 'v');
  assert.equal(cache.get('k'), 'v');

  // Freeze Date.now past the TTL window without sleeping.
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 2000;
    assert.equal(cache.get('k'), undefined);
    assert.equal(cache.size, 0);
  } finally {
    Date.now = realNow;
  }
});

test('LruCache clear empties the store', () => {
  const cache = new LruCache<number>();
  cache.set('a', 1);
  cache.set('b', 2);
  cache.clear();
  assert.equal(cache.size, 0);
  assert.equal(cache.get('a'), undefined);
});
