import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * Brute-force throttle on POST /api/admin/session. The in-process auth limiter
 * admits LOGIN_RATE_MAX (10) attempts per IP per minute and 429s the rest. We
 * drive it with auth left unconfigured (the limiter runs BEFORE the auth-config
 * check), so the first attempts return 503 and the over-limit attempt returns
 * 429 — no DB or credentials required. Each test uses a unique IP to isolate the
 * module-global limiter store.
 */

function loginRequest(ip: string) {
  return new Request('http://localhost/api/admin/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ user: 'attacker', password: 'guess' })
  });
}

test('admin login throttles brute-force after the per-IP limit', async () => {
  const { POST } = await import('@/app/api/admin/session/route');
  const ip = '203.0.113.42';

  const statuses: number[] = [];
  for (let i = 0; i < 12; i += 1) {
    const response = await POST(loginRequest(ip));
    statuses.push(response.status);
  }

  // First 10 attempts are admitted by the limiter (then rejected downstream as
  // 503 because auth is not configured in the test env), the 11th+ are 429.
  assert.equal(
    statuses.slice(0, 10).every((s) => s !== 429),
    true,
    `early: ${statuses}`
  );
  assert.equal(statuses[10], 429, `11th should be 429: ${statuses}`);
  assert.equal(statuses[11], 429, `12th should be 429: ${statuses}`);

  const limited = await POST(loginRequest(ip));
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('Retry-After')) >= 1);
});

test('admin login limit is keyed per IP', async () => {
  const { POST } = await import('@/app/api/admin/session/route');

  // Exhaust one IP's budget.
  for (let i = 0; i < 12; i += 1) {
    await POST(loginRequest('198.51.100.7'));
  }

  // A different IP is unaffected (not 429 on its first attempt).
  const fresh = await POST(loginRequest('198.51.100.8'));
  assert.notEqual(fresh.status, 429);
});
