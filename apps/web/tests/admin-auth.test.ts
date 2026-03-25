import assert from 'node:assert/strict';
import test from 'node:test';
import { getAdminAuthConfig, isAdminAuthorized } from '@/lib/security/admin-auth';

test('admin auth config is disabled when both credentials are missing', () => {
  const config = getAdminAuthConfig({ NODE_ENV: 'test' });
  assert.equal(config.mode, 'disabled');
});

test('admin auth config is misconfigured when only one credential is present', () => {
  const config = getAdminAuthConfig({ NODE_ENV: 'test', ADMIN_BASIC_AUTH_USER: 'admin' });
  assert.equal(config.mode, 'misconfigured');
});

test('admin auth accepts a valid basic auth header', () => {
  const config = getAdminAuthConfig({
    NODE_ENV: 'test',
    ADMIN_BASIC_AUTH_USER: 'admin',
    ADMIN_BASIC_AUTH_PASSWORD: 'secret'
  });
  const header = `Basic ${Buffer.from('admin:secret').toString('base64')}`;

  assert.equal(isAdminAuthorized(header, config), true);
  assert.equal(isAdminAuthorized(`Basic ${Buffer.from('admin:wrong').toString('base64')}`, config), false);
});
