import { AdminAccessScopeType } from '@prisma/client';
import type { AuthorizedAdminActor } from '@/lib/security/admin-auth';

type AccessGrantDb = {
  adminAccessGrant: {
    findMany(args: {
      where: {
        userId: string;
        scopeType: AdminAccessScopeType;
      };
      select: {
        scopeId: true;
      };
    }): Promise<Array<{ scopeId: string }>>;
  };
};

export async function listGrantedScopeIdsForUser(
  userId: string | null | undefined,
  scopeType: AdminAccessScopeType,
  db: AccessGrantDb
) {
  if (!userId) {
    return [];
  }

  const grants = await db.adminAccessGrant.findMany({
    where: {
      userId,
      scopeType
    },
    select: {
      scopeId: true
    }
  });

  return grants.map((grant) => grant.scopeId);
}

export async function hasScopedAccessRestriction(
  userId: string | null | undefined,
  scopeType: AdminAccessScopeType,
  db: AccessGrantDb
) {
  const grantedScopeIds = await listGrantedScopeIdsForUser(userId, scopeType, db);
  return grantedScopeIds.length > 0;
}

export async function canActorAccessScope(
  actor: AuthorizedAdminActor | null | undefined,
  scopeType: AdminAccessScopeType,
  scopeId: string,
  db: AccessGrantDb
) {
  if (!actor) {
    return false;
  }

  if (actor.role === 'ADMIN') {
    return true;
  }

  const grantedScopeIds = await listGrantedScopeIdsForUser(actor.userId, scopeType, db);
  if (grantedScopeIds.length === 0) {
    return true;
  }

  return grantedScopeIds.includes(scopeId);
}

export async function assertActorScopeAccess(
  actor: AuthorizedAdminActor | null | undefined,
  scopeType: AdminAccessScopeType,
  scopeId: string,
  db: AccessGrantDb
) {
  const allowed = await canActorAccessScope(actor, scopeType, scopeId, db);
  if (!allowed) {
    throw new Error(`Access to ${scopeType.toLowerCase()} scope is not granted for this operator.`);
  }
}

export function filterRowsByGrantedScopeIds<T extends { id: string }>(
  rows: T[],
  grantedScopeIds: string[]
) {
  if (grantedScopeIds.length === 0) {
    return rows;
  }

  const grantedSet = new Set(grantedScopeIds);
  return rows.filter((row) => grantedSet.has(row.id));
}
