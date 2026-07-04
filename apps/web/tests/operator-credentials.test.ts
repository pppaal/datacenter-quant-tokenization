import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  burnOperatorPasswordVerification,
  hashOperatorPassword,
  OPERATOR_PASSWORD_MIN_LENGTH,
  verifyOperatorPassword
} from '@/lib/security/operator-credentials';

test('hashOperatorPassword produces a self-describing scrypt hash that verifies', async () => {
  const password = 'correct-horse-battery-staple';
  const hash = await hashOperatorPassword(password);

  assert.ok(hash.startsWith('scrypt$'));
  assert.equal(hash.split('$').length, 6);
  assert.equal(await verifyOperatorPassword(password, hash), true);
});

test('two hashes of the same password differ (random salt) but both verify', async () => {
  const password = 'a-long-enough-password';
  const first = await hashOperatorPassword(password);
  const second = await hashOperatorPassword(password);

  assert.notEqual(first, second);
  assert.equal(await verifyOperatorPassword(password, first), true);
  assert.equal(await verifyOperatorPassword(password, second), true);
});

test('verifyOperatorPassword rejects a wrong password', async () => {
  const hash = await hashOperatorPassword('the-real-password-1');
  assert.equal(await verifyOperatorPassword('the-wrong-password-1', hash), false);
});

test('verifyOperatorPassword fails closed on malformed or missing hashes', async () => {
  assert.equal(await verifyOperatorPassword('anything-goes-here', null), false);
  assert.equal(await verifyOperatorPassword('anything-goes-here', undefined), false);
  assert.equal(await verifyOperatorPassword('anything-goes-here', ''), false);
  assert.equal(await verifyOperatorPassword('anything-goes-here', 'bcrypt$whatever'), false);
  assert.equal(await verifyOperatorPassword('anything-goes-here', 'scrypt$bad'), false);
  assert.equal(
    await verifyOperatorPassword('anything-goes-here', 'scrypt$0$0$0$$'),
    false,
    'zero-cost parameters must be rejected'
  );
});

test('verifyOperatorPassword rejects a tampered stored hash', async () => {
  const hash = await hashOperatorPassword('a-tamper-check-password');
  const segments = hash.split('$');
  const digest = segments[5];
  const flipped = (digest[0] === 'A' ? 'B' : 'A') + digest.slice(1);
  const tampered = [...segments.slice(0, 5), flipped].join('$');
  assert.equal(await verifyOperatorPassword('a-tamper-check-password', tampered), false);
});

test('hashOperatorPassword enforces the minimum length', async () => {
  const short = 'x'.repeat(OPERATOR_PASSWORD_MIN_LENGTH - 1);
  await assert.rejects(() => hashOperatorPassword(short));
});

test('burnOperatorPasswordVerification never throws', async () => {
  await burnOperatorPasswordVerification('whatever-password');
});
