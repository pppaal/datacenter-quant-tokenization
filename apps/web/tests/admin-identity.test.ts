import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAdminIdentityBindingSummary,
  getAdminReviewerAttributionSummary,
  listAdminIdentityUserCandidates,
  listAdminOperatorSeats,
  listRecentAdminIdentityBindings,
  resolveAdminActorSeat,
  resolveAdminReviewerUserId,
  rotateAdminOperatorSessionVersion,
  updateAdminOperatorSeat,
  updateAdminIdentityBindingUser,
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
        async findUnique() {
          return {
            id: 'user_bound',
            isActive: true
          };
        },
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
              id: 'binding_1',
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
  assert.equal(bindings[0]?.id, 'binding_1');
  assert.equal(bindings[0]?.provider, 'oidc');
  assert.equal(bindings[0]?.userId, null);
});

test('identity user candidates return canonical operators for intervention mapping', async () => {
  const candidates = await listAdminIdentityUserCandidates(
    {
      user: {
        async findMany(args: any) {
          assert.equal(args.take, 3);
          return [
            {
              id: 'user_1',
              name: 'Analyst Kim',
              email: 'kim@example.com',
              role: 'ANALYST'
            }
          ];
        }
      }
    } as any,
    {
      limit: 3
    }
  );

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.email, 'kim@example.com');
});

test('identity binding can be manually mapped to a canonical user', async () => {
  const updated = await updateAdminIdentityBindingUser(
    {
      bindingId: 'binding_1',
      userId: 'user_1'
    },
    {
      user: {
        async findUnique() {
          return {
            id: 'user_1'
          };
        }
      },
      adminIdentityBinding: {
        async update(args: any) {
          assert.equal(args.where.id, 'binding_1');
          assert.equal(args.data.userId, 'user_1');
          return {
            id: 'binding_1',
            provider: 'oidc',
            subject: 'subject-1',
            userId: 'user_1',
            emailSnapshot: 'kim@example.com',
            identifierSnapshot: 'kim',
            lastSeenAt: new Date('2026-04-07T00:00:00.000Z')
          };
        }
      }
    } as any
  );

  assert.equal(updated?.userId, 'user_1');
});

test('operator seats list canonical users with active flags', async () => {
  const seats = await listAdminOperatorSeats({
    user: {
      async findMany() {
        return [
          {
            id: 'user_1',
            name: 'Kim',
            email: 'kim@example.com',
            role: 'ANALYST',
            isActive: true
          }
        ];
      }
    }
  } as any);

  assert.equal(seats.length, 1);
  assert.equal(seats[0]?.isActive, true);
});

test('operator seat update changes role and active status', async () => {
  const seat = await updateAdminOperatorSeat(
    {
      userId: 'user_1',
      role: 'ADMIN',
      isActive: false
    },
    {
      user: {
        async findUnique() {
          return {
            id: 'user_1',
            role: 'ANALYST',
            isActive: true
          };
        },
        async count() {
          return 1;
        },
        async update(args: any) {
          assert.equal(args.where.id, 'user_1');
          assert.equal(args.data.role, 'ADMIN');
          assert.equal(args.data.isActive, false);
          return {
            id: 'user_1',
            name: 'Kim',
            email: 'kim@example.com',
            role: 'ADMIN',
            isActive: false,
            sessionVersion: 5
          };
        }
      }
    } as any
  );

  assert.equal(seat.role, 'ADMIN');
  assert.equal(seat.isActive, false);
  assert.equal(seat.sessionVersion, 5);
});

test('operator seat update blocks removing the last active admin seat', async () => {
  await assert.rejects(
    () =>
      updateAdminOperatorSeat(
        {
          userId: 'admin_1',
          role: 'ANALYST'
        },
        {
          user: {
            async findUnique() {
              return {
                id: 'admin_1',
                role: 'ADMIN',
                isActive: true
              };
            },
            async count() {
              return 0;
            },
            async update() {
              throw new Error('update should not run');
            }
          }
        } as any
      ),
    /At least one active ADMIN seat must remain assigned/
  );
});

test('operator seat update blocks self-role or self-active changes', async () => {
  await assert.rejects(
    () =>
      updateAdminOperatorSeat(
        {
          userId: 'admin_1',
          role: 'VIEWER',
          actingUserId: 'admin_1'
        },
        {
          user: {
            async findUnique() {
              return {
                id: 'admin_1',
                role: 'ADMIN',
                isActive: true
              };
            },
            async count() {
              return 1;
            },
            async update() {
              throw new Error('update should not run');
            }
          }
        } as any
      ),
    /Update another operator to change your own seat/
  );
});

test('operator session rotation increments session version without changing role', async () => {
  const seat = await rotateAdminOperatorSessionVersion(
    {
      userId: 'user_1'
    },
    {
      user: {
        async update(args: any) {
          assert.equal(args.where.id, 'user_1');
          assert.equal(args.data.sessionVersion.increment, 1);
          return {
            id: 'user_1',
            name: 'Kim',
            email: 'kim@example.com',
            role: 'ADMIN',
            isActive: true,
            sessionVersion: 8
          };
        }
      }
    } as any
  );

  assert.equal(seat.sessionVersion, 8);
});

test('resolveAdminActorSeat returns inactive mapped users for SSO enforcement', async () => {
  const seat = await resolveAdminActorSeat(
    {
      identifier: 'kim@example.com',
      role: 'ANALYST',
      provider: 'oidc',
      subject: 'subject-1',
      email: 'kim@example.com'
    },
    {
      adminIdentityBinding: {
        async findUnique() {
          return {
            userId: 'user_1'
          };
        }
      },
      user: {
        async findUnique() {
          return {
            id: 'user_1',
            isActive: false
          };
        },
        async findFirst() {
          throw new Error('fallback should not run');
        }
      }
    } as any
  );

  assert.equal(seat?.isActive, false);
});
