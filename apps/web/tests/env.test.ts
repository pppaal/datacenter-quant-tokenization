import assert from 'node:assert/strict';
import test from 'node:test';
import { __resetEnvCache, env } from '@/lib/env';

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(overrides)) {
    previous.set(key, process.env[key]);
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key]!;
    }
  }
  __resetEnvCache();
  try {
    return fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    __resetEnvCache();
  }
}

test('env() coerces booleans from common truthy strings', () => {
  withEnv(
    {
      BLOCKCHAIN_MOCK_MODE: 'true',
      ADMIN_ALLOW_UNBOUND_BROWSER_SESSION: 'YES',
      OPS_ALERT_NOTIFY_ON_RECOVERY: '0'
    },
    () => {
      const e = env();
      assert.equal(e.BLOCKCHAIN_MOCK_MODE, true);
      assert.equal(e.ADMIN_ALLOW_UNBOUND_BROWSER_SESSION, true);
      assert.equal(e.OPS_ALERT_NOTIFY_ON_RECOVERY, false);
    }
  );
});

test('env() coerces numbers and rejects non-numeric values', () => {
  withEnv({ ADMIN_API_RATE_MAX: '120' }, () => {
    assert.equal(env().ADMIN_API_RATE_MAX, 120);
  });
  withEnv({ ADMIN_API_RATE_MAX: 'twenty' }, () => {
    assert.throws(() => env(), /ADMIN_API_RATE_MAX must be a number/);
  });
});

test('env() returns undefined for missing optional strings', () => {
  withEnv({ OPS_ALERT_WEBHOOK_URL: undefined }, () => {
    assert.equal(env().OPS_ALERT_WEBHOOK_URL, undefined);
  });
});

test('env() trims whitespace and treats blank-only as undefined', () => {
  withEnv({ APP_BASE_URL: '   ' }, () => {
    assert.equal(env().APP_BASE_URL, undefined);
  });
  withEnv({ APP_BASE_URL: '  https://app.example.com  ' }, () => {
    assert.equal(env().APP_BASE_URL, 'https://app.example.com');
  });
});

test('env() accepts a valid LOG_LEVEL enum value', () => {
  withEnv({ LOG_LEVEL: 'warn' }, () => {
    assert.equal(env().LOG_LEVEL, 'warn');
  });
  withEnv({ LOG_LEVEL: 'verbose' }, () => {
    assert.throws(() => env(), /LOG_LEVEL/);
  });
});
