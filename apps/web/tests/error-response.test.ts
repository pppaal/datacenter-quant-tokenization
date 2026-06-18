import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { genericErrorResponse, validationOrGenericError } from '@/lib/security/error-response';
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

const schema = z.object({ title: z.string().min(3), kw: z.number().int().positive() });

test('validationOrGenericError echoes ZodError field issues (safe) as a 400', async () => {
  let zodErr: unknown;
  try {
    schema.parse({ title: 'ab', kw: -1 });
  } catch (e) {
    zodErr = e;
  }
  const response = validationOrGenericError(zodErr, { message: 'Failed to create thing.' });
  assert.equal(response.status, 400);
  const body = (await response.json()) as { error: string };
  // Field paths + messages are surfaced (useful, non-sensitive form feedback).
  assert.ok(body.error.includes('title'));
  assert.ok(body.error.includes('kw'));
  // Not the generic fallback — validation feedback is preserved.
  assert.notEqual(body.error, 'Failed to create thing.');
});

test('validationOrGenericError genericizes a non-Zod (e.g. Prisma) error', async () => {
  const response = validationOrGenericError(new Error(SECRET), {
    message: 'Failed to create thing.'
  });
  assert.equal(response.status, 400);
  const body = (await response.json()) as { error: string; requestId: string };
  assert.equal(body.error, 'Failed to create thing.');
  assert.ok(!JSON.stringify(body).includes('ssn'));
  assert.ok(!JSON.stringify(body).includes('ECONNREFUSED'));
  assert.ok(typeof body.requestId === 'string' && body.requestId.length > 0);
});

test('validationOrGenericError honors a custom status for the non-validation case', async () => {
  const response = validationOrGenericError(new Error(SECRET), {
    message: 'Boom.',
    status: 500
  });
  assert.equal(response.status, 500);
});
