import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';

test('verified admin actor rejects basic auth actors when basic access is disabled', async () => {
  const actor = await resolveVerifiedAdminActorFromHeaders(
    {
      get(name: string) {
        if (name === 'x-admin-actor') return 'admin@nexusseoul.local';
        if (name === 'x-admin-role') return 'ADMIN';
        if (name === 'x-admin-auth-provider') return 'basic';
        return null;
      }
    },
    {
      user: {
        async findFirst() {
          return {
            id: 'user_admin',
            isActive: true
          };
        },
        async findUnique() {
          return null;
        }
      },
      adminSession: {
        async findUnique() {
          return null;
        }
      }
    } as any,
    {
      allowBasic: false,
      requireActiveSeat: true
    }
  );

  assert.equal(actor, null);
});

test('verified admin actor rejects inactive bound seats', async () => {
  const actor = await resolveVerifiedAdminActorFromHeaders(
    {
      get(name: string) {
        if (name === 'x-admin-actor') return 'admin@nexusseoul.local';
        if (name === 'x-admin-role') return 'ADMIN';
        if (name === 'x-admin-auth-provider') return 'session';
        if (name === 'x-admin-user-id') return 'user_admin';
        if (name === 'x-admin-session-id') return 'session_admin';
        if (name === 'x-admin-session-version') return '2';
        return null;
      }
    },
    {
      user: {
        async findFirst() {
          throw new Error('fallback should not run');
        },
        async findUnique() {
          return {
            id: 'user_admin',
            isActive: false,
            sessionVersion: 2
          };
        }
      },
      adminSession: {
        async findUnique() {
          return {
            id: 'session_admin',
            userId: 'user_admin',
            revokedAt: null,
            expiresAt: new Date(Date.now() + 60_000),
            sessionVersion: 2
          };
        }
      }
    } as any,
    {
      allowBasic: false,
      requireActiveSeat: true
    }
  );

  assert.equal(actor, null);
});

test('verified admin actor keeps canonical user id for active session seats', async () => {
  const actor = await resolveVerifiedAdminActorFromHeaders(
    {
      get(name: string) {
        if (name === 'x-admin-actor') return 'admin@nexusseoul.local';
        if (name === 'x-admin-role') return 'ADMIN';
        if (name === 'x-admin-auth-provider') return 'session';
        if (name === 'x-admin-user-id') return 'user_admin';
        if (name === 'x-admin-session-id') return 'session_admin';
        if (name === 'x-admin-session-version') return '2';
        return null;
      }
    },
    {
      user: {
        async findFirst() {
          throw new Error('fallback should not run');
        },
        async findUnique() {
          return {
            id: 'user_admin',
            isActive: true,
            sessionVersion: 2
          };
        }
      },
      adminSession: {
        async findUnique() {
          return {
            id: 'session_admin',
            userId: 'user_admin',
            revokedAt: null,
            expiresAt: new Date(Date.now() + 60_000),
            sessionVersion: 2
          };
        }
      }
    } as any,
    {
      allowBasic: false,
      requireActiveSeat: true
    }
  );

  assert.equal(actor?.userId, 'user_admin');
  assert.equal(actor?.identifier, 'admin@nexusseoul.local');
  assert.equal(actor?.sessionVersion, 2);
});

test('verified admin actor rejects stale session versions', async () => {
  const actor = await resolveVerifiedAdminActorFromHeaders(
    {
      get(name: string) {
        if (name === 'x-admin-actor') return 'admin@nexusseoul.local';
        if (name === 'x-admin-role') return 'ADMIN';
        if (name === 'x-admin-auth-provider') return 'session';
        if (name === 'x-admin-user-id') return 'user_admin';
        if (name === 'x-admin-session-id') return 'session_admin';
        if (name === 'x-admin-session-version') return '2';
        return null;
      }
    },
    {
      user: {
        async findFirst() {
          throw new Error('fallback should not run');
        },
        async findUnique() {
          return {
            id: 'user_admin',
            isActive: true,
            sessionVersion: 3
          };
        }
      },
      adminSession: {
        async findUnique() {
          return {
            id: 'session_admin',
            userId: 'user_admin',
            revokedAt: null,
            expiresAt: new Date(Date.now() + 60_000),
            sessionVersion: 2
          };
        }
      }
    } as any,
    {
      allowBasic: false,
      requireActiveSeat: true
    }
  );

  assert.equal(actor, null);
});

