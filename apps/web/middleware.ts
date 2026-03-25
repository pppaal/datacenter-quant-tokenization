import { NextResponse, type NextRequest } from 'next/server';
import { getAdminAuthConfig, isAdminAuthorized } from '@/lib/security/admin-auth';

function unauthorizedResponse(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Admin authentication required' },
      {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="admin"'
        }
      }
    );
  }

  return new NextResponse('Admin authentication required', {
    status: 401,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'WWW-Authenticate': 'Basic realm="admin"'
    }
  });
}

export function middleware(request: NextRequest) {
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

  if (isAdminAuthorized(request.headers.get('authorization'), config)) {
    return NextResponse.next();
  }

  return unauthorizedResponse(request);
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/assets/:path*',
    '/api/valuations/:path*',
    '/api/documents/:path*',
    '/api/readiness/:path*',
    '/api/registry/:path*'
  ]
};
