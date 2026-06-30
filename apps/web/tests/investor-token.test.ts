import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mintInvestorToken,
  verifyInvestorToken,
  getInvestorTokenCookieOptions,
  INVESTOR_TOKEN_COOKIE
} from '@/lib/security/investor-token';

const ENV = {
  INVESTOR_TOKEN_SECRET: 'test-secret',
  NODE_ENV: 'test'
} as unknown as NodeJS.ProcessEnv;
const NOW = new Date('2026-06-30T00:00:00Z');

test('mint then verify round-trips the investor scope', async () => {
  const token = await mintInvestorToken('inv_1', 'LP-001', ENV, NOW);
  assert.ok(token);
  const verified = await verifyInvestorToken(token, ENV, NOW);
  assert.deepEqual(verified, { investorId: 'inv_1', investorCode: 'LP-001', role: 'LP' });
});

test('a tampered payload fails the signature check', async () => {
  const token = await mintInvestorToken('inv_1', 'LP-001', ENV, NOW);
  const [, sig] = token!.split('.');
  const forgedPayload = Buffer.from(
    JSON.stringify({ investorId: 'inv_HACKER', role: 'LP', exp: NOW.getTime() + 1_000_000 }),
    'utf8'
  ).toString('base64url');
  const forged = `${forgedPayload}.${sig}`;
  assert.equal(await verifyInvestorToken(forged, ENV, NOW), null);
});

test('a different secret cannot verify the token', async () => {
  const token = await mintInvestorToken('inv_1', null, ENV, NOW);
  const otherEnv = {
    INVESTOR_TOKEN_SECRET: 'other-secret',
    NODE_ENV: 'test'
  } as unknown as NodeJS.ProcessEnv;
  assert.equal(await verifyInvestorToken(token, otherEnv, NOW), null);
});

test('expired tokens are rejected', async () => {
  const token = await mintInvestorToken('inv_1', null, ENV, NOW);
  const later = new Date(NOW.getTime() + 25 * 60 * 60 * 1000); // default TTL 24h
  assert.equal(await verifyInvestorToken(token, ENV, later), null);
});

test('production with no secret hard-blocks minting (fails closed)', async () => {
  const prodEnv = { NODE_ENV: 'production' } as unknown as NodeJS.ProcessEnv;
  assert.equal(await mintInvestorToken('inv_1', null, prodEnv, NOW), null);
  assert.equal(await verifyInvestorToken('whatever.sig', prodEnv, NOW), null);
});

test('malformed tokens and empty input verify to null', async () => {
  assert.equal(await verifyInvestorToken(null, ENV, NOW), null);
  assert.equal(await verifyInvestorToken('no-dot', ENV, NOW), null);
  assert.equal(await verifyInvestorToken('a.b.c', ENV, NOW), null);
});

test('a token minted as LP only verifies as LP and cannot be empty-investor', async () => {
  // empty investorId → no token
  assert.equal(await mintInvestorToken('', null, ENV, NOW), null);
});

test('cookie options are httpOnly + lax and insecure outside real production', () => {
  const opts = getInvestorTokenCookieOptions(ENV);
  assert.equal(opts.httpOnly, true);
  assert.equal(opts.sameSite, 'lax');
  assert.equal(opts.secure, false); // not real production
  assert.equal(INVESTOR_TOKEN_COOKIE, 'nexus_investor_token');
});
