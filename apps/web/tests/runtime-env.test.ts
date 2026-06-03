import assert from 'node:assert/strict';
import test from 'node:test';
import { isRealProduction } from '@/lib/runtime-env';

const env = (overrides: Record<string, string | undefined>) =>
  overrides as unknown as NodeJS.ProcessEnv;

test('isRealProduction: non-production NODE_ENV is never real production', () => {
  assert.equal(isRealProduction(env({ NODE_ENV: 'development' })), false);
  assert.equal(isRealProduction(env({ NODE_ENV: 'test' })), false);
  assert.equal(isRealProduction(env({})), false);
});

test('isRealProduction: production without the E2E flag is real production', () => {
  assert.equal(isRealProduction(env({ NODE_ENV: 'production' })), true);
});

test('isRealProduction: E2E_PRODUCTION_BUILD opts out only outside a real deployment', () => {
  assert.equal(
    isRealProduction(env({ NODE_ENV: 'production', E2E_PRODUCTION_BUILD: 'true' })),
    false
  );
  assert.equal(
    isRealProduction(env({ NODE_ENV: 'production', E2E_PRODUCTION_BUILD: 'TRUE' })),
    false
  );
  assert.equal(
    isRealProduction(env({ NODE_ENV: 'production', E2E_PRODUCTION_BUILD: '  true  ' })),
    false
  );
  // Any value other than "true" keeps the hard-blocks engaged.
  assert.equal(
    isRealProduction(env({ NODE_ENV: 'production', E2E_PRODUCTION_BUILD: 'false' })),
    true
  );
  assert.equal(isRealProduction(env({ NODE_ENV: 'production', E2E_PRODUCTION_BUILD: '1' })), true);
});

test('isRealProduction: a real Vercel production deployment ignores the E2E flag', () => {
  assert.equal(
    isRealProduction(
      env({ NODE_ENV: 'production', VERCEL_ENV: 'production', E2E_PRODUCTION_BUILD: 'true' })
    ),
    true
  );
});

test('isRealProduction: Vercel preview/development still honor the E2E opt-out', () => {
  assert.equal(
    isRealProduction(
      env({ NODE_ENV: 'production', VERCEL_ENV: 'preview', E2E_PRODUCTION_BUILD: 'true' })
    ),
    false
  );
});
