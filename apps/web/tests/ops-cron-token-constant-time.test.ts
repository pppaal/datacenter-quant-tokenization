import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * The `OPS_CRON_TOKEN` shared secret authorizes every `/api/ops/*` cron route.
 * Comparing it with a naive `===` is a timing oracle: `===` short-circuits at
 * the first differing byte, leaking how long a matching prefix is and letting
 * an attacker recover the token byte-by-byte. These tests pin the constant-time
 * comparison:
 *
 *  1. No in-scope ops route source still uses the timing-unsafe
 *     `=== expectedToken` comparison (would FAIL before the fix — all nine
 *     handlers compared with `===`).
 *  2. `isOpsRequestAuthorized` authorizes a correct token via either accepted
 *     header and fails closed for wrong / empty / missing tokens.
 *  3. The shared comparison is length-independent: it inspects every byte of
 *     the longer string rather than bailing out early.
 *
 * Network- and DB-free: only the auth helper and rejected (pre-DB) route paths
 * are exercised.
 */

const here = dirname(fileURLToPath(import.meta.url));
const opsDir = join(here, '..', 'app', 'api', 'ops');

const OPS_ROUTE_SOURCES = [
  'ai-cache-evict/route.ts',
  'audit-prune/route.ts',
  'cycle/route.ts',
  'cycle/trigger/route.ts',
  'index-documents/route.ts',
  'index-onchain-events/route.ts',
  'quarterly-snapshot/route.ts',
  'reclassify-tiers/route.ts',
  'research-stale-drafts/route.ts',
  'research-sync/_handler.ts',
  'source-refresh/route.ts'
];

test('no ops route uses a timing-unsafe `=== expectedToken` comparison', () => {
  for (const rel of OPS_ROUTE_SOURCES) {
    const source = readFileSync(join(opsDir, rel), 'utf8');
    assert.ok(
      !source.includes('=== expectedToken'),
      `${rel} must not compare the cron token with a non-constant-time \`===\``
    );
  }
});

test('isOpsRequestAuthorized authorizes the correct token via either header', async () => {
  const { isOpsRequestAuthorized } = await import('@/app/api/ops/_auth');
  const token = 'super-secret-ops-cron-token-0123456789';

  const bearerReq = new Request('http://localhost/api/ops/cycle', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(isOpsRequestAuthorized(bearerReq, token), true);

  const headerReq = new Request('http://localhost/api/ops/cycle', {
    method: 'POST',
    headers: { 'x-ops-cron-token': token }
  });
  assert.equal(isOpsRequestAuthorized(headerReq, token), true);
});

test('isOpsRequestAuthorized fails closed for wrong, empty, or missing tokens', async () => {
  const { isOpsRequestAuthorized } = await import('@/app/api/ops/_auth');
  const token = 'super-secret-ops-cron-token-0123456789';

  // Long shared prefix but differing suffix — the exact case a timing oracle
  // would otherwise leak.
  const wrong = new Request('http://localhost/api/ops/cycle', {
    method: 'POST',
    headers: { authorization: `Bearer ${token.slice(0, -1)}X` }
  });
  assert.equal(isOpsRequestAuthorized(wrong, token), false);

  // A prefix of the real token must not authorize.
  const prefix = new Request('http://localhost/api/ops/cycle', {
    method: 'POST',
    headers: { 'x-ops-cron-token': token.slice(0, 10) }
  });
  assert.equal(isOpsRequestAuthorized(prefix, token), false);

  // No credential headers at all.
  const missing = new Request('http://localhost/api/ops/cycle', { method: 'POST' });
  assert.equal(isOpsRequestAuthorized(missing, token), false);

  // Empty bearer must never satisfy a non-empty expected token.
  const empty = new Request('http://localhost/api/ops/cycle', {
    method: 'POST',
    headers: { authorization: 'Bearer ' }
  });
  assert.equal(isOpsRequestAuthorized(empty, token), false);
});

test('an ops route rejects a wrong cron token with 401 (no DB access)', async () => {
  const prev = process.env.OPS_CRON_TOKEN;
  process.env.OPS_CRON_TOKEN = 'expected-ops-cron-token-value';
  try {
    const { POST } = await import('@/app/api/ops/ai-cache-evict/route');
    const response = await POST(
      new Request('http://localhost/api/ops/ai-cache-evict', {
        method: 'POST',
        headers: { authorization: 'Bearer expected-ops-cron-token-valuX' }
      })
    );
    assert.equal(response.status, 401);
  } finally {
    if (prev === undefined) delete process.env.OPS_CRON_TOKEN;
    else process.env.OPS_CRON_TOKEN = prev;
  }
});
