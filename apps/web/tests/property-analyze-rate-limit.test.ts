import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * Cross-instance + in-process throttle on POST /api/property-analyze. The
 * in-process limiter admits ANALYZE_RATE_MAX (10) requests per IP per minute
 * and 429s the rest. We drive it with an INVALID body (`{}`), which the limiter
 * lets through and the zod refine then rejects as 400 — so the analyzer (and
 * its network connectors) never runs and the over-limit request still 429s.
 * The distributed layer soft-fails open (no Upstash in the test env), so this
 * exercises the in-process layer. Each test uses a unique IP to isolate the
 * module-global limiter store.
 */

const ANALYZE_RATE_MAX = 10; // mirrors route ANALYZE_RATE_MAX

function analyzeRequest(ip: string) {
  return new Request('http://localhost/api/property-analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({}) // invalid: neither address nor location → 400 after the limiter
  });
}

test('property-analyze throttles after the per-IP limit', async () => {
  const { POST } = await import('@/app/api/property-analyze/route');
  const ip = '203.0.113.71';

  const statuses: number[] = [];
  for (let i = 0; i < ANALYZE_RATE_MAX + 2; i += 1) {
    const response = await POST(analyzeRequest(ip));
    statuses.push(response.status);
  }

  // First ANALYZE_RATE_MAX are admitted by the limiter (then 400 from zod),
  // the rest are 429.
  assert.equal(
    statuses.slice(0, ANALYZE_RATE_MAX).every((s) => s !== 429),
    true,
    `early should not be 429: ${statuses}`
  );
  assert.equal(statuses[ANALYZE_RATE_MAX], 429, `over-limit should be 429: ${statuses}`);
  const limited = await POST(analyzeRequest(ip));
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) >= 1);
});

test('property-analyze limit is keyed per IP', async () => {
  const { POST } = await import('@/app/api/property-analyze/route');

  for (let i = 0; i < ANALYZE_RATE_MAX + 2; i += 1) {
    await POST(analyzeRequest('198.51.100.71'));
  }
  // A different IP is unaffected on its first attempt.
  const fresh = await POST(analyzeRequest('198.51.100.72'));
  assert.notEqual(fresh.status, 429);
});
