import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { authorizeAdminCredentials, getAdminAuthConfig } from '@/lib/security/admin-auth';
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

  const token = await createAdminSessionToken(actor);
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
  const hasSession = Boolean(await parseAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value));
  return NextResponse.json({
    hasSession
  });
}
