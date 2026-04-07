import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authorizeAdminCredentials, getAdminAuthConfig } from '@/lib/security/admin-auth';
import { resolveAdminActorSeat } from '@/lib/security/admin-identity';
import { resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  getAdminSessionCookieOptions,
  parseAdminSessionToken
} from '@/lib/security/admin-session';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        user?: string;
        password?: string;
      }
    | null;

  const user = body?.user?.trim() ?? '';
  const password = body?.password ?? '';
  const config = getAdminAuthConfig();

  if (config.mode !== 'configured') {
    return NextResponse.json({ error: 'Admin auth is not configured for operator sessions.' }, { status: 503 });
  }

  const actor = authorizeAdminCredentials(user, password, config);
  if (!actor) {
    return NextResponse.json({ error: 'Invalid operator credentials.' }, { status: 401 });
  }

  const actorSeat = await resolveAdminActorSeat(actor, prisma);
  if (actorSeat && actorSeat.isActive === false) {
    return NextResponse.json({ error: 'This operator seat is inactive.' }, { status: 403 });
  }

  const allowUnboundBrowserSession =
    (process.env.ADMIN_ALLOW_UNBOUND_BROWSER_SESSION?.trim().toLowerCase() ?? 'false') === 'true';
  if (!actorSeat && !allowUnboundBrowserSession) {
    return NextResponse.json(
      {
        error:
          'Browser operator sessions require a canonical active seat. Use a credential that maps to a seeded operator or enable ADMIN_ALLOW_UNBOUND_BROWSER_SESSION explicitly.'
      },
      { status: 403 }
    );
  }

  const token = await createAdminSessionToken({
    ...actor,
    userId: actorSeat?.id ?? null
  });
  if (!token) {
    return NextResponse.json({ error: 'Session signing is not configured.' }, { status: 503 });
  }

  const response = NextResponse.json({
    ok: true,
    actor
  });
  response.cookies.set(ADMIN_SESSION_COOKIE, token, getAdminSessionCookieOptions());
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, '', {
    ...getAdminSessionCookieOptions(),
    maxAge: 0
  });
  return response;
}

export async function GET() {
  const cookieStore = await cookies();
  const tokenActor = await parseAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  const verifiedActor = tokenActor
    ? await resolveVerifiedAdminActorFromHeaders(
        {
          get(name: string) {
            if (name === 'x-admin-actor') return tokenActor.identifier;
            if (name === 'x-admin-role') return tokenActor.role;
            if (name === 'x-admin-auth-provider') return tokenActor.provider ?? null;
            if (name === 'x-admin-subject') return tokenActor.subject ?? null;
            if (name === 'x-admin-email') return tokenActor.email ?? null;
            if (name === 'x-admin-user-id') return tokenActor.userId ?? null;
            return null;
          }
        },
        prisma,
        {
          allowBasic: false,
          requireActiveSeat: true
        }
      )
    : null;
  return NextResponse.json({
    hasSession: Boolean(verifiedActor)
  });
}
