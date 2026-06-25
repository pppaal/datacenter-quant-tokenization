import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSeedAllowed } from '@/prisma/seeds/prod-guard';

// A real production deployment: NODE_ENV=production with the Vercel production
// signal set, so isRealProduction() returns true regardless of any opt-out flag.
const productionEnv = {
  NODE_ENV: 'production',
  VERCEL_ENV: 'production'
} as unknown as NodeJS.ProcessEnv;

test('assertSeedAllowed throws in production without the override', () => {
  assert.throws(() => assertSeedAllowed(productionEnv), /ALLOW_PRODUCTION_SEED/);
});

test('assertSeedAllowed does not throw in production when the override is set', () => {
  assert.doesNotThrow(() =>
    assertSeedAllowed({
      ...productionEnv,
      ALLOW_PRODUCTION_SEED: 'true'
    } as unknown as NodeJS.ProcessEnv)
  );
});

test('assertSeedAllowed does not throw in non-production', () => {
  assert.doesNotThrow(() =>
    assertSeedAllowed({ NODE_ENV: 'development' } as unknown as NodeJS.ProcessEnv)
  );
  assert.doesNotThrow(() =>
    assertSeedAllowed({ NODE_ENV: 'test' } as unknown as NodeJS.ProcessEnv)
  );
});
