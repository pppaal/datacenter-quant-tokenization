import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * Cross-instance + in-process throttle on POST /api/kyc/webhook/[provider].
 * The webhook is public (provider-signature authenticated), so an attacker who
 * cannot forge a signature can still flood it; the limiter runs BEFORE the
 * signature check. We drive it with an UNKNOWN provider, which the limiter lets
 * through and `getKycProvider` then rejects as 404 — network-free — so the
 * over-limit request still 429s. The distributed layer soft-fails open (no
 * Upstash in the test env). Each test uses a unique IP to isolate the
 * module-global limiter store.
 */

const WEBHOOK_RATE_MAX = 120; // mirrors route WEBHOOK_RATE_MAX

function webhookRequest(ip: string) {
  return new Request('http://localhost/api/kyc/webhook/no-such-provider', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: '{}'
  });
}

const params = Promise.resolve({ provider: 'no-such-provider' });

test('kyc webhook throttles after the per-IP limit (before signature work)', async () => {
  const { POST } = await import('@/app/api/kyc/webhook/[provider]/route');
  const ip = '203.0.113.91';

  // Exhaust the budget: unknown provider → 404 (after the limiter admits).
  for (let i = 0; i < WEBHOOK_RATE_MAX; i += 1) {
    const response = await POST(webhookRequest(ip), { params });
    assert.notEqual(response.status, 429, `request ${i} should not be 429`);
  }

  const limited = await POST(webhookRequest(ip), { params });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('Retry-After')) >= 1);
});

test('kyc webhook limit is keyed per IP', async () => {
  const { POST } = await import('@/app/api/kyc/webhook/[provider]/route');

  for (let i = 0; i <= WEBHOOK_RATE_MAX; i += 1) {
    await POST(webhookRequest('198.51.100.91'), { params });
  }
  // A different IP is unaffected on its first attempt.
  const fresh = await POST(webhookRequest('198.51.100.92'), { params });
  assert.notEqual(fresh.status, 429);
});
