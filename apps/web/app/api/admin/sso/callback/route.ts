import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/observability/logger';
import {
  resolveAdminActorSeat,
  upsertAdminIdentityBindingForActor
} from '@/lib/security/admin-identity';
import {
  ADMIN_SESSION_COOKIE,
  createPersistedAdminSession,
  createAdminSessionToken,
  getAdminSessionCookieOptions
} from '@/lib/security/admin-session';
import {
  ADMIN_SSO_NEXT_COOKIE,
  ADMIN_SSO_STATE_COOKIE,
  ADMIN_SSO_VERIFIER_COOKIE,
  createAdminSsoCookieOptions,
  exchangeAdminSsoCode,
  fetchAdminSsoProfile,
  getAdminSsoConfig,
  mapAdminSsoClaimsToActor,
  sanitizeNextPath
} from '@/lib/security/admin-sso';

export async function GET(request: Request) {
  const config = getAdminSsoConfig();
  if (config.mode !== 'configured') {
    return NextResponse.redirect(new URL('/admin/login?error=sso_unavailable', request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      new URL(`/admin/login?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get(ADMIN_SSO_STATE_COOKIE)?.value;
  const storedVerifier = cookieStore.get(ADMIN_SSO_VERIFIER_COOKIE)?.value;
  const nextPath = cookieStore.get(ADMIN_SSO_NEXT_COOKIE)?.value;

  function clearSsoCookies(response: NextResponse) {
    response.cookies.set(ADMIN_SSO_STATE_COOKIE, '', {
      ...createAdminSsoCookieOptions(),
      maxAge: 0
    });
    response.cookies.set(ADMIN_SSO_VERIFIER_COOKIE, '', {
      ...createAdminSsoCookieOptions(),
      maxAge: 0
    });
    response.cookies.set(ADMIN_SSO_NEXT_COOKIE, '', {
      ...createAdminSsoCookieOptions(),
      maxAge: 0
    });
    return response;
  }

  if (!code || !state || !storedState || state !== storedState || !storedVerifier) {
    return NextResponse.redirect(new URL('/admin/login?error=sso_state', request.url));
  }

  try {
    const token = await exchangeAdminSsoCode(config, {
      code,
      verifier: storedVerifier
    });
    const claims = await fetchAdminSsoProfile(config, token.accessToken);
    const actor = mapAdminSsoClaimsToActor(claims, config);

    if (!actor) {
      return NextResponse.redirect(new URL('/admin/login?error=sso_claims', request.url));
    }

    await upsertAdminIdentityBindingForActor(actor, prisma);
    const actorSeat = await resolveAdminActorSeat(actor, prisma);
    if (!actorSeat) {
      return clearSsoCookies(
        NextResponse.redirect(new URL('/admin/login?error=sso_unmapped', request.url))
      );
    }
    if (actorSeat && actorSeat.isActive === false) {
      return clearSsoCookies(
        NextResponse.redirect(new URL('/admin/login?error=sso_inactive', request.url))
      );
    }

    const persistedSession = await createPersistedAdminSession(
      {
        ...actor,
        userId: actorSeat?.id ?? null,
        sessionVersion: actorSeat?.sessionVersion ?? null
      },
      prisma
    );

    const sessionToken = await createAdminSessionToken({
      ...actor,
      userId: actorSeat?.id ?? null,
      sessionId: persistedSession.id,
      sessionVersion: actorSeat?.sessionVersion ?? null
    });
    if (!sessionToken) {
      return NextResponse.redirect(new URL('/admin/login?error=sso_session', request.url));
    }

    // Re-sanitize the cookie value defensively (it should already be safe from
    // the login route, but the cookie is client-visible/tamperable).
    const safeNextPath = sanitizeNextPath(nextPath);
    const response = NextResponse.redirect(new URL(safeNextPath, request.url));
    response.cookies.set(ADMIN_SESSION_COOKIE, sessionToken, getAdminSessionCookieOptions());
    return clearSsoCookies(response);
  } catch (caughtError) {
    // Log the real exchange error server-side; never echo it back on this
    // pre-auth redirect (the generic ?error=sso_exchange query is the signal).
    logger.warn('sso_exchange_failed', {
      error: caughtError instanceof Error ? caughtError.message : 'unknown'
    });
    return clearSsoCookies(
      NextResponse.redirect(new URL('/admin/login?error=sso_exchange', request.url))
    );
  }
}