test('verified admin actor rejects session actors missing a session version when the seat has one', async () => {
  const actor = await resolveVerifiedAdminActorFromHeaders(
    {
      get(name: string) {
        if (name === 'x-admin-actor') return 'admin@nexusseoul.local';
        if (name === 'x-admin-role') return 'ADMIN';
        if (name === 'x-admin-auth-provider') return 'session';
        if (name === 'x-admin-user-id') return 'user_admin';
        if (name === 'x-admin-session-id') return 'session_admin';
        return null;
      }
    },
    {
      user: {
        async findFirst() {
          throw new Error('fallback should not run');
        },
        async findUnique() {
          return {
            id: 'user_admin',
            isActive: true,
            sessionVersion: 4
          };
        }
      },
      adminSession: {
        async findUnique() {
          return {
            id: 'session_admin',
            userId: 'user_admin',
            revokedAt: null,
            expiresAt: new Date(Date.now() + 60_000),
            sessionVersion: 4
          };
        }
      }
    } as any,
    {
      allowBasic: false,
      requireActiveSeat: true
    }
  );

  assert.equal(actor, null);
});

test('verified admin actor rejects revoked persisted sessions', async () => {
  const actor = await resolveVerifiedAdminActorFromHeaders(
    {
      get(name: string) {
        if (name === 'x-admin-actor') return 'admin@nexusseoul.local';
        if (name === 'x-admin-role') return 'ADMIN';
        if (name === 'x-admin-auth-provider') return 'session';
        if (name === 'x-admin-user-id') return 'user_admin';
        if (name === 'x-admin-session-id') return 'session_admin';
        if (name === 'x-admin-session-version') return '4';
        return null;
      }
    },
    {
      user: {
        async findFirst() {
          throw new Error('fallback should not run');
        },
        async findUnique() {
          return {
            id: 'user_admin',
            isActive: true,
            sessionVersion: 4
          };
        }
      },
      adminSession: {
        async findUnique() {
          return {
            id: 'session_admin',
            userId: 'user_admin',
            revokedAt: new Date(),
            expiresAt: new Date(Date.now() + 60_000),
            sessionVersion: 4
          };
        }
      }
    } as any,
    {
      allowBasic: false,
      requireActiveSeat: true
    }
  );

  assert.equal(actor, null);
});

test('verified admin actor enforces persisted sessions even when the underlying identity provider is oidc', async () => {
  const actor = await resolveVerifiedAdminActorFromHeaders(
    {
      get(name: string) {
        if (name === 'x-admin-actor') return 'admin@nexusseoul.local';
        if (name === 'x-admin-role') return 'ADMIN';
        if (name === 'x-admin-auth-provider') return 'oidc';
        if (name === 'x-admin-user-id') return 'user_admin';
        if (name === 'x-admin-session-id') return 'session_admin';
        if (name === 'x-admin-session-version') return '4';
        return null;
      }
    },
    {
      user: {
        async findFirst() {
          throw new Error('fallback should not run');
        },
        async findUnique() {
          return {
            id: 'user_admin',
            isActive: true,
            sessionVersion: 4
          };
        }
      },
      adminSession: {
        async findUnique() {
          return {
            id: 'session_admin',
            userId: 'user_admin',
            revokedAt: null,
            expiresAt: new Date(Date.now() + 60_000),
            sessionVersion: 4
          };
        }
      }
    } as any,
    {
      allowBasic: false,
      requireActiveSeat: true
    }
  );

  assert.equal(actor?.userId, 'user_admin');
});
