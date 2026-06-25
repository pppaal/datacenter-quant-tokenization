import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * Defense-in-depth role gating on the two highest-consequence operator-admin
 * mutations:
 *
 *   - PATCH /api/admin/operators        (change role / active state / rotate sessions)
 *   - PATCH /api/admin/identity-bindings (remap which user an SSO subject resolves to)
 *
 * Both previously checked only `if (!actor) 401` and ran the mutation for ANY
 * authenticated actor, relying solely on the middleware role gate
 * (`getRequiredAdminRoleForPath` → ADMIN). The handlers now additionally
 * enforce ADMIN themselves (403 for an authenticated-but-under-privileged
 * actor), matching the `withAdminApi` 401/403 contract proven in
 * `with-admin-api.test.ts`.
 *
 * These DB-free cases drive the no-actor path: with no `x-admin-actor` header
 * the resolver returns null before any DB access, so the auth gate must short
 * the request with 401 before touching the body or the database. This is the
 * regression guard ensuring the gate runs first; the 403 transition shares the
 * `hasRequiredAdminRole(actor.role, 'ADMIN')` semantics unit-tested elsewhere.
 */

test('PATCH /api/admin/operators rejects an unauthenticated request with 401 (no DB touch)', async () => {
  const { PATCH } = await import('@/app/api/admin/operators/route');
  const request = new Request('http://localhost/api/admin/operators', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: 'u1', role: 'ADMIN' })
  });

  const response = await PATCH(request);
  assert.equal(response.status, 401);
});

test('PATCH /api/admin/identity-bindings rejects an unauthenticated request with 401 (no DB touch)', async () => {
  const { PATCH } = await import('@/app/api/admin/identity-bindings/route');
  const request = new Request('http://localhost/api/admin/identity-bindings', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bindingId: 'b1', userId: 'u1' })
  });

  const response = await PATCH(request);
  assert.equal(response.status, 401);
});
