import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { mintInvestorToken, INVESTOR_TOKEN_COOKIE } from '@/lib/security/investor-token';
import { ADMIN_SESSION_COOKIE } from '@/lib/security/admin-session';

/**
 * SECURITY: the LP-portal middleware branch must (a) require a valid investor
 * token (fail-closed 401), (b) stamp the DERIVED investor identity while
 * stripping any client-supplied x-investor-* / x-admin-*, and (c) NOT grant any
 * admin access — a portal token is useless on the admin gate.
 */
process.env.INVESTOR_TOKEN_SECRET = process.env.INVESTOR_TOKEN_SECRET ?? 'test-investor-secret';
// Put the admin gate in `configured` mode so the admin-path test reaches its 401
// (otherwise non-prod middleware short-circuits before the gate).
process.env.ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET ?? 'test-admin-session-secret';
process.env.ADMIN_BASIC_AUTH_ANALYST_CREDENTIALS =
  process.env.ADMIN_BASIC_AUTH_ANALYST_CREDENTIALS ?? 'analyst:correct-horse-battery';

function forwardedHeader(response: Response, name: string): string | null {
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

test('valid investor token: stamps derived x-investor-id, strips spoofed headers', async () => {
  const token = await mintInvestorToken('inv_1', 'LP-001');
  assert.ok(token);
  const headers = new Headers({
    'x-investor-id': 'inv_HACKER', // spoofed — must be overwritten
    'x-admin-role': 'ADMIN' // spoofed — must be stripped
  });
  headers.set('cookie', `${INVESTOR_TOKEN_COOKIE}=${token}`);
  const request = new NextRequest('https://app.example.com/api/portal/overview', {
    method: 'GET',
    headers
  });

  const response = await middleware(request);

  assert.equal(forwardedHeader(response, 'x-investor-id'), 'inv_1'); // derived, not spoofed
  assert.equal(forwardedHeader(response, 'x-investor-role'), 'LP');
  assert.equal(forwardedHeader(response, 'x-investor-code'), 'LP-001');
  // The spoofed admin header must not survive into the handler.
  assert.equal(overriddenNames(response).includes('x-admin-role'), false);
  assert.equal(forwardedHeader(response, 'x-admin-role'), null);
});

test('no investor token on a portal path → 401 (fail-closed)', async () => {
  const request = new NextRequest('https://app.example.com/api/portal/overview', {
    method: 'GET'
  });
  const response = await middleware(request);
  assert.equal(response.status, 401);
});

test('an investor token does NOT unlock the admin gate', async () => {
  const token = await mintInvestorToken('inv_1', 'LP-001');
  assert.ok(token);
  const headers = new Headers();
  // Present the investor token (and even spoof an admin cookie name with the LP token).
  headers.set('cookie', `${INVESTOR_TOKEN_COOKIE}=${token}; ${ADMIN_SESSION_COOKIE}=${token}`);
  const request = new NextRequest('https://app.example.com/api/deals', {
    method: 'GET',
    headers
  });
  const response = await middleware(request);
  // The LP token is not a valid admin session → admin gate rejects.
  assert.equal(response.status, 401);
  // And it certainly did not stamp an admin identity.
  assert.equal(forwardedHeader(response, 'x-admin-role'), null);
});
