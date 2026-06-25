import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { constantTimeEqual } from '../middleware';

test('constantTimeEqual matches identical tokens', () => {
  assert.equal(constantTimeEqual('ops-cron-token-abc123', 'ops-cron-token-abc123'), true);
});

test('constantTimeEqual rejects a wrong token of equal length', () => {
  assert.equal(constantTimeEqual('ops-cron-token-abc123', 'ops-cron-token-abc124'), false);
});

test('constantTimeEqual rejects a correct-prefix token (no early-accept)', () => {
  assert.equal(constantTimeEqual('ops-cron-token-abc123', 'ops-cron-token-abc'), false);
  assert.equal(constantTimeEqual('ops', 'ops-cron-token-abc123'), false);
});

test('constantTimeEqual rejects empty against non-empty', () => {
  assert.equal(constantTimeEqual('', 'ops-cron-token-abc123'), false);
  assert.equal(constantTimeEqual('ops-cron-token-abc123', ''), false);
});

test('middleware ops auth no longer uses a raw === token comparison', () => {
  const src = readFileSync(new URL('../middleware.ts', import.meta.url), 'utf8');
  // Guard against regressing to a timing-oracle compare of the cron secret.
  assert.equal(/===\s*expectedToken/.test(src), false);
  assert.match(src, /constantTimeEqual\(/);
});
