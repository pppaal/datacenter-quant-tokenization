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

test('env() exposes the conventions burn-down keys', () => {
  withEnv(
    {
      BLOCKCHAIN_RPC_URLS: 'https://a.example, https://b.example',
      IPFS_PROVIDER: 'pinata',
      PINATA_JWT: 'jwt-token',
      W3S_TOKEN: undefined,
      KYC_WEBHOOK_TS_SKEW_SECONDS: '120',
      KYC_MOCK_SKIP_SIG: '1',
      KYC_SUMSUB_WEBHOOK_SECRET: 'sumsub-secret',
      VALUATION_ENGINE_MODE: 'python',
      SOURCE_REFRESH_STALE_HOURS: '12',
      SOURCE_REFRESH_BATCH_SIZE: '8',
      DART_API_KEY: 'dart',
      ECOS_API_KEY: 'ecos',
      MOLIT_API_KEY: 'molit',
      BOK_ECOS_API_KEY: 'bok',
      FRED_API_KEY: 'fred',
      TAVILY_API_KEY: 'tavily',
      SERPER_API_KEY: 'serper',
      OPENAQ_API_KEY: 'openaq',
      ENABLE_OVERPASS_POI: 'true',
      OVERPASS_API_URL: 'https://overpass.example',
      ENABLE_PEERINGDB: 'on',
      THINKHAZARD_API_BASE: 'https://thinkhazard.example',
      ENABLE_THINKHAZARD: '0',
      AWS_REGION: 'ap-northeast-2'
    },
    () => {
      const e = env();
      assert.equal(e.BLOCKCHAIN_RPC_URLS, 'https://a.example, https://b.example');
      assert.equal(e.IPFS_PROVIDER, 'pinata');
      assert.equal(e.PINATA_JWT, 'jwt-token');
      assert.equal(e.W3S_TOKEN, undefined);
      assert.equal(e.KYC_WEBHOOK_TS_SKEW_SECONDS, 120);
      assert.equal(e.KYC_MOCK_SKIP_SIG, '1');
      assert.equal(e.KYC_SUMSUB_WEBHOOK_SECRET, 'sumsub-secret');
      assert.equal(e.VALUATION_ENGINE_MODE, 'python');
      assert.equal(e.SOURCE_REFRESH_STALE_HOURS, 12);
      assert.equal(e.SOURCE_REFRESH_BATCH_SIZE, 8);
      assert.equal(e.DART_API_KEY, 'dart');
      assert.equal(e.ECOS_API_KEY, 'ecos');
      assert.equal(e.MOLIT_API_KEY, 'molit');
      assert.equal(e.BOK_ECOS_API_KEY, 'bok');
      assert.equal(e.FRED_API_KEY, 'fred');
      assert.equal(e.TAVILY_API_KEY, 'tavily');
      assert.equal(e.SERPER_API_KEY, 'serper');
      assert.equal(e.OPENAQ_API_KEY, 'openaq');
      assert.equal(e.ENABLE_OVERPASS_POI, true);
      assert.equal(e.OVERPASS_API_URL, 'https://overpass.example');
      assert.equal(e.ENABLE_PEERINGDB, true);
      assert.equal(e.THINKHAZARD_API_BASE, 'https://thinkhazard.example');
      assert.equal(e.ENABLE_THINKHAZARD, false);
      assert.equal(e.AWS_REGION, 'ap-northeast-2');
    }
  );
});
