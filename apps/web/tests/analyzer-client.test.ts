import assert from 'node:assert/strict';
import test from 'node:test';
import { __resetEnvCache } from '@/lib/env';
import {
  analyzerHeaders,
  forwardDocumentToAnalyzer,
  getAnalyzerConfig,
  matchProxyRoute,
  toAnalyzerDealId,
  toAnalyzerRole
} from '@/lib/services/analyzer';

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

const TOKEN = 'a-very-long-shared-service-token-123456';

test('toAnalyzerDealId maps OS deal codes onto the analyzer id grammar', () => {
  assert.equal(toAnalyzerDealId('Cottonwood'), 'cottonwood');
  assert.equal(toAnalyzerDealId('Project Alamo / Tosca 2024'), 'project-alamo-tosca-2024');
  assert.equal(toAnalyzerDealId('--DC.Seoul.01--'), 'dc-seoul-01');
  assert.equal(toAnalyzerDealId('   '), 'deal');
  assert.equal(toAnalyzerDealId('x'.repeat(100)).length, 60);
});

test('only ADMIN becomes the analyzer admin; everyone else is analyst', () => {
  assert.equal(toAnalyzerRole('ADMIN'), 'admin');
  assert.equal(toAnalyzerRole('ANALYST'), 'analyst');
  assert.equal(toAnalyzerRole('VIEWER'), 'analyst');
});

test('config is null when unset or when the token is too short for the analyzer', () => {
  withEnv({ ANALYZER_URL: undefined, ANALYZER_SERVICE_TOKEN: undefined }, () => {
    assert.equal(getAnalyzerConfig(), null);
  });
  withEnv({ ANALYZER_URL: 'http://analyzer:8000/', ANALYZER_SERVICE_TOKEN: 'short' }, () => {
    assert.equal(getAnalyzerConfig(), null);
  });
  withEnv(
    {
      ANALYZER_URL: 'http://analyzer:8000/',
      ANALYZER_SERVICE_TOKEN: TOKEN,
      ANALYZER_TIMEOUT_MS: '5000'
    },
    () => {
      const cfg = getAnalyzerConfig();
      assert.ok(cfg);
      assert.equal(cfg.url, 'http://analyzer:8000');
      assert.equal(cfg.timeoutMs, 5000);
    }
  );
});

test('headers carry the service token and a sanitized operator', () => {
  const headers = analyzerHeaders(
    { url: 'http://a', token: TOKEN, timeoutMs: 1 },
    { identifier: 'kim|analyst\nx', role: 'ANALYST' }
  );
  assert.equal(headers['X-Service-Token'], TOKEN);
  assert.equal(headers['X-Operator'], 'kim%20analyst%20x');
  assert.equal(
    analyzerHeaders(
      { url: 'http://a', token: TOKEN, timeoutMs: 1 },
      { identifier: '김분석', role: 'ADMIN' }
    )['X-Operator'],
    encodeURIComponent('김분석')
  );
  assert.equal(headers['X-Operator-Role'], 'analyst');
});

test('proxy allow-list: deal-scoped reads and runs only, nothing else', () => {
  const overview = matchProxyRoute('GET', 'docs/overview');
  assert.ok(overview);
  assert.equal(
    overview.route.target('cottonwood', overview.match),
    '/api/docs/overview/cottonwood'
  );
  assert.equal(overview.route.minRole, 'VIEWER');

  const digest = matchProxyRoute('POST', '/docs/digest/');
  assert.ok(digest);
  assert.equal(digest.route.target('cottonwood', digest.match), '/api/docs/digest');
  assert.equal(digest.route.mutation, true);
  assert.equal(digest.route.minRole, 'ANALYST');

  const nda = matchProxyRoute('POST', 'compliance/nda');
  assert.ok(nda);
  assert.equal(nda.route.minRole, 'ADMIN');

  const out = matchProxyRoute('GET', 'docs/outputs/model_check.md');
  assert.ok(out);
  assert.equal(
    out.route.target('cottonwood', out.match),
    '/api/docs/outputs/cottonwood/model_check.md'
  );
  const bad = matchProxyRoute('GET', 'docs/outputs/..%2F..%2Fetc');
  assert.ok(bad);
  assert.equal(bad.route.target('cottonwood', bad.match), null);

  for (const name of ['kr_docs', 'rentroll', 'injection']) {
    const run = matchProxyRoute('POST', `docs/${name}`);
    assert.ok(run, name);
    assert.equal(run.route.target('cottonwood', run.match), `/api/docs/${name}`);
    assert.equal(run.route.minRole, 'ANALYST');
    assert.equal(run.route.mutation, true);
  }
  const ic = matchProxyRoute('GET', 'docs/outputs/icmemo_cottonwood_draft.docx');
  assert.ok(ic);
  assert.equal(
    ic.route.target('cottonwood', ic.match),
    '/api/docs/outputs/cottonwood/icmemo_cottonwood_draft.docx'
  );
  assert.equal(matchProxyRoute('GET', 'docs/kr_docs'), null);
  assert.equal(matchProxyRoute('GET', 'docs/digest'), null);
  assert.equal(matchProxyRoute('POST', 'docs/overview'), null);
  assert.equal(matchProxyRoute('POST', 'compliance/destroy'), null);
  assert.equal(matchProxyRoute('GET', 'docs/deals'), null);
  assert.equal(matchProxyRoute('POST', 'login'), null);
});

test('forwarding is a no-op when the analyzer is not configured', async () => {
  await withEnv({ ANALYZER_URL: undefined, ANALYZER_SERVICE_TOKEN: undefined }, async () => {
    const result = await forwardDocumentToAnalyzer({
      dealCode: 'Cottonwood',
      operator: { identifier: 'kim', role: 'ANALYST' },
      fileName: 'a.pdf',
      bytes: new Uint8Array([1, 2, 3])
    });
    assert.deepEqual(result, { ok: false, skipped: true, error: 'not configured' });
  });
});
