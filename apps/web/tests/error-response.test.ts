import assert from 'node:assert/strict';
import test from 'node:test';
import { genericErrorResponse } from '@/lib/security/error-response';
import { withRequestContext } from '@/lib/observability/logger';

const SECRET = 'connect ECONNREFUSED 10.0.0.5:5432 — db "investors" column "ssn"';

test('genericErrorResponse never leaks the raw error message to the client', async () => {
  const response = genericErrorResponse(new Error(SECRET), { status: 500 });
  assert.equal(response.status, 500);

  const body = (await response.json()) as { error: string; requestId: string };
  assert.equal(body.error, 'Internal server error.');
  assert.ok(!body.error.includes('ECONNREFUSED'));
  assert.ok(!JSON.stringify(body).includes('ssn'));
  // A requestId is always present so the client can quote it for correlation.
  assert.ok(typeof body.requestId === 'string' && body.requestId.length > 0);
  assert.equal(response.headers.get('X-Request-Id'), body.requestId);
});

test('genericErrorResponse honors an explicit status and custom generic message', async () => {
  const response = genericErrorResponse(new Error(SECRET), {
    status: 503,
    message: 'Service unavailable.'
  });
  assert.equal(response.status, 503);
  const body = (await response.json()) as { error: string };
  assert.equal(body.error, 'Service unavailable.');
  assert.ok(!body.error.includes('ECONNREFUSED'));
});

test('genericErrorResponse reuses the request-scoped requestId when present', async () => {
  const requestId = 'req-1234567890abcdef';
  const response = await withRequestContext({ requestId }, () =>
    genericErrorResponse(new Error(SECRET))
  );
  const body = (await response.json()) as { requestId: string };
  assert.equal(body.requestId, requestId);
  assert.equal(response.headers.get('X-Request-Id'), requestId);
});

test('genericErrorResponse prefers an explicitly passed requestId', async () => {
  const response = genericErrorResponse(new Error(SECRET), { requestId: 'explicit-req-id-001' });
  const body = (await response.json()) as { requestId: string };
  assert.equal(body.requestId, 'explicit-req-id-001');
});
