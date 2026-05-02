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

export type AdminAccessGrantSummary = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  scopeType: AdminAccessScopeType;
  scopeId: string;
  scopeLabel: string;
  createdAt: Date;
  updatedAt: Date;
};

type GrantManagementDb = {
  adminAccessGrant: {
    findMany(args: {
      orderBy?: Array<Record<string, 'asc' | 'desc'>>;
      include: { user: { select: { id: true; name: true; email: true; role: true } } };
    }): Promise<
      Array<{
        id: string;
        userId: string;
        scopeType: AdminAccessScopeType;
        scopeId: string;
        createdAt: Date;
        updatedAt: Date;
        user: { id: string; name: string; email: string; role: string };
      }>
    >;
    create(args: {
      data: {
        userId: string;
        scopeType: AdminAccessScopeType;
        scopeId: string;
      };
    }): Promise<{ id: string; userId: string; scopeType: AdminAccessScopeType; scopeId: string }>;
    delete(args: { where: { id: string } }): Promise<{ id: string }>;
    findUnique(args: { where: { id: string } }): Promise<{ id: string } | null>;
  };
  asset: {
    findMany(args: {
      where: { id: { in: string[] } };
      select: { id: true; assetCode: true; name: true };
    }): Promise<Array<{ id: string; assetCode: string; name: string }>>;
  };
  deal: {
    findMany(args: {
      where: { id: { in: string[] } };
      select: { id: true; dealCode: true; title: true };
    }): Promise<Array<{ id: string; dealCode: string; title: string }>>;
  };
  portfolio: {
    findMany(args: {
      where: { id: { in: string[] } };
      select: { id: true; name: true };
    }): Promise<Array<{ id: string; name: string }>>;
  };
  fund: {
    findMany(args: {
      where: { id: { in: string[] } };
      select: { id: true; name: true; code: true };
    }): Promise<Array<{ id: string; name: string; code: string }>>;
  };
};

/**
 * List every `AdminAccessGrant` row joined with the granted user. Resolves
 * each `scopeId` against its target table (Asset / Deal / Portfolio / Fund)
 * so the UI can render a human-readable label without round-tripping per
 * row.
 */
export async function listAdminAccessGrants(
  db: GrantManagementDb
): Promise<AdminAccessGrantSummary[]> {
  const grants = await db.adminAccessGrant.findMany({
    orderBy: [{ updatedAt: 'desc' }],
    include: { user: { select: { id: true, name: true, email: true, role: true } } }
  });

  if (grants.length === 0) return [];

  const idsByScope: Record<AdminAccessScopeType, string[]> = {
    [AdminAccessScopeType.ASSET]: [],
    [AdminAccessScopeType.DEAL]: [],
    [AdminAccessScopeType.PORTFOLIO]: [],
    [AdminAccessScopeType.FUND]: []
  };
  for (const grant of grants) {
    idsByScope[grant.scopeType].push(grant.scopeId);
  }

  const [assets, deals, portfolios, funds] = await Promise.all([
    idsByScope[AdminAccessScopeType.ASSET].length > 0
      ? db.asset.findMany({
          where: { id: { in: idsByScope[AdminAccessScopeType.ASSET] } },
          select: { id: true, assetCode: true, name: true }
        })
      : Promise.resolve([] as Array<{ id: string; assetCode: string; name: string }>),
    idsByScope[AdminAccessScopeType.DEAL].length > 0
      ? db.deal.findMany({
          where: { id: { in: idsByScope[AdminAccessScopeType.DEAL] } },
          select: { id: true, dealCode: true, title: true }
        })
      : Promise.resolve([] as Array<{ id: string; dealCode: string; title: string }>),
    idsByScope[AdminAccessScopeType.PORTFOLIO].length > 0
      ? db.portfolio.findMany({
          where: { id: { in: idsByScope[AdminAccessScopeType.PORTFOLIO] } },
          select: { id: true, name: true }
        })
      : Promise.resolve([] as Array<{ id: string; name: string }>),
    idsByScope[AdminAccessScopeType.FUND].length > 0
      ? db.fund.findMany({
          where: { id: { in: idsByScope[AdminAccessScopeType.FUND] } },
          select: { id: true, name: true, code: true }
        })
      : Promise.resolve([] as Array<{ id: string; name: string; code: string }>)
  ]);

  const labels: Record<AdminAccessScopeType, Map<string, string>> = {
    [AdminAccessScopeType.ASSET]: new Map(assets.map((a) => [a.id, `${a.assetCode} · ${a.name}`])),
    [AdminAccessScopeType.DEAL]: new Map(deals.map((d) => [d.id, `${d.dealCode} · ${d.title}`])),
    [AdminAccessScopeType.PORTFOLIO]: new Map(portfolios.map((p) => [p.id, p.name])),
    [AdminAccessScopeType.FUND]: new Map(funds.map((f) => [f.id, `${f.code} · ${f.name}`]))
  };

  return grants.map((grant) => ({
    id: grant.id,
    userId: grant.userId,
    userName: grant.user.name,
    userEmail: grant.user.email,
    userRole: grant.user.role,
    scopeType: grant.scopeType,
    scopeId: grant.scopeId,
    scopeLabel: labels[grant.scopeType].get(grant.scopeId) ?? grant.scopeId,
    createdAt: grant.createdAt,
    updatedAt: grant.updatedAt
  }));
}

/**
 * Create a row-level access grant. Idempotent on the unique
 * `(userId, scopeType, scopeId)` triple — re-creating the same grant
 * throws a Prisma uniqueness error which the caller can surface as a
 * 409 response.
 */
export async function grantAdminAccessScope(
  input: { userId: string; scopeType: AdminAccessScopeType; scopeId: string },
  db: Pick<GrantManagementDb['adminAccessGrant'], 'create'>
) {
  return db.create({
    data: {
      userId: input.userId,
      scopeType: input.scopeType,
      scopeId: input.scopeId
    }
  });
}

export async function revokeAdminAccessGrant(
  grantId: string,
  db: Pick<GrantManagementDb['adminAccessGrant'], 'delete' | 'findUnique'>
) {
  const existing = await db.findUnique({ where: { id: grantId } });
  if (!existing) {
    throw new Error('Access grant not found.');
  }
  await db.delete({ where: { id: grantId } });
  return existing;
}
