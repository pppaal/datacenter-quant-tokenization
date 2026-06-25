import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { hasRequiredAdminRole } from '@/lib/security/admin-auth';

/**
 * Defense-in-depth ADMIN gating on the irreversible on-chain / tokenization /
 * KYC-bridge MUTATION routes.
 *
 * These money-moving handlers (mint/burn/forceTransfer, dividend distribution,
 * transfer-agent settlement, identity/compliance registry writes, deployment
 * recording, valuation anchoring, the KYC→chain bridge) previously enforced
 * ADMIN ONLY through the middleware path-role map
 * (`getRequiredAdminRoleForPath` → ADMIN). Each handler resolved the actor with
 * `resolveVerifiedAdminActorFromHeaders(..., { requireActiveSeat: true })` but
 * never asserted `requiredRole: 'ADMIN'` itself. If the middleware map ever
 * regressed — or a new route landed under an uncovered path — these routes
 * would silently drop to "any active seat".
 *
 * Each POST handler now ALSO enforces ADMIN in-handler, returning 403 for an
 * authenticated-but-under-privileged actor (the same
 * `hasRequiredAdminRole(actor.role, 'ADMIN')` semantics proven in
 * with-admin-api.test.ts and the #188 ic-packet / ops-replay routes).
 *
 * This suite is network- and DB-free. Because the test runner here does not
 * expose `mock.module`, a verified-but-non-ADMIN actor cannot be injected into
 * the handlers (they bind the real `prisma`). We therefore pin the gate three
 * ways:
 *   1. SOURCE ASSERT — every in-scope mutation handler contains the in-handler
 *      ADMIN check and a 403 response (would FAIL before this change).
 *   2. RUNTIME — every gated POST short-circuits an unauthenticated request with
 *      401 before any DB access (the resolver returns null with no actor header).
 *   3. PREDICATE — `hasRequiredAdminRole(actor.role, 'ADMIN')`, the exact check
 *      the gate relies on, rejects VIEWER/ANALYST and admits ADMIN.
 */

const here = dirname(fileURLToPath(import.meta.url));
const apiDir = join(here, '..', 'app', 'api');

// Every in-scope MUTATION (POST) route that performs an irreversible on-chain /
// KYC-bridge action and must enforce ADMIN in-handler.
const GATED_ROUTES = [
  'kyc/bridge/route.ts',
  'onchain/valuation-anchor/route.ts',
  'tokenization/compliance/route.ts',
  'tokenization/deployments/route.ts',
  'tokenization/identity/route.ts',
  'tokenization/distributions/route.ts',
  'tokenization/issuance/route.ts',
  'tokenization/transfers/route.ts'
] as const;

test('every in-scope mutation handler enforces ADMIN in-handler with a 403', () => {
  for (const rel of GATED_ROUTES) {
    const source = readFileSync(join(apiDir, rel), 'utf8');
    assert.ok(
      source.includes("hasRequiredAdminRole(actor.role, 'ADMIN')"),
      `${rel} must enforce ADMIN in-handler via hasRequiredAdminRole(actor.role, 'ADMIN')`
    );
    assert.ok(
      source.includes('status: 403'),
      `${rel} must return 403 for an authenticated-but-under-privileged actor`
    );
    // The new gate must not have removed the pre-existing 401 unauthenticated
    // path — this is a purely ADDED redundant check.
    assert.ok(source.includes('status: 401'), `${rel} must still 401 an unauthenticated request`);
  }
});

test('hasRequiredAdminRole admits ADMIN and rejects VIEWER / ANALYST', () => {
  assert.equal(hasRequiredAdminRole('ADMIN', 'ADMIN'), true);
  assert.equal(hasRequiredAdminRole('ANALYST', 'ADMIN'), false);
  assert.equal(hasRequiredAdminRole('VIEWER', 'ADMIN'), false);
});

// The unauthenticated path is DB-free: with no `x-admin-actor` header the
// resolver returns null before any DB access, so the handler must short the
// request with 401 (proving the gate sits on a reachable, pre-DB code path).
const POST_ROUTES: Array<{ rel: string; path: string }> = [
  { rel: 'kyc/bridge/route', path: 'http://localhost/api/kyc/bridge' },
  { rel: 'onchain/valuation-anchor/route', path: 'http://localhost/api/onchain/valuation-anchor' },
  { rel: 'tokenization/compliance/route', path: 'http://localhost/api/tokenization/compliance' },
  { rel: 'tokenization/deployments/route', path: 'http://localhost/api/tokenization/deployments' },
  { rel: 'tokenization/identity/route', path: 'http://localhost/api/tokenization/identity' },
  {
    rel: 'tokenization/distributions/route',
    path: 'http://localhost/api/tokenization/distributions'
  },
  { rel: 'tokenization/issuance/route', path: 'http://localhost/api/tokenization/issuance' },
  { rel: 'tokenization/transfers/route', path: 'http://localhost/api/tokenization/transfers' }
];

for (const { rel, path } of POST_ROUTES) {
  test(`POST ${rel} rejects an unauthenticated request with 401 (pre-DB)`, async () => {
    const mod = await import(`@/app/api/${rel}`);
    const response = await mod.POST(new Request(path, { method: 'POST' }));
    assert.equal(response.status, 401);
  });
}
