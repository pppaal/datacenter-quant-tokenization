import { AdminAccessScopeType } from '@prisma/client';
import type { AuthorizedAdminActor } from '@/lib/security/admin-auth';
import { env } from '@/lib/env';
import { isRealProduction } from '@/lib/runtime-env';

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

/**
 * How an un-granted non-ADMIN actor is treated for a given scope check.
 *
 *  - `'read'`     — the un-granted actor is UNRESTRICTED (fail-open): scope
 *                   grants are an opt-in allowlist that only ever *narrows*
 *                   visibility. Keeps un-granted/SCIM-provisioned analysts able
 *                   to SEE assets/deals/funds (so they aren't locked out of
 *                   everything), while a granted analyst is narrowed to their
 *                   grants. This is the historical behavior; reads default here.
 *
 *  - `'mutation'` — the un-granted actor is DENIED (fail-closed) by default:
 *                   least-privilege for writes. An ADMIN must explicitly grant
 *                   the scope before a non-ADMIN can mutate it ("ADMIN-must-grant"
 *                   model). A granted analyst may mutate only their granted
 *                   scopes. This is the secure default; all `assertActorScopeAccess`
 *                   callers (every one is a write path) use it.
 */
export type ScopeAccessMode = 'read' | 'mutation';

/**
 * Legacy escape hatch: when `ADMIN_SCOPE_ALLOW_UNGRANTED_MUTATIONS` is truthy,
 * un-granted mutations fall back to the historical fail-OPEN behavior. This is a
 * migration aid ONLY — it lets an org that hasn't provisioned per-scope grants
 * yet keep working while they roll grants out. The DEFAULT (unset) is the
 * secure fail-CLOSED behavior. Production should leave this unset.
 *
 * SELF-ENFORCING: the hatch is hard-disabled under real production regardless of
 * the env value, so a leaked/copied prod env can never re-open fail-open writes.
 * This matches every other dangerous flag (BLOCKCHAIN_MOCK_MODE, local storage,
 * KYC mock, seed guard) which all self-guard via `isRealProduction()`. The
 * production preflight also forbids it as a second layer.
 */
function ungrantedMutationsAllowed(): boolean {
  if (isRealProduction()) return false;
  return env().ADMIN_SCOPE_ALLOW_UNGRANTED_MUTATIONS;
}

export async function canActorAccessScope(
  actor: AuthorizedAdminActor | null | undefined,
  scopeType: AdminAccessScopeType,
  scopeId: string,
  db: AccessGrantDb,
  mode: ScopeAccessMode = 'read'
) {
  if (!actor) {
    return false;
  }

  if (actor.role === 'ADMIN') {
    return true;
  }

  // The highest-consequence, irreversible actions are NOT governed by this
  // function: tokenization mint/burn/forceTransfer, on-chain valuation
  // anchoring, and the KYC→chain bridge are ADMIN-gated at the route layer
  // (see getRequiredAdminRoleForPath), so an un-granted ANALYST cannot reach
  // them regardless of this allowlist.
  const grantedScopeIds = await listGrantedScopeIdsForUser(actor.userId, scopeType, db);

  if (grantedScopeIds.length === 0) {
    // No grants for this scope type. Reads stay opt-in (fail-open) so analysts
    // aren't locked out of visibility; mutations fail-CLOSED (least-privilege)
    // unless the documented legacy escape hatch is enabled.
    if (mode === 'mutation') {
      return ungrantedMutationsAllowed();
    }
    return true;
  }

  return grantedScopeIds.includes(scopeId);
}

/**
 * Assert access to a scope, throwing when denied.
 *
 * `mode` selects the un-granted behavior (see `ScopeAccessMode`):
 *   - pass `'mutation'` from WRITE handlers (POST/PATCH/PUT/DELETE) to get the
 *     fail-CLOSED least-privilege model (un-granted non-ADMIN denied);
 *   - pass `'read'` (the default) from GET handlers to keep visibility opt-in.
 *
 * NOTE (scoped migration): the default is `'read'` so this change is strictly
 * non-breaking for the EXISTING callers — `assertActorScopeAccess` is currently
 * used from several GET read handlers (deals/[id], assets/[id],
 * funds/[id]/investor-report, deals/[id]/workpaper) as well as the write
 * handlers, and they all call it 4-arg. Defaulting to `'mutation'` here would
 * fail-close those reads for un-granted analysts (an availability regression).
 * The fail-CLOSED machinery + secure env default are in place; flipping the
 * write call sites to `mode: 'mutation'` is a per-route follow-up (each write
 * route passes `'mutation'`; the GET routes keep the default). Until then a
 * write caller opts in explicitly, e.g.
 * `assertActorScopeAccess(actor, scope, id, prisma, 'mutation')`.
 */
export async function assertActorScopeAccess(
  actor: AuthorizedAdminActor | null | undefined,
  scopeType: AdminAccessScopeType,
  scopeId: string,
  db: AccessGrantDb,
  mode: ScopeAccessMode = 'read'
) {
  const allowed = await canActorAccessScope(actor, scopeType, scopeId, db, mode);
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
