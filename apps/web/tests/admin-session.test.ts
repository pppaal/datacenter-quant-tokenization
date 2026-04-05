import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminSessionToken, getAdminSessionCookieOptions, parseAdminSessionToken } from '@/lib/security/admin-session';

test('admin session token round-trips actor identity and role', async () => {
  const env = {
    NODE_ENV: 'test',
    ADMIN_SESSION_SECRET: 'session-secret',
    ADMIN_SESSION_TTL_HOURS: '4'
  } as NodeJS.ProcessEnv;
  const now = new Date('2026-04-05T10:00:00.000Z');

  const token = await createAdminSessionToken(
    {
      identifier: 'analyst@example.com',
      role: 'ANALYST'
    },
    env,
    now
  );

  assert.ok(token);
  assert.deepEqual(await parseAdminSessionToken(token, env, new Date('2026-04-05T11:00:00.000Z')), {
    identifier: 'analyst@example.com',
    role: 'ANALYST'
  });
  assert.equal(await parseAdminSessionToken(token, env, new Date('2026-04-05T15:00:01.000Z')), null);
});

test('admin session token rejects invalid signature', async () => {
  const env = {
    NODE_ENV: 'test',
    ADMIN_SESSION_SECRET: 'session-secret'
  } as NodeJS.ProcessEnv;
  const token = await createAdminSessionToken(
    {
      identifier: 'viewer@example.com',
      role: 'VIEWER'
    },
    env,
    new Date('2026-04-05T10:00:00.000Z')
  );

  assert.ok(token);
  assert.equal(await parseAdminSessionToken(`${token}tampered`, env), null);
});

test('admin session cookie options stay secure by environment', () => {
  const localOptions = getAdminSessionCookieOptions({ NODE_ENV: 'development' } as NodeJS.ProcessEnv);
  const prodOptions = getAdminSessionCookieOptions({ NODE_ENV: 'production' } as NodeJS.ProcessEnv);

  assert.equal(localOptions.httpOnly, true);
  assert.equal(localOptions.sameSite, 'lax');
  assert.equal(localOptions.secure, false);
  assert.equal(prodOptions.secure, true);
});
