import { isRealProduction } from '@/lib/runtime-env';

/**
 * Hard-block that prevents `prisma:seed` from running against a real production
 * database. `main()` in `prisma/seed.ts` begins with ~50 `deleteMany()` calls,
 * so an accidental run with a production `DATABASE_URL` would wipe live data and
 * repopulate it with demo fixtures.
 *
 * Mirrors the production hard-blocks used for mock blockchain writes and
 * local-filesystem document storage: refuses when {@link isRealProduction} is
 * true unless an explicit, deliberate escape hatch (`ALLOW_PRODUCTION_SEED`) is
 * set. Dev / test / CI (where `NODE_ENV !== 'production'`) are unaffected.
 *
 * Extracted as a pure function so it can be unit-tested without a database.
 */
export function assertSeedAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (!isRealProduction(env)) {
    return;
  }
  if (env.ALLOW_PRODUCTION_SEED?.trim().toLowerCase() === 'true') {
    return;
  }
  throw new Error(
    'Refusing to run prisma:seed against a real production environment: the seed ' +
      'truncates ~50 tables (deleteMany) and reloads demo fixtures, which would ' +
      'destroy production data. If this is genuinely intended, set ' +
      'ALLOW_PRODUCTION_SEED=true to override this guard.'
  );
}
