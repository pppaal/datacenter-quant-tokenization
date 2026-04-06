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
    role,
    provider: (headers.get('x-admin-auth-provider')?.trim() as AuthorizedAdminActor['provider'] | undefined) ?? undefined,
    subject: headers.get('x-admin-subject')?.trim() || null,
    email: headers.get('x-admin-email')?.trim() || null
  };
}

export function getRequestIpAddress(headers: HeaderCarrier) {
  const forwardedFor = headers.get('x-forwarded-for')?.trim();
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() ?? null;
  }

  return headers.get('x-real-ip')?.trim() ?? null;
}
