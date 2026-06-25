import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAdminApi } from '@/lib/security/with-admin-api';
import type { AuthorizedAdminActor } from '@/lib/security/admin-auth';

/**
 * Deterministic, DB-free coverage of `withAdminApi`'s auth status-code
 * contract. The `resolveActor` test seam lets us inject an actor (or null)
 * without standing up Postgres, so we can prove the distinction the migrated
 * admin routes now rely on:
 *
 *   - no authenticated actor                -> 401
 *   - authenticated but under-privileged    -> 403  (NOT 401)
 *   - authenticated + sufficient role       -> handler runs
 *
 * Several hand-rolled routes previously collapsed both auth failures into a
 * single `401`. Routing under-privileged-but-authenticated actors through 403
 * is the correct, stronger signal and matches the middleware role gate.
 */

function actor(role: AuthorizedAdminActor['role']): AuthorizedAdminActor {
  return { identifier: `op-${role}`, role, provider: 'session' };
}

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/admin/example', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('withAdminApi returns 401 when no actor is resolved', async () => {
  const handler = withAdminApi({
    requiredRole: 'ANALYST',
    resolveActor: async () => null,
    async handler() {
      return NextResponse.json({ ok: true });
    }
  });

  const response = await handler(jsonRequest({}));
  assert.equal(response.status, 401);
});

test('withAdminApi returns 403 (not 401) for an authenticated under-privileged actor', async () => {
  const handler = withAdminApi({
    requiredRole: 'ANALYST',
    resolveActor: async () => actor('VIEWER'),
    async handler() {
      return NextResponse.json({ ok: true });
    }
  });

  const response = await handler(jsonRequest({}));
  assert.equal(response.status, 403);
  const payload = (await response.json()) as { error?: string };
  assert.match(payload.error ?? '', /ANALYST/);
});

test('withAdminApi runs the handler when the actor meets the required role', async () => {
  let ran = false;
  const handler = withAdminApi({
    requiredRole: 'ANALYST',
    resolveActor: async () => actor('ADMIN'),
    async handler() {
      ran = true;
      return NextResponse.json({ ok: true });
    }
  });

  const response = await handler(jsonRequest({}));
  assert.equal(response.status, 200);
  assert.equal(ran, true);
});

test('withAdminApi validates the body with zod (400) before invoking the handler', async () => {
  let ran = false;
  const handler = withAdminApi({
    requiredRole: 'ANALYST',
    resolveActor: async () => actor('ANALYST'),
    bodySchema: z.object({ dealId: z.string().trim().min(1) }),
    async handler() {
      ran = true;
      return NextResponse.json({ ok: true });
    }
  });

  const response = await handler(jsonRequest({ dealId: '' }));
  assert.equal(response.status, 400);
  assert.equal(ran, false, 'handler must not run on invalid body');
});

test('withAdminApi path-param route returns 403 for under-privileged actor (no handler run)', async () => {
  // Mirrors the migrated `GET /api/admin/ic-packets/[id]/export` shape: a
  // path-param GET that previously returned 401 for an authenticated actor
  // lacking the ANALYST role. The handler must not run.
  let ran = false;
  const handler = withAdminApi<undefined, { id: string }>({
    requiredRole: 'ANALYST',
    resolveActor: async () => actor('VIEWER'),
    auditEntityIdFromParams: (params) => params.id,
    async handler() {
      ran = true;
      return NextResponse.json({ ok: true });
    }
  });

  const request = new Request('http://localhost/api/admin/ic-packets/pkt_1/export', {
    method: 'GET'
  });
  const response = await handler(request, { params: Promise.resolve({ id: 'pkt_1' }) });
  assert.equal(response.status, 403);
  assert.equal(ran, false, 'handler must not run for an under-privileged actor');
});

test('withAdminApi ADMIN gate returns 403 for VIEWER and ANALYST (operators/identity-bindings shape)', async () => {
  // The migrated `PATCH /api/admin/operators` and
  // `PATCH /api/admin/identity-bindings` use `requiredRole: 'ADMIN'`. Any
  // authenticated actor below ADMIN must be denied with 403 (not silently
  // allowed to mutate operator seats or remap SSO identity bindings).
  for (const role of ['VIEWER', 'ANALYST'] as const) {
    let ran = false;
    const handler = withAdminApi({
      requiredRole: 'ADMIN',
      resolveActor: async () => actor(role),
      async handler() {
        ran = true;
        return NextResponse.json({ ok: true });
      }
    });
    const response = await handler(jsonRequest({ userId: 'u1' }));
    assert.equal(response.status, 403, `${role} must be denied with 403`);
    assert.equal(ran, false, `${role} must not reach the handler`);
  }
});

test('withAdminApi enforces auth before body validation (401 on missing actor + bad body)', async () => {
  const handler = withAdminApi({
    requiredRole: 'ANALYST',
    resolveActor: async () => null,
    bodySchema: z.object({ dealId: z.string().min(1) }),
    async handler() {
      return NextResponse.json({ ok: true });
    }
  });

  const response = await handler(jsonRequest({ dealId: '' }));
  assert.equal(response.status, 401, 'auth must be checked before body validation');
});
