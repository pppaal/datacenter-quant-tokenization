import { NextResponse } from 'next/server';
import {
  ADMIN_SSO_NEXT_COOKIE,
  ADMIN_SSO_STATE_COOKIE,
  ADMIN_SSO_VERIFIER_COOKIE,
  buildAdminSsoAuthorizationUrl,
  createAdminSsoCookieOptions,
  createAdminSsoRandomValue,
  getAdminSsoConfig,
  sanitizeNextPath
} from '@/lib/security/admin-sso';
import { reportError } from '@/lib/observability/logger';

export async function GET(request: Request) {
  const config = getAdminSsoConfig();
  if (config.mode !== 'configured') {
    return NextResponse.redirect(new URL('/admin/login?error=sso_unavailable', request.url));
  }

  try {
    const state = createAdminSsoRandomValue();
    const verifier = createAdminSsoRandomValue();
    const requestedNext = new URL(request.url).searchParams.get('next');
    // Validate the attacker-controllable `next` before persisting it in a
    // cookie; an unvalidated value enables a post-auth open redirect.
    const nextPath = requestedNext ? sanitizeNextPath(requestedNext) : null;
    const redirectUrl = await buildAdminSsoAuthorizationUrl(config, {
      state,
      verifier
    });

    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set(ADMIN_SSO_STATE_COOKIE, state, createAdminSsoCookieOptions());
    response.cookies.set(ADMIN_SSO_VERIFIER_COOKIE, verifier, createAdminSsoCookieOptions());
    if (nextPath) {
      response.cookies.set(
        ADMIN_SSO_NEXT_COOKIE,
        nextPath,
        createAdminSsoCookieOptions(process.env, 900)
      );
    }
    return response;
  } catch (error) {
    // Never echo the raw error into the browser-visible redirect URL — SSO
    // init failures can embed OIDC issuer/discovery/config details. Report it
    // server-side and show a fixed, generic detail instead.
    void reportError(error, { route: '/api/admin/sso/login' });
    const target = new URL('/admin/login?error=sso_config', request.url);
    target.searchParams.set('detail', 'Unable to initialize SSO.');
    return NextResponse.redirect(target);
  }
}
