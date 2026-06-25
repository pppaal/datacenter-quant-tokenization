import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * Defense-in-depth ADMIN gating on the ops replay/requeue mutations:
 *
 *   - POST /api/admin/ops-alert-deliveries/[id]/replay (re-fire an alert)
 *   - POST /api/admin/ops-work-items/[id]/replay        (requeue a work item)
 *
 * Both previously checked only `if (!actor) 401` and ran the replay for ANY
 * authenticated actor, relying solely on the middleware role gate
 * (`getRequiredAdminRoleForPath` → ADMIN). Each handler now additionally
 * enforces ADMIN, returning 403 for an authenticated-but-under-privileged
 * actor (same `hasRequiredAdminRole(actor.role, 'ADMIN')` semantics proven in
 * with-admin-api.test.ts and the ic-packet lock/decision routes).
 *
 * These DB-free cases drive the no-actor path: with no `x-admin-actor` header
 * the resolver returns null before any DB access, so the handler must short the
 * request with 401 before resolving params or hitting the database.
 */

test('POST ops-alert-deliveries/[id]/replay rejects an unauthenticated request with 401', async () => {
  const { POST } = await import('@/app/api/admin/ops-alert-deliveries/[id]/replay/route');
  const request = new Request('http://localhost/api/admin/ops-alert-deliveries/d1/replay', {
    method: 'POST'
  });

  const response = await POST(request, { params: Promise.resolve({ id: 'd1' }) });
  assert.equal(response.status, 401);
});

test('POST ops-work-items/[id]/replay rejects an unauthenticated request with 401', async () => {
  const { POST } = await import('@/app/api/admin/ops-work-items/[id]/replay/route');
  const request = new Request('http://localhost/api/admin/ops-work-items/w1/replay', {
    method: 'POST'
  });

  const response = await POST(request, { params: Promise.resolve({ id: 'w1' }) });
  assert.equal(response.status, 401);
});
