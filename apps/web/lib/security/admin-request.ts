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

  if (!identifier || !role) {
    return null;
  }

  return {
    identifier,
    role,
    provider: (headers.get('x-admin-auth-provider')?.trim() as AuthorizedAdminActor['provider'] | undefined) ?? undefined,
    subject: headers.get('x-admin-subject')?.trim() || null,
    email: headers.get('x-admin-email')?.trim() || null,
    userId: headers.get('x-admin-user-id')?.trim() || null
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
      };
    }): Promise<{ id: string; isActive: boolean } | null>;
    findUnique(args: {
      where: {
        id: string;
      };
      select: {
        id: true;
        isActive: true;
      };
    }): Promise<{ id: string; isActive: boolean } | null>;
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

  if (actor.provider === 'basic' && options?.allowBasic === false) {
    return null;
  }

  const seat =
    actor.userId && actor.provider === 'session'
      ? await db.user.findUnique({
          where: {
            id: actor.userId
          },
          select: {
            id: true,
            isActive: true
          }
        })
      : await resolveAdminActorSeat(actor, db);

  if (options?.requireActiveSeat && actor.provider !== 'basic' && !seat) {
    return null;
  }

  if (options?.requireActiveSeat && seat && seat.isActive === false) {
    return null;
  }

  return {
    ...actor,
    userId: actor.userId ?? seat?.id ?? null
  };
}
