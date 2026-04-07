import { NextResponse, type NextRequest } from 'next/server';
import {
  type AuthorizedAdminActor,
  getAdminAuthConfig,
  getRequiredAdminRoleForPath,
  hasRequiredAdminRole
} from '@/lib/security/admin-auth';
import { ADMIN_SESSION_COOKIE, parseAdminSessionToken } from '@/lib/security/admin-session';

function isPublicApiPath(pathname: string) {
  return pathname === '/api/inquiries' || pathname === '/api/admin/session' || pathname === '/api/admin/sso/login' || pathname === '/api/admin/sso/callback';
}

function isPublicAdminPath(pathname: string) {
  return pathname === '/admin/login';
}

function isAuthorizedOpsRequest(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/api/ops/')) {
    return false;
  }

  const expectedToken = process.env.OPS_CRON_TOKEN?.trim();
  if (!expectedToken) {
    return false;
  }

  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  const headerToken = request.headers.get('x-ops-cron-token')?.trim();
  return bearer === expectedToken || headerToken === expectedToken;
}

function unauthorizedResponse(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
  }

  const loginUrl = new URL('/admin/login', request.url);
  loginUrl.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

function forbiddenResponse(request: NextRequest, requiredRole: string) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: `Insufficient role. ${requiredRole} access required.` }, { status: 403 });
  }

  return new NextResponse(`Insufficient role. ${requiredRole} access required.`, {
    status: 403,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8'
    }
  });
}

export async function middleware(request: NextRequest) {
  if (isPublicApiPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (isPublicAdminPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (isAuthorizedOpsRequest(request)) {
    return NextResponse.next();
  }

  const config = getAdminAuthConfig();

  if (config.mode === 'disabled') {
    if (process.env.NODE_ENV === 'production') {
      return new NextResponse('Admin authentication is not configured', {
        status: 503,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8'
        }
      });
    }

    return NextResponse.next();
  }

  if (config.mode === 'misconfigured') {
    return new NextResponse('Admin authentication is misconfigured', {
      status: 503,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8'
      }
    });
  }

  const actor: AuthorizedAdminActor | null = await parseAdminSessionToken(
    request.cookies.get(ADMIN_SESSION_COOKIE)?.value
  );
  if (!actor) {
    return unauthorizedResponse(request);
  }

  const requiredRole = getRequiredAdminRoleForPath(request.nextUrl.pathname);
  if (!hasRequiredAdminRole(actor.role, requiredRole)) {
    return forbiddenResponse(request, requiredRole);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-admin-actor', actor.identifier);
  requestHeaders.set('x-admin-role', actor.role);
  requestHeaders.set('x-admin-required-role', requiredRole);
  if (actor.provider) requestHeaders.set('x-admin-auth-provider', actor.provider);
  if (actor.subject) requestHeaders.set('x-admin-subject', actor.subject);
  if (actor.email) requestHeaders.set('x-admin-email', actor.email);
  if (actor.userId) requestHeaders.set('x-admin-user-id', actor.userId);

  return NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/:path*'
  ]
};
