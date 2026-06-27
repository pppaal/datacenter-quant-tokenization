import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { authorizeAdminScimRequest } from '@/lib/security/admin-scim';
import { getRequestIpAddress } from '@/lib/security/admin-request';

const API = new URL('../app/api/', import.meta.url);

function routeSrc(rel: string): string {
  return readFileSync(new URL(rel, API), 'utf8');
}

// --- (1) write routes wired to the fail-CLOSED mutation scope mode ----------
// A representative set of mutating routes must pass `'mutation'` so an un-granted
// non-ADMIN analyst is denied (the primitive's fail-closed behavior is covered
// by admin-access-scope-fail-closed.test.ts; this guards the WIRING).
const WRITE_ROUTES = [
  'deals/[id]/archive/route.ts',
  'deals/[id]/restore/route.ts',
  'deals/[id]/counterparties/route.ts',
  'assets/[id]/route.ts',
  'valuations/route.ts',
  'portfolio-assets/[id]/initiatives/route.ts',
  'documents/upload/route.ts',
  'tokenization/issuance/route.ts'
];

for (const rel of WRITE_ROUTES) {
  test(`write route ${rel} passes 'mutation' to assertActorScopeAccess`, () => {
    const src = routeSrc(rel);
    assert.match(src, /assertActorScopeAccess\(/, 'expected a scope-access check');
    assert.match(src, /'mutation'/, `expected '${rel}' to opt into fail-closed mutation mode`);
  });
}

// GET-only read routes must NOT pass 'mutation' (reads stay opt-in so analysts
// aren't locked out of visibility).
const READ_ROUTES = ['deals/[id]/workpaper/route.ts', 'funds/[id]/investor-report/route.ts'];
for (const rel of READ_ROUTES) {
  test(`read route ${rel} stays in default read mode`, () => {
    const src = routeSrc(rel);
    assert.match(src, /assertActorScopeAccess\(/);
    assert.equal(/'mutation'/.test(src), false, `read route '${rel}' must not fail-close`);
  });
}

// --- (2) IP resolution is hop-aware (spoofed leftmost XFF is ignored) --------
test('getRequestIpAddress ignores a spoofed leftmost x-forwarded-for entry', () => {
  // Default TRUSTED_PROXY_HOP_COUNT=1 → trust the rightmost (proxy-set) entry.
  // A client prepending a fake IP must not change the resolved address.
  const headers = new Headers({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7' });
  assert.equal(getRequestIpAddress(headers), '203.0.113.7');
});

test('getRequestIpAddress prefers the non-forgeable x-vercel-forwarded-for', () => {
  const headers = new Headers({
    'x-vercel-forwarded-for': '198.51.100.5',
    'x-forwarded-for': '9.9.9.9, 203.0.113.7'
  });
  assert.equal(getRequestIpAddress(headers), '198.51.100.5');
});

// --- (3) SCIM bearer comparison is correct (now constant-time) ---------------
function scimRequest(bearer: string): Request {
  return new Request('http://localhost/api/admin/scim/users', {
    method: 'POST',
    headers: { authorization: `Bearer ${bearer}` }
  });
}

test('authorizeAdminScimRequest accepts the exact token and rejects others', () => {
  const env = { ADMIN_SCIM_TOKEN: 'scim-secret-token-abc123' } as unknown as NodeJS.ProcessEnv;
  assert.equal(authorizeAdminScimRequest(scimRequest('scim-secret-token-abc123'), env), true);
  assert.equal(authorizeAdminScimRequest(scimRequest('scim-secret-token-abc124'), env), false);
  assert.equal(authorizeAdminScimRequest(scimRequest('short'), env), false);
  assert.equal(authorizeAdminScimRequest(scimRequest(''), env), false);
});

test('authorizeAdminScimRequest is disabled when no token configured', () => {
  const env = {} as unknown as NodeJS.ProcessEnv;
  assert.equal(authorizeAdminScimRequest(scimRequest('anything'), env), false);
});
