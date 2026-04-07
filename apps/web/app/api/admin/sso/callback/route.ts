import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveAdminActorSeat, upsertAdminIdentityBindingForActor } from '@/lib/security/admin-identity';
import { ADMIN_SESSION_COOKIE, createAdminSessionToken, getAdminSessionCookieOptions } from '@/lib/security/admin-session';
import {
  ADMIN_SSO_NEXT_COOKIE,
  ADMIN_SSO_STATE_COOKIE,
  ADMIN_SSO_VERIFIER_COOKIE,
  createAdminSsoCookieOptions,
  exchangeAdminSsoCode,
  fetchAdminSsoProfile,
  getAdminSsoConfig,
  mapAdminSsoClaimsToActor
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
    return NextResponse.redirect(new URL(`/admin/login?error=${encodeURIComponent(error)}`, request.url));
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get(ADMIN_SSO_STATE_COOKIE)?.value;
  const storedVerifier = cookieStore.get(ADMIN_SSO_VERIFIER_COOKIE)?.value;
  const nextPath = cookieStore.get(ADMIN_SSO_NEXT_COOKIE)?.value;

  function clearSsoCookies(response: NextResponse) {
    response.cookies.set(ADMIN_SSO_STATE_COOKIE, '', { ...createAdminSsoCookieOptions(), maxAge: 0 });
    response.cookies.set(ADMIN_SSO_VERIFIER_COOKIE, '', { ...createAdminSsoCookieOptions(), maxAge: 0 });
    response.cookies.set(ADMIN_SSO_NEXT_COOKIE, '', { ...createAdminSsoCookieOptions(), maxAge: 0 });
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
      return clearSsoCookies(NextResponse.redirect(new URL('/admin/login?error=sso_unmapped', request.url)));
    }
    if (actorSeat && actorSeat.isActive === false) {
      return clearSsoCookies(NextResponse.redirect(new URL('/admin/login?error=sso_inactive', request.url)));
    }

    const sessionToken = await createAdminSessionToken({
      ...actor,
      userId: actorSeat?.id ?? null
    });
    if (!sessionToken) {
      return NextResponse.redirect(new URL('/admin/login?error=sso_session', request.url));
    }

    const response = NextResponse.redirect(new URL(nextPath || '/admin', request.url));
    response.cookies.set(ADMIN_SESSION_COOKIE, sessionToken, getAdminSessionCookieOptions());
    return clearSsoCookies(response);
  } catch (caughtError) {
    const response = clearSsoCookies(NextResponse.redirect(new URL('/admin/login?error=sso_exchange', request.url)));
    response.headers.set('x-sso-error', caughtError instanceof Error ? caughtError.message : 'SSO exchange failed');
    return response;
  }
}
