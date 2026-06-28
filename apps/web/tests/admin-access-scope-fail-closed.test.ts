import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { AdminAccessScopeType } from '@prisma/client';
import { canActorAccessScope, assertActorScopeAccess } from '@/lib/security/admin-access';
import type { AuthorizedAdminActor } from '@/lib/security/admin-auth';
import { __resetEnvCache } from '@/lib/env';

/**
 * SECURITY regression guard for the row-level scope model in
 * `canActorAccessScope` / `assertActorScopeAccess`.
 *
 * The hardened model:
 *   - READ mode (default for visibility): an un-granted non-ADMIN actor is
 *     unrestricted (opt-in allowlist) so analysts aren't locked out of seeing
 *     data; a granted analyst is narrowed to their grants.
 *   - MUTATION mode: an un-granted non-ADMIN actor is DENIED (fail-CLOSED) —
 *     least-privilege; an ADMIN must grant the scope first. A granted analyst
 *     may mutate only granted scopes. ADMIN always passes. The legacy
 *     ADMIN_SCOPE_ALLOW_UNGRANTED_MUTATIONS env restores fail-open for
 *     migration.
 */

const ADMIN: AuthorizedAdminActor = {
  identifier: 'admin@example.com',
  role: 'ADMIN',
  userId: 'admin-1'
};
const ANALYST: AuthorizedAdminActor = {
  identifier: 'analyst@example.com',
  role: 'ANALYST',
  userId: 'analyst-1'
};

/** Fake AdminAccessGrant db: returns the configured grant rows for the user. */
function fakeDb(grants: Array<{ userId: string; scopeId: string }>) {
  return {
    adminAccessGrant: {
      async findMany(args: { where: { userId: string } }) {
        return grants
          .filter((g) => g.userId === args.where.userId)
          .map((g) => ({ scopeId: g.scopeId }));
      }
    }
  };
}

afterEach(() => {
  delete process.env.ADMIN_SCOPE_ALLOW_UNGRANTED_MUTATIONS;
  __resetEnvCache();
});

test('un-granted ANALYST is DENIED a scoped mutation (fail-closed)', async () => {
  const db = fakeDb([]); // no grants
  const allowed = await canActorAccessScope(
    ANALYST,
    AdminAccessScopeType.DEAL,
    'deal-123',
    db,
    'mutation'
  );
  assert.equal(allowed, false);

  await assert.rejects(
    () => assertActorScopeAccess(ANALYST, AdminAccessScopeType.DEAL, 'deal-123', db, 'mutation'),
    /not granted/
  );
});

test('un-granted ANALYST is ALLOWED a scoped READ (visibility opt-in preserved)', async () => {
  const db = fakeDb([]);
  const allowed = await canActorAccessScope(
    ANALYST,
    AdminAccessScopeType.DEAL,
    'deal-123',
    db,
    'read'
  );
  assert.equal(allowed, true);
  // Default mode is 'read' for canActorAccessScope.
  assert.equal(await canActorAccessScope(ANALYST, AdminAccessScopeType.DEAL, 'deal-123', db), true);
});

test('ADMIN passes a scoped mutation regardless of grants', async () => {
  const db = fakeDb([]);
  const allowed = await canActorAccessScope(
    ADMIN,
    AdminAccessScopeType.DEAL,
    'deal-123',
    db,
    'mutation'
  );
  assert.equal(allowed, true);
  await assert.doesNotReject(() =>
    assertActorScopeAccess(ADMIN, AdminAccessScopeType.DEAL, 'deal-123', db, 'mutation')
  );
});

test('GRANTED ANALYST passes mutation for the granted scope, denied for others', async () => {
  const db = fakeDb([{ userId: 'analyst-1', scopeId: 'deal-123' }]);

  assert.equal(
    await canActorAccessScope(ANALYST, AdminAccessScopeType.DEAL, 'deal-123', db, 'mutation'),
    true
  );
  // A scope the analyst was NOT granted is denied even in the granted set.
  assert.equal(
    await canActorAccessScope(ANALYST, AdminAccessScopeType.DEAL, 'deal-999', db, 'mutation'),
    false
  );
});

test('legacy ADMIN_SCOPE_ALLOW_UNGRANTED_MUTATIONS restores fail-open for un-granted mutations', async () => {
  process.env.ADMIN_SCOPE_ALLOW_UNGRANTED_MUTATIONS = 'true';
  __resetEnvCache();
  const db = fakeDb([]);
  assert.equal(
    await canActorAccessScope(ANALYST, AdminAccessScopeType.DEAL, 'deal-123', db, 'mutation'),
    true
  );
});

test('real production hard-disables the fail-open hatch even when the flag is set', async () => {
  // A leaked/copied prod env with the flag on must NOT re-open fail-open writes:
  // ungrantedMutationsAllowed() self-guards via isRealProduction().
  // NODE_ENV is typed readonly; assign through a widened view of process.env.
  const procEnv = process.env as Record<string, string | undefined>;
  const origNodeEnv = procEnv.NODE_ENV;
  const origVercelEnv = procEnv.VERCEL_ENV;
  procEnv.ADMIN_SCOPE_ALLOW_UNGRANTED_MUTATIONS = 'true';
  procEnv.NODE_ENV = 'production';
  procEnv.VERCEL_ENV = 'production'; // makes isRealProduction() true
  __resetEnvCache();
  try {
    const db = fakeDb([]); // no grants
    assert.equal(
      await canActorAccessScope(ANALYST, AdminAccessScopeType.DEAL, 'deal-123', db, 'mutation'),
      false,
      'production must ignore the fail-open escape hatch'
    );
  } finally {
    procEnv.NODE_ENV = origNodeEnv;
    if (origVercelEnv === undefined) delete procEnv.VERCEL_ENV;
    else procEnv.VERCEL_ENV = origVercelEnv;
    delete procEnv.ADMIN_SCOPE_ALLOW_UNGRANTED_MUTATIONS;
    __resetEnvCache();
  }
});

test('no actor is always denied', async () => {
  const db = fakeDb([]);
  assert.equal(
    await canActorAccessScope(null, AdminAccessScopeType.DEAL, 'deal-123', db, 'mutation'),
    false
  );
  assert.equal(
    await canActorAccessScope(undefined, AdminAccessScopeType.DEAL, 'deal-123', db, 'read'),
    false
  );
});
