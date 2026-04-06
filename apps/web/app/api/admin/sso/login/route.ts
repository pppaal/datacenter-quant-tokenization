import { NextResponse } from 'next/server';
import {
  ADMIN_SSO_NEXT_COOKIE,
  ADMIN_SSO_STATE_COOKIE,
  ADMIN_SSO_VERIFIER_COOKIE,
  buildAdminSsoAuthorizationUrl,
  createAdminSsoCookieOptions,
  createAdminSsoRandomValue,
  getAdminSsoConfig
} from '@/lib/security/admin-sso';

export async function GET(request: Request) {
  const config = getAdminSsoConfig();
  if (config.mode !== 'configured') {
    return NextResponse.redirect(new URL('/admin/login?error=sso_unavailable', request.url));
  }

  try {
    const state = createAdminSsoRandomValue();
    const verifier = createAdminSsoRandomValue();
    const nextPath = new URL(request.url).searchParams.get('next');
    const redirectUrl = await buildAdminSsoAuthorizationUrl(config, {
      state,
      verifier
    });

    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set(ADMIN_SSO_STATE_COOKIE, state, createAdminSsoCookieOptions());
    response.cookies.set(ADMIN_SSO_VERIFIER_COOKIE, verifier, createAdminSsoCookieOptions());
    if (nextPath) {
      response.cookies.set(ADMIN_SSO_NEXT_COOKIE, nextPath, createAdminSsoCookieOptions(process.env, 900));
    }
    return response;
  } catch (error) {
    const target = new URL('/admin/login?error=sso_config', request.url);
    target.searchParams.set('detail', error instanceof Error ? error.message : 'Unable to initialize SSO.');
    return NextResponse.redirect(target);
  }
}
