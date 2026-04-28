import { NextResponse, type NextRequest } from 'next/server';
import {
  type AuthorizedAdminActor,
  getAdminAuthConfig,
  getRequiredAdminRoleForPath,
  hasRequiredAdminRole
} from '@/lib/security/admin-auth';
import { ADMIN_SESSION_COOKIE, parseAdminSessionToken } from '@/lib/security/admin-session';
import { applyEdgeRateLimit, isAllowedIp, resolveClientIp } from '@/lib/security/edge-protection';

function isPublicApiPath(pathname: string) {
  return (
    pathname === '/api/health' ||
    pathname === '/api/inquiries' ||
    pathname === '/api/admin/session' ||
    pathname === '/api/admin/sso/login' ||
    pathname === '/api/admin/sso/callback' ||
    pathname.startsWith('/api/admin/scim/')
  );
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

  const bearer = request.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '')
    .trim();
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
    return NextResponse.json(
      { error: `Insufficient role. ${requiredRole} access required.` },
      { status: 403 }
    );
  }

  return new NextResponse(`Insufficient role. ${requiredRole} access required.`, {
    status: 403,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8'
    }
  });
}

function generateRequestId(): string {
  // 16 random bytes encoded as hex; matches the shape of common
  // observability platforms' trace ids (xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx).
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const clientIp = resolveClientIp(request);
  const inboundRequestId = request.headers.get('x-request-id')?.trim();
  const requestId =
    inboundRequestId && /^[a-zA-Z0-9._-]{8,128}$/.test(inboundRequestId)
      ? inboundRequestId
      : generateRequestId();

  if (!isAllowedIp(pathname, clientIp)) {
    return new NextResponse('IP not on allowlist for this surface', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Request-Id': requestId }
    });
  }

  const rateDecision = applyEdgeRateLimit(pathname, clientIp);
  if (rateDecision.retryAfterMs !== null) {
    const retryAfterSec = Math.max(1, Math.ceil(rateDecision.retryAfterMs / 1000));
    return new NextResponse('Too Many Requests', {
      status: 429,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Retry-After': String(retryAfterSec),
        'X-RateLimit-Category': rateDecision.category ?? 'unknown',
        'X-Request-Id': requestId
      }
    });
  }

  if (isPublicApiPath(pathname)) {
    const passthrough = NextResponse.next();
    passthrough.headers.set('X-Request-Id', requestId);
    return passthrough;
  }

  if (isPublicAdminPath(pathname)) {
    const passthrough = NextResponse.next();
    passthrough.headers.set('X-Request-Id', requestId);
    return passthrough;
  }

  if (isAuthorizedOpsRequest(request)) {
    const passthrough = NextResponse.next();
    passthrough.headers.set('X-Request-Id', requestId);
    return passthrough;
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
  requestHeaders.set('x-request-id', requestId);
  requestHeaders.set('x-admin-actor', actor.identifier);
  requestHeaders.set('x-admin-role', actor.role);
  requestHeaders.set('x-admin-required-role', requiredRole);
  if (actor.provider) requestHeaders.set('x-admin-auth-provider', actor.provider);
  if (actor.subject) requestHeaders.set('x-admin-subject', actor.subject);
  if (actor.email) requestHeaders.set('x-admin-email', actor.email);
  if (actor.userId) requestHeaders.set('x-admin-user-id', actor.userId);
  if (actor.sessionId) requestHeaders.set('x-admin-session-id', actor.sessionId);
  if (typeof actor.sessionVersion === 'number')
    requestHeaders.set('x-admin-session-version', String(actor.sessionVersion));

  const response = NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });
  response.headers.set('X-Request-Id', requestId);
  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/api/:path*']
};
