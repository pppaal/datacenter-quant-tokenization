import type { AdminAccessRole, AuthorizedAdminActor } from '@/lib/security/admin-auth';
import { resolveAdminActorSeat } from '@/lib/security/admin-identity';

type HeaderCarrier =
  | Headers
  | {
      get(name: string): string | null | undefined;
    };

export function getAdminActorFromHeaders(headers: HeaderCarrier): AuthorizedAdminActor | null {
  const identifier = headers.get('x-admin-actor')?.trim();
  const role = headers.get('x-admin-role')?.trim() as AdminAccessRole | undefined;
  const sessionVersionValue = headers.get('x-admin-session-version')?.trim();
  const parsedSessionVersion =
    sessionVersionValue && Number.isFinite(Number(sessionVersionValue))
      ? Number(sessionVersionValue)
      : null;

  if (!identifier || !role) {
    return null;
  }

  return {
    identifier,
    role,
    provider:
      (headers.get('x-admin-auth-provider')?.trim() as
        | AuthorizedAdminActor['provider']
        | undefined) ?? undefined,
    subject: headers.get('x-admin-subject')?.trim() || null,
    email: headers.get('x-admin-email')?.trim() || null,
    userId: headers.get('x-admin-user-id')?.trim() || null,
    sessionId: headers.get('x-admin-session-id')?.trim() || null,
    sessionVersion: parsedSessionVersion
  };
}

export function getRequestIpAddress(headers: HeaderCarrier) {
  const forwardedFor = headers.get('x-forwarded-for')?.trim();
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() ?? null;
  }

  return headers.get('x-real-ip')?.trim() ?? null;
}

type AdminSeatLookupDb = {
  user: {
    findFirst(args: {
      where: {
        OR: Array<{ email: string } | { name: string }>;
      };
      select: {
        id: true;
        isActive: true;
        sessionVersion?: true;
      };
    }): Promise<{ id: string; isActive: boolean; sessionVersion?: number } | null>;
    findUnique(args: {
      where: {
        id: string;
      };
      select: {
        id: true;
        isActive: true;
        sessionVersion?: true;
      };
    }): Promise<{ id: string; isActive: boolean; sessionVersion?: number } | null>;
  };
  adminIdentityBinding?: {
    findUnique(args: {
      where: {
        provider_subject: {
          provider: string;
          subject: string;
        };
      };
      select: {
        userId: true;
      };
    }): Promise<{ userId: string | null } | null>;
  };
  adminSession?: {
    findUnique(args: {
      where: {
        id: string;
      };
      select: {
        id: true;
        userId: true;
        expiresAt: true;
        revokedAt: true;
        sessionVersion: true;
      };
    }): Promise<{
      id: string;
      userId: string | null;
      expiresAt: Date;
      revokedAt: Date | null;
      sessionVersion: number | null;
    } | null>;
  };
};

export async function resolveVerifiedAdminActorFromHeaders(
  headers: HeaderCarrier,
  db: AdminSeatLookupDb,
  options?: {
    allowBasic?: boolean;
    requireActiveSeat?: boolean;
  }
): Promise<AuthorizedAdminActor | null> {
  const actor = getAdminActorFromHeaders(headers);
  if (!actor) {
    return null;
  }

  const isPersistedSessionActor = Boolean(actor.sessionId);
  const persistedSessionId = actor.sessionId ?? null;

  if (actor.provider === 'basic' && options?.allowBasic === false && !isPersistedSessionActor) {
    return null;
  }

  const persistedSession =
    isPersistedSessionActor && db.adminSession && persistedSessionId
      ? await db.adminSession.findUnique({
          where: {
            id: persistedSessionId
          },
          select: {
            id: true,
            userId: true,
            expiresAt: true,
            revokedAt: true,
            sessionVersion: true
          }
        })
      : null;

  if (isPersistedSessionActor && !persistedSession) {
    return null;
  }

  if (
    isPersistedSessionActor &&
    persistedSession &&
    (persistedSession.revokedAt != null || persistedSession.expiresAt.getTime() <= Date.now())
  ) {
    return null;
  }

  const seat =
    actor.userId && isPersistedSessionActor
      ? await db.user.findUnique({
          where: {
            id: actor.userId
          },
          select: {
            id: true,
            isActive: true,
            sessionVersion: true
          }
        })
      : await resolveAdminActorSeat(actor, db);

  if (options?.requireActiveSeat && actor.provider !== 'basic' && !seat) {
    return null;
  }

  if (options?.requireActiveSeat && seat && seat.isActive === false) {
    return null;
  }

  if (
    options?.requireActiveSeat &&
    isPersistedSessionActor &&
    seat &&
    persistedSession &&
    persistedSession.userId &&
    seat.id !== persistedSession.userId
  ) {
    return null;
  }

  if (
    options?.requireActiveSeat &&
    isPersistedSessionActor &&
    seat &&
    typeof seat.sessionVersion === 'number' &&
    actor.sessionVersion !== seat.sessionVersion
  ) {
    return null;
  }

  return {
    ...actor,
    userId: actor.userId ?? seat?.id ?? null,
    sessionId: actor.sessionId ?? persistedSession?.id ?? null,
    sessionVersion: actor.sessionVersion ?? seat?.sessionVersion ?? null
  };
}
