import assert from 'node:assert/strict';
import test from 'node:test';
import { deprovisionAdminUser, getAdminScimConfig, upsertProvisionedAdminUser } from '@/lib/security/admin-scim';

test('admin scim config is enabled only when token exists', () => {
  assert.equal(getAdminScimConfig({ ADMIN_SCIM_TOKEN: 'token' } as unknown as NodeJS.ProcessEnv).enabled, true);
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
