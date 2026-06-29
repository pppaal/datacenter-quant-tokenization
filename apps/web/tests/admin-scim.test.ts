import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deprovisionAdminUser,
  getAdminScimConfig,
  upsertProvisionedAdminUser,
  ScimValidationError
} from '@/lib/security/admin-scim';

test('admin scim config is enabled only when token exists', () => {
  assert.equal(
    getAdminScimConfig({ ADMIN_SCIM_TOKEN: 'token' } as unknown as NodeJS.ProcessEnv).enabled,
    true
  );
  assert.equal(getAdminScimConfig({} as unknown as NodeJS.ProcessEnv).enabled, false);
});

test('scim upsert creates or updates a canonical user and replaces grants', async () => {
  const state = {
    user: null as any,
    grants: [] as Array<{ scopeType: string; scopeId: string }>
  };

  const user = await upsertProvisionedAdminUser(
    {
      externalId: 'ext-1',
      email: 'seat@nexusseoul.local',
      name: 'Seat One',
      role: 'ANALYST',
      isActive: true,
      grants: [
        {
          scopeType: 'ASSET' as any,
          scopeId: 'asset_1'
        }
      ]
    },
    {
      user: {
        async findUnique({ where }: any) {
          if (where.id && state.user?.id === where.id) return state.user;
          return null;
        },
        async findFirst({ where }: any) {
          if (where.email && state.user?.email === where.email) return state.user;
          return null;
        },
        async create({ data }: any) {
          state.user = {
            id: 'user_1',
            ...data
          };
          return state.user;
        },
        async update({ data }: any) {
          state.user = {
            ...state.user,
            ...data
          };
          return state.user;
        },
        async findMany() {
          return [];
        }
      },
      adminProvisioningBinding: {
        async findUnique() {
          return null;
        },
        async upsert() {
          return {
            id: 'binding_1',
            userId: 'user_1'
          };
        }
      },
      adminAccessGrant: {
        async deleteMany() {
          state.grants = [];
          return {
            count: 0
          };
        },
        async createMany({ data }: any) {
          state.grants = data;
          return {
            count: data.length
          };
        },
        async findMany() {
          return state.grants;
        }
      }
    } as any
  );

  assert.equal(user.id, 'user_1');
  assert.equal(state.grants.length, 1);
  assert.equal(state.grants[0]?.scopeType, 'ASSET');
  assert.equal(state.grants[0]?.scopeId, 'asset_1');
});

test('scim upsert does NOT downgrade/disable a pre-existing UNBOUND account on email collision', async () => {
  // Account-takeover guard (#25): a SCIM POST with a NEW externalId but the email
  // of an existing locally-created ADMIN must bind the identity + refresh name
  // only — never silently apply the incoming (lower) role / inactive flag.
  const existing = {
    id: 'local_admin',
    email: 'admin@corp.local',
    name: 'Local Admin',
    role: 'ADMIN',
    isActive: true
  };
  let updateData: any = null;
  const db = {
    user: {
      async findUnique() {
        return null; // no binding-owned user for the new externalId
      },
      async findFirst({ where }: any) {
        return where.email === existing.email ? existing : null;
      },
      async create() {
        throw new Error('must not create a new user on email collision');
      },
      async update({ data }: any) {
        updateData = data;
        return { ...existing, ...data };
      },
      async findMany() {
        return [];
      }
    },
    adminProvisioningBinding: {
      async findUnique() {
        return null;
      },
      async upsert() {
        return { id: 'b1', userId: existing.id };
      }
    },
    adminAccessGrant: {
      async deleteMany() {
        return { count: 0 };
      },
      async createMany() {
        return { count: 0 };
      },
      async findMany() {
        return [];
      }
    }
  };

  const user = await upsertProvisionedAdminUser(
    {
      externalId: 'ext-NEW',
      email: 'admin@corp.local',
      name: 'Renamed By Scim',
      role: 'ANALYST',
      isActive: false
    },
    db as any
  );

  assert.equal(updateData.role, undefined, 'must not change role on unbound email adoption');
  assert.equal(
    updateData.isActive,
    undefined,
    'must not change isActive on unbound email adoption'
  );
  assert.equal(updateData.name, 'Renamed By Scim', 'name refresh is allowed');
  assert.equal(user.role, 'ADMIN', 'pre-existing ADMIN privilege preserved');
  assert.equal(user.isActive, true, 'pre-existing active state preserved');
});

test('scim upsert rejects an invalid role before touching the database', async () => {
  await assert.rejects(
    () =>
      upsertProvisionedAdminUser(
        { externalId: 'e', email: 'x@y.z', name: 'N', role: 'SUPERUSER' as never },
        {} as never
      ),
    (err: unknown) =>
      err instanceof ScimValidationError && /Invalid role/.test((err as Error).message)
  );
});

test('scim deprovision disables the user and clears grants, bindings, and sessions', async () => {
  const calls: Record<string, any> = {};

  const user = await deprovisionAdminUser(
    {
      userId: 'user_1'
    },
    {
      user: {
        async findUnique() {
          return {
            id: 'user_1',
            email: 'seat@nexusseoul.local'
          };
        },
        async update({ data }: any) {
          calls.userUpdate = data;
          return {
            id: 'user_1',
            name: 'Seat One',
            email: 'seat@nexusseoul.local',
            role: 'ANALYST',
            isActive: data.isActive
          };
        }
      },
      adminProvisioningBinding: {
        async deleteMany(args: any) {
          calls.bindingDelete = args.where;
          return { count: 1 };
        }
      },
      adminAccessGrant: {
        async deleteMany(args: any) {
          calls.grantDelete = args.where;
          return { count: 2 };
        }
      },
      adminSession: {
        async updateMany(args: any) {
          calls.sessionRevoke = args.where;
          return { count: 3 };
        }
      }
    } as any
  );

  assert.equal(calls.userUpdate.isActive, false);
  assert.deepEqual(calls.bindingDelete, { userId: 'user_1' });
  assert.deepEqual(calls.grantDelete, { userId: 'user_1' });
  assert.deepEqual(calls.sessionRevoke, { userId: 'user_1', revokedAt: null });
  assert.equal(user.isActive, false);
});
