import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAdminIdentityBindingSummary,
  getAdminReviewerAttributionSummary,
  listRecentAdminIdentityBindings,
  resolveAdminReviewerUserId,
  upsertAdminIdentityBindingForActor
} from '@/lib/security/admin-identity';

test('reviewer attribution summary reflects OIDC readiness', () => {
  const summary = getAdminReviewerAttributionSummary({
    NODE_ENV: 'test',
    ADMIN_SESSION_SECRET: 'session-secret',
    ADMIN_OIDC_CLIENT_ID: 'client-id',
    ADMIN_OIDC_CLIENT_SECRET: 'client-secret',
    ADMIN_OIDC_ISSUER_URL: 'https://id.example.com'
  } as NodeJS.ProcessEnv);

  assert.equal(summary.authMode, 'oidc_ready');
  assert.equal(summary.reviewerAttributionMode, 'subject_mapping_live');
  assert.equal(summary.canResolveUserBoundReviewer, true);
});

test('reviewer attribution resolves by actor email before falling back to identifier', async () => {
  const calls: any[] = [];
  const result = await resolveAdminReviewerUserId(
    {
      identifier: 'analyst_alias',
      role: 'ANALYST',
      provider: 'oidc',
      subject: 'oidc-subject-1',
      email: 'analyst@example.com'
    },
    {
      adminIdentityBinding: {
        async findUnique() {
          return null;
        }
      },
      user: {
        async findFirst(args: any) {
          calls.push(args);
          return { id: 'user_1' };
        }
      }
    } as any
  );

  assert.equal(result, 'user_1');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].where.OR[0], { email: 'analyst@example.com' });
});

test('reviewer attribution resolves by persisted OIDC subject binding first', async () => {
  const result = await resolveAdminReviewerUserId(
    {
      identifier: 'analyst@example.com',
      role: 'ANALYST',
      provider: 'oidc',
      subject: 'oidc-subject-1',
      email: 'analyst@example.com'
    },
    {
      adminIdentityBinding: {
        async findUnique() {
          return { userId: 'user_bound' };
        }
      },
      user: {
        async findFirst() {
          throw new Error('fallback lookup should not run when subject binding exists');
        }
      }
    } as any
  );

  assert.equal(result, 'user_bound');
});

test('upsertAdminIdentityBindingForActor persists a provider-subject binding with matched user', async () => {
  let upsertArgs: any;

  const result = await upsertAdminIdentityBindingForActor(
    {
      identifier: 'analyst_alias',
      role: 'ANALYST',
      provider: 'oidc',
      subject: 'oidc-subject-2',
      email: 'analyst@example.com'
    },
    {
      adminIdentityBinding: {
        async findUnique() {
          return null;
        },
        async upsert(args: any) {
          upsertArgs = args;
          return { id: 'binding_1', ...args.create };
        }
      },
      user: {
        async findFirst() {
          return { id: 'user_1' };
        }
      }
    } as any
  );

  assert.equal(result?.userId, 'user_1');
  assert.equal(upsertArgs.where.provider_subject.provider, 'oidc');
  assert.equal(upsertArgs.where.provider_subject.subject, 'oidc-subject-2');
  assert.equal(upsertArgs.create.emailSnapshot, 'analyst@example.com');
});

test('identity binding summary reports mapped and unmapped counts', async () => {
  const summary = await getAdminIdentityBindingSummary({
    adminIdentityBinding: {
      async count(args?: any) {
        if (args?.where?.userId?.not === null) return 3;
        return 5;
      },
      async findFirst() {
        return {
          lastSeenAt: new Date('2026-04-06T00:00:00.000Z')
        };
      }
    }
  } as any);

  assert.equal(summary.totalBindings, 5);
  assert.equal(summary.mappedBindings, 3);
  assert.equal(summary.unmappedBindings, 2);
});

test('recent unmapped identity bindings return latest unresolved SSO identities', async () => {
  const bindings = await listRecentAdminIdentityBindings(
    {
      adminIdentityBinding: {
        async findMany(args: any) {
          assert.equal(args.where.userId, null);
          assert.equal(args.take, 2);
          return [
            {
              provider: 'oidc',
              subject: 'subject-1',
              userId: null,
              emailSnapshot: 'analyst@example.com',
              identifierSnapshot: 'analyst_alias',
              lastSeenAt: new Date('2026-04-06T00:00:00.000Z')
            }
          ];
        }
      }
    } as any,
    {
      onlyUnmapped: true,
      limit: 2
    }
  );

  assert.equal(bindings.length, 1);
  assert.equal(bindings[0]?.provider, 'oidc');
  assert.equal(bindings[0]?.userId, null);
});
