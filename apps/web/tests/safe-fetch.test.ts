import assert from 'node:assert/strict';
import test from 'node:test';
import { isPrivateIp, UnsafeUrlError, safeFetch } from '@/lib/security/safe-fetch';

test('isPrivateIp blocks RFC1918, loopback, link-local, IMDS, and reserved ranges', () => {
  assert.equal(isPrivateIp('10.0.0.1'), true);
  assert.equal(isPrivateIp('10.255.255.254'), true);
  assert.equal(isPrivateIp('172.16.0.1'), true);
  assert.equal(isPrivateIp('172.31.255.254'), true);
  assert.equal(isPrivateIp('192.168.0.1'), true);
  assert.equal(isPrivateIp('127.0.0.1'), true);
  assert.equal(isPrivateIp('0.0.0.0'), true);
  assert.equal(isPrivateIp('169.254.169.254'), true); // AWS IMDS
  assert.equal(isPrivateIp('100.64.0.1'), true); // CGNAT
  assert.equal(isPrivateIp('224.0.0.1'), true); // multicast
  assert.equal(isPrivateIp('255.255.255.255'), true); // broadcast
});

test('isPrivateIp accepts canonical public IPv4 addresses', () => {
  assert.equal(isPrivateIp('8.8.8.8'), false);
  assert.equal(isPrivateIp('1.1.1.1'), false);
  assert.equal(isPrivateIp('142.250.190.78'), false);
  assert.equal(isPrivateIp('200.0.0.1'), false);
});

test('isPrivateIp blocks IPv6 loopback, link-local, ULA, multicast', () => {
  assert.equal(isPrivateIp('::1'), true);
  assert.equal(isPrivateIp('::'), true);
  assert.equal(isPrivateIp('fe80::1'), true);
  assert.equal(isPrivateIp('fc00::1'), true);
  assert.equal(isPrivateIp('fd12:3456::abcd'), true);
  assert.equal(isPrivateIp('ff02::1'), true);
});

test('isPrivateIp accepts canonical public IPv6 addresses', () => {
  assert.equal(isPrivateIp('2606:4700:4700::1111'), false); // Cloudflare
  assert.equal(isPrivateIp('2001:4860:4860::8888'), false); // Google
});

test('isPrivateIp blocks IPv4-mapped IPv6 forms of private addresses', () => {
  assert.equal(isPrivateIp('::ffff:10.0.0.1'), true);
  assert.equal(isPrivateIp('::ffff:127.0.0.1'), true);
  assert.equal(isPrivateIp('::ffff:169.254.169.254'), true);
});

test('isPrivateIp rejects unparseable input defensively', () => {
  assert.equal(isPrivateIp('not-an-ip'), true);
  assert.equal(isPrivateIp(''), true);
  assert.equal(isPrivateIp('300.0.0.1'), true);
});

test('safeFetch rejects non-http schemes', async () => {
  await assert.rejects(safeFetch('file:///etc/passwd'), UnsafeUrlError);
  await assert.rejects(safeFetch('gopher://internal/'), UnsafeUrlError);
  await assert.rejects(safeFetch('data:text/html,foo'), UnsafeUrlError);
});

test('safeFetch rejects URLs whose hostname resolves to a private IP', async () => {
  // localhost resolves to 127.0.0.1 — must be blocked.
  await assert.rejects(safeFetch('http://localhost/'), UnsafeUrlError);
});

test('safeFetch rejects literal-IP URLs in private ranges', async () => {
  await assert.rejects(safeFetch('http://169.254.169.254/latest/meta-data/'), UnsafeUrlError);
  await assert.rejects(safeFetch('http://10.0.0.1/'), UnsafeUrlError);
  await assert.rejects(safeFetch('http://192.168.1.1/'), UnsafeUrlError);
});

test('safeFetch enforces an allowlist when provided', async () => {
  await assert.rejects(
    safeFetch('https://example.com/', { allowedHosts: ['allowed.example.com'] }),
    UnsafeUrlError
  );
});

test('safeFetch rejects malformed URLs', async () => {
  await assert.rejects(safeFetch(''), UnsafeUrlError);
  await assert.rejects(safeFetch('not a url'), UnsafeUrlError);
});
