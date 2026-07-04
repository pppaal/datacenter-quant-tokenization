import { NextResponse } from 'next/server';
import {
  getInvestorTokenCookieOptions,
  INVESTOR_TOKEN_COOKIE,
  verifyInvestorToken
} from '@/lib/security/investor-token';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * LP-portal access redemption.
 *
 * Turns an admin-issued signed token into the portal cookie so the LP lands on
 * a rendered page instead of a raw API. Two entry shapes:
 *   - GET  /portal/access?token=...   — the shareable magic link (issued from
 *     /admin/investors); redirects to /portal immediately, so the token never
 *     stays in the visible URL.
 *   - POST /portal/access (form field `token`) — the paste-a-token form shown
 *     on /portal when no valid cookie is present.
 * GET ?signout=1 clears the cookie. Verification is the same HMAC check the
 * middleware applies to /api/portal/* — an invalid/expired token sets nothing.
 */

function redirectToPortal(request: Request, params?: { error?: string }) {
  const url = new URL('/portal', request.url);
  if (params?.error) url.searchParams.set('error', params.error);
  // 303 so a POST redemption becomes a GET on /portal.
  return NextResponse.redirect(url, 303);
}

async function redeem(request: Request, token: string | null) {
  const verified = await verifyInvestorToken(token);
  if (!verified) {
    return redirectToPortal(request, { error: 'invalid-token' });
  }
  const response = redirectToPortal(request);
  response.cookies.set(INVESTOR_TOKEN_COOKIE, token as string, getInvestorTokenCookieOptions());
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  if (url.searchParams.get('signout') === '1') {
    const response = redirectToPortal(request);
    response.cookies.set(INVESTOR_TOKEN_COOKIE, '', {
      ...getInvestorTokenCookieOptions(),
      maxAge: 0
    });
    return response;
  }

  return redeem(request, url.searchParams.get('token'));
}

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  const token = formData?.get('token');
  return redeem(request, typeof token === 'string' ? token.trim() : null);
}
