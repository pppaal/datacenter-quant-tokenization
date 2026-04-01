import type { AdminAccessRole, AuthorizedAdminActor } from '@/lib/security/admin-auth';

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
    role
  };
}

export function getRequestIpAddress(headers: HeaderCarrier) {
  const forwardedFor = headers.get('x-forwarded-for')?.trim();
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() ?? null;
  }

  return headers.get('x-real-ip')?.trim() ?? null;
}
