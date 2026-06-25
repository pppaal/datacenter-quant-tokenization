import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * The public, unauthenticated POST /api/property-analyze must not echo the raw
 * zod `issues` array back to the caller on a 400 — the issues objects can carry
 * the received (attacker-controlled, but also potentially reflected) values and
 * internal schema shape. We assert the 400 body contains only a flattened,
 * field-level `error` summary and no `details`/`issues` array.
 *
 * Network-free: an invalid body is rejected by zod before any connector runs.
 * Each test uses a unique IP to avoid the module-global in-process limiter.
 */

function analyzeRequest(ip: string, body: unknown) {
  return new Request('http://localhost/api/property-analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body)
  });
}

test('property-analyze 400 does not leak the raw zod issues array', async () => {
  const { POST } = await import('@/app/api/property-analyze/route');
  // Schema-invalid: latitude out of range -> zod issue with the received value.
  const response = await POST(
    analyzeRequest('203.0.113.91', { location: { latitude: 999, longitude: 999 } })
  );
  assert.equal(response.status, 400);

  const body = (await response.json()) as Record<string, unknown>;
  // No raw issues array under any of the legacy keys.
  assert.equal('details' in body, false, 'must not include raw `details`');
  assert.equal('issues' in body, false, 'must not include raw `issues`');
  // Field-level summary is preserved (path + message), as a single string.
  assert.equal(typeof body.error, 'string');
  assert.ok((body.error as string).includes('latitude'));
});

test('property-analyze missing-field 400 returns a safe summary string', async () => {
  const { POST } = await import('@/app/api/property-analyze/route');
  const response = await POST(analyzeRequest('203.0.113.92', {}));
  assert.equal(response.status, 400);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(typeof body.error, 'string');
  assert.equal('details' in body, false);
});
