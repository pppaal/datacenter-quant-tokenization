import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { createAdminSessionToken, ADMIN_SESSION_COOKIE } from '@/lib/security/admin-session';

/**
 * SECURITY regression guard: the single auth gate (`middleware.ts`) must
 * UNCONDITIONALLY strip every inbound `x-admin-*` header before stamping the
 * authenticated actor identity. Route handlers trust `x-admin-role` /
 * `x-admin-session-id` / `x-admin-user-id` as proof of identity, so a
 * client-supplied value must never survive into a handler — including for the
 * optional fields that the middleware only sets conditionally.
 *
 * We mint a REAL signed session (ANALYST — enough for `/api/deals`) so the
 * request passes the gate, then attach attacker-controlled `x-admin-*` headers
 * and assert none of them reach the forwarded request. Next.js encodes the
 * forwarded request headers onto the response via `x-middleware-override-headers`
 * (the comma-separated set of overridden names) plus per-header
 * `x-middleware-request-<name>` values; we read those to inspect exactly what a
 * downstream handler would see.
 */

// The session helpers default to a fixed dev secret when NODE_ENV !== production
// and ADMIN_SESSION_SECRET is unset. Configure a credential so the auth gate is
// in `configured` mode (otherwise non-production middleware short-circuits to
// NextResponse.next() before reaching the header-stamping branch under test).
process.env.ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET ?? 'test-admin-session-secret';
process.env.ADMIN_BASIC_AUTH_ANALYST_CREDENTIALS =
  process.env.ADMIN_BASIC_AUTH_ANALYST_CREDENTIALS ?? 'analyst:correct-horse-battery';

function forwardedHeader(response: Response, name: string): string | null {
  // Next sets `x-middleware-request-<lower-name>` for each overridden header.
  return response.headers.get(`x-middleware-request-${name.toLowerCase()}`);
}

function overriddenNames(response: Response): string[] {
  const raw = response.headers.get('x-middleware-override-headers');
  if (!raw) return [];
  return raw
    .split(',')
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean);
}

async function buildAuthedRequest(attackerHeaders: Record<string, string>) {
  const token = await createAdminSessionToken({
    identifier: 'analyst@example.com',
    role: 'ANALYST',
    provider: 'session',
    userId: 'real-user-id',
    sessionId: 'real-session-id',
    email: 'analyst@example.com',
    subject: 'real-subject'
  });
  assert.ok(token, 'expected a signed session token');

  const headers = new Headers(attackerHeaders);
  headers.set('cookie', `${ADMIN_SESSION_COOKIE}=${token}`);

  // Use a non-public admin API path that requires ANALYST (not ADMIN) so the
  // gate authenticates the actor and proceeds to the header-stamping branch.
  return new NextRequest('https://app.example.com/api/deals', {
    method: 'GET',
    headers
  });
}

test('inbound spoofed x-admin-role / x-admin-session-id never reach a handler', async () => {
  const request = await buildAuthedRequest({
    'x-admin-role': 'ADMIN',
    'x-admin-session-id': 'attacker-session',
    'x-admin-user-id': 'attacker-user',
    'x-admin-actor': 'attacker@evil.test'
  });

  const response = await middleware(request);

  // The role the handler sees must be the authenticated ANALYST, NOT the spoofed
  // ADMIN.
  assert.equal(forwardedHeader(response, 'x-admin-role'), 'ANALYST');
  assert.equal(forwardedHeader(response, 'x-admin-actor'), 'analyst@example.com');
  // The real session identity replaces any spoofed value.
  assert.equal(forwardedHeader(response, 'x-admin-session-id'), 'real-session-id');
  assert.equal(forwardedHeader(response, 'x-admin-user-id'), 'real-user-id');
});

test('inbound x-admin-* for a field the session lacks is dropped, not passed through', async () => {
  // Mint a session WITHOUT email/subject so those optional headers are not set
  // by the middleware; a spoofed value for them must NOT survive.
  const token = await createAdminSessionToken({
    identifier: 'analyst2@example.com',
    role: 'ANALYST',
    provider: 'session',
    userId: 'real-user-2'
    // no email, no subject, no sessionId
  });
  assert.ok(token);

  const headers = new Headers({
    'x-admin-email': 'attacker@evil.test',
    'x-admin-subject': 'attacker-subject',
    'x-admin-session-id': 'attacker-session'
  });
  headers.set('cookie', `${ADMIN_SESSION_COOKIE}=${token}`);
  const request = new NextRequest('https://app.example.com/api/deals', {
    method: 'GET',
    headers
  });

  const response = await middleware(request);

  // Sanity: the stamping branch ran (so the absence checks below are meaningful,
  // not vacuously true on an error response).
  assert.equal(forwardedHeader(response, 'x-admin-role'), 'ANALYST');

  // None of the spoofed optional fields should be present on the forwarded
  // request, since the session didn't populate them.
  const names = overriddenNames(response);
  assert.equal(names.includes('x-admin-email'), false, 'x-admin-email must be stripped');
  assert.equal(names.includes('x-admin-subject'), false, 'x-admin-subject must be stripped');
  assert.equal(names.includes('x-admin-session-id'), false, 'x-admin-session-id must be stripped');
  // The values must not leak through either.
  assert.notEqual(forwardedHeader(response, 'x-admin-email'), 'attacker@evil.test');
  assert.notEqual(forwardedHeader(response, 'x-admin-subject'), 'attacker-subject');
  assert.notEqual(forwardedHeader(response, 'x-admin-session-id'), 'attacker-session');
});
