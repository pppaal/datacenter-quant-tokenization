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
            isActive: false
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
            isActive: true
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
});
