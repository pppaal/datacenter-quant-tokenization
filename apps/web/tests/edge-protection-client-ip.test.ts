import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { resolveClientIp } from '@/lib/security/edge-protection';

/**
 * SECURITY regression guard for `resolveClientIp`. The resolved IP feeds the IP
 * allowlist and the per-IP rate limiter, so trusting a client-spoofable
 * `x-forwarded-for` entry would let an attacker forge their source address —
 * masquerading as an allowlisted IP or evading the rate limiter by rotating the
 * leftmost (client-controlled) entry.
 *
 * The hardened resolver trusts only the entry inserted by the configured
 * trusted-proxy hop count (`TRUSTED_PROXY_HOP_COUNT`, default 1): the Nth-from-
 * the-right entry of the `client, proxy1, ...` chain. `x-vercel-forwarded-for`
 * wins when present (Vercel sets it past its own proxy; not client-forgeable).
 */

function makeRequest(headers: Record<string, string>) {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    headers: { get: (name: string) => h.get(name.toLowerCase()) ?? null },
    nextUrl: { pathname: '/api/admin/deals' }
  };
}

afterEach(() => {
  delete process.env.TRUSTED_PROXY_HOP_COUNT;
});

test('default single hop: trusts the rightmost (proxy-inserted) XFF entry, not the spoofed left', () => {
  // Attacker prepends a forged IP; the real Vercel proxy appends the true client
  // address on the right. With one trusted hop we must resolve to the rightmost.
  const req = makeRequest({
    'x-forwarded-for': '1.2.3.4, 203.0.113.9'
  });
  assert.equal(resolveClientIp(req), '203.0.113.9');
});

test('spoofed extra XFF entries do not change the resolved IP under one trusted hop', () => {
  const baseline = resolveClientIp(makeRequest({ 'x-forwarded-for': '203.0.113.9' }));
  const spoofed = resolveClientIp(
    makeRequest({ 'x-forwarded-for': '9.9.9.9, 8.8.8.8, 203.0.113.9' })
  );
  // Adding attacker-controlled leftmost entries must not move the answer.
  assert.equal(baseline, '203.0.113.9');
  assert.equal(spoofed, '203.0.113.9');
});

test('TRUSTED_PROXY_HOP_COUNT=2 trusts the second-from-right entry', () => {
  process.env.TRUSTED_PROXY_HOP_COUNT = '2';
  // chain: client, cdn-observed-client, vercel-proxy => trust 2nd from right.
  const req = makeRequest({ 'x-forwarded-for': '1.1.1.1, 203.0.113.9, 70.70.70.70' });
  assert.equal(resolveClientIp(req), '203.0.113.9');
});

test('x-vercel-forwarded-for is preferred over a spoofed x-forwarded-for', () => {
  const req = makeRequest({
    'x-vercel-forwarded-for': '203.0.113.50',
    'x-forwarded-for': '6.6.6.6, 7.7.7.7'
  });
  assert.equal(resolveClientIp(req), '203.0.113.50');
});

test('short chain (fewer hops than configured) clamps to the leftmost proxy-observed entry', () => {
  process.env.TRUSTED_PROXY_HOP_COUNT = '3';
  const req = makeRequest({ 'x-forwarded-for': '203.0.113.9' });
  // Only one entry available; clamp rather than read undefined.
  assert.equal(resolveClientIp(req), '203.0.113.9');
});

test('falls back to x-real-ip then null when no forwarded-for present', () => {
  assert.equal(resolveClientIp(makeRequest({ 'x-real-ip': '203.0.113.77' })), '203.0.113.77');
  assert.equal(resolveClientIp(makeRequest({})), null);
});

test('invalid TRUSTED_PROXY_HOP_COUNT falls back to the safe default of 1', () => {
  for (const bad of ['0', '-2', 'abc', '1.5']) {
    process.env.TRUSTED_PROXY_HOP_COUNT = bad;
    const req = makeRequest({ 'x-forwarded-for': '1.2.3.4, 203.0.113.9' });
    assert.equal(resolveClientIp(req), '203.0.113.9', `bad value ${bad} should default to 1`);
  }
});
