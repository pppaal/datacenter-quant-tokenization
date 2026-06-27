import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * SECURITY regression guard: a persist/DB failure on POST /api/kyc/webhook/
 * [provider] must NOT echo the raw error to the caller. Prisma error strings
 * embed internal schema/connection detail (here: "Environment variable not
 * found: DATABASE_URL ... schema.prisma"), so the persist-failure branch must
 * route through `genericErrorResponse` — a generic message plus a requestId —
 * not `error.message`.
 *
 * We drive the real route with the mock provider (signature skipped via the
 * documented local escape hatch) and a VALID payload so `parseEvent` succeeds;
 * `persistKycEvent` then hits the Prisma singleton, which throws because the
 * test env has no DATABASE_URL. This exercises the exact persist-failure path
 * network-free. The failure-path audit is best-effort, so the audit write's own
 * DB error does not mask the client-safe response.
 */

process.env.KYC_MOCK_WEBHOOK_SECRET = process.env.KYC_MOCK_WEBHOOK_SECRET ?? 'test-mock-secret';
process.env.KYC_MOCK_SKIP_SIG = '1';
// Force the persist-failure path deterministically and network-free, regardless
// of ambient env: in CI `DATABASE_URL` points at a live, migrated Postgres, so
// the write would SUCCEED and the route would return 200 — not the 500 this test
// asserts. `node --test` isolates each test file in its own process, so removing
// it here affects only this file. The Prisma singleton (constructed on first use
// by the dynamically-imported route below) then throws "Environment variable not
// found: DATABASE_URL", exercising the exact persist failure that must be
// genericized.
delete process.env.DATABASE_URL;

function validMockWebhookRequest(ip: string) {
  const body = JSON.stringify({
    applicantId: 'applicant-1',
    wallet: `0x${'1'.repeat(40)}`,
    countryCode: 410,
    status: 'APPROVED'
  });
  return new Request('http://localhost/api/kyc/webhook/mock', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body
  });
}

test('persist failure returns a generic message + requestId, not internal detail', async () => {
  const { POST } = await import('@/app/api/kyc/webhook/[provider]/route');
  const response = await POST(validMockWebhookRequest('203.0.113.201'), {
    params: Promise.resolve({ provider: 'mock' })
  });

  // Generic 5xx, never the provider-facing 400/401/404 used for parse/signature/
  // unknown-provider.
  assert.equal(response.status, 500);

  const payload = (await response.json()) as { error?: string; requestId?: string };
  assert.equal(payload.error, 'Failed to persist KYC event.');
  assert.ok(payload.requestId, 'expected a correlation requestId');

  // Crucially: no internal Prisma/schema/DB detail leaks into the response.
  const serialized = JSON.stringify(payload).toLowerCase();
  assert.equal(serialized.includes('prisma'), false, 'must not leak "prisma"');
  assert.equal(serialized.includes('database_url'), false, 'must not leak env var name');
  assert.equal(serialized.includes('schema.prisma'), false, 'must not leak schema path');
});
