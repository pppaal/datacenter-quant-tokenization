import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * `GET /api/admin/research-snapshots` and `POST /api/admin/ingest/korea` both
 * previously collapsed missing-actor and insufficient-role into a single 401
 * (`!actor || !hasRequiredAdminRole(actor.role, 'ADMIN')`).
 *
 * research-snapshots is now `withAdminApi({ requiredRole: 'ADMIN' })`, whose
 * 401-vs-403 ADMIN gate is proven in `with-admin-api.test.ts`. ingest/korea
 * keeps its rate-limit + PARTIAL-audit logic but now splits the check so an
 * authenticated-but-under-privileged actor gets 403 (mirroring the ic-packet
 * lock/decision sibling routes).
 *
 * These DB-free cases drive the no-actor path: with no `x-admin-actor` header
 * the resolver returns null before any DB access, so both routes must short
 * the request with 401 before touching the body, the rate limiter, or the
 * database.
 */

test('GET /api/admin/research-snapshots rejects an unauthenticated request with 401', async () => {
  const { GET } = await import('@/app/api/admin/research-snapshots/route');
  const request = new Request('http://localhost/api/admin/research-snapshots', {
    method: 'GET'
  });

  const response = await GET(request);
  assert.equal(response.status, 401);
});

test('POST /api/admin/ingest/korea rejects an unauthenticated request with 401 (before rate limit / DB)', async () => {
  const { POST } = await import('@/app/api/admin/ingest/korea/route');
  const request = new Request('http://localhost/api/admin/ingest/korea', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}'
  });

  const response = await POST(request);
  assert.equal(response.status, 401);
});
