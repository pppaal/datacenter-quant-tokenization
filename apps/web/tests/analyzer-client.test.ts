import assert from 'node:assert/strict';
import test from 'node:test';
import { __resetEnvCache } from '@/lib/env';
import {
  analyzerHeaders,
  buildProxyBody,
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
  assert.equal(toAnalyzerDealId('Demo-Deal'), 'demo-deal');
  assert.equal(toAnalyzerDealId('Project Example / Model 2024'), 'project-example-model-2024');
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
  assert.equal(overview.route.target('demo-deal', overview.match), '/api/docs/overview/demo-deal');
  assert.equal(overview.route.minRole, 'VIEWER');

  const digest = matchProxyRoute('POST', '/docs/digest/');
  assert.ok(digest);
  assert.equal(digest.route.target('demo-deal', digest.match), '/api/docs/digest');
  assert.equal(digest.route.mutation, true);
  assert.equal(digest.route.minRole, 'ANALYST');

  const nda = matchProxyRoute('POST', 'compliance/nda');
  assert.ok(nda);
  assert.equal(nda.route.minRole, 'ADMIN');

  const out = matchProxyRoute('GET', 'docs/outputs/model_check.md');
  assert.ok(out);
  assert.equal(
    out.route.target('demo-deal', out.match),
    '/api/docs/outputs/demo-deal/model_check.md'
  );
  const bad = matchProxyRoute('GET', 'docs/outputs/..%2F..%2Fetc');
  assert.ok(bad);
  assert.equal(bad.route.target('demo-deal', bad.match), null);

  for (const name of ['kr_docs', 'rentroll', 'injection', 'checklists', 'bank_metrics']) {
    const run = matchProxyRoute('POST', `docs/${name}`);
    assert.ok(run, name);
    assert.equal(run.route.target('demo-deal', run.match), `/api/docs/${name}`);
    assert.equal(run.route.minRole, 'ANALYST');
    assert.equal(run.route.mutation, true);
  }
  const ic = matchProxyRoute('GET', 'docs/outputs/icmemo_demo-deal_draft.docx');
  assert.ok(ic);
  assert.equal(
    ic.route.target('demo-deal', ic.match),
    '/api/docs/outputs/demo-deal/icmemo_demo-deal_draft.docx'
  );
  const cl = matchProxyRoute('GET', 'docs/checklists');
  assert.ok(cl);
  assert.equal(cl.route.target('demo-deal', cl.match), '/api/docs/checklists/demo-deal');
  const wf = matchProxyRoute('GET', 'workflow');
  assert.ok(wf);
  assert.equal(wf.route.target('demo-deal', wf.match), '/api/workflow/demo-deal');
  assert.equal(wf.route.minRole, 'VIEWER');
  for (const name of ['gate', 'review', 'submit', 'comment']) {
    const w = matchProxyRoute('POST', `workflow/${name}`);
    assert.ok(w, name);
    assert.equal(w.route.target('demo-deal', w.match), `/api/workflow/${name}`);
    assert.equal(w.route.minRole, 'ANALYST');
  }
  const decide = matchProxyRoute('POST', 'workflow/decide');
  assert.ok(decide);
  assert.equal(decide.route.minRole, 'ADMIN', 'stage decisions need an OS admin');
  assert.equal(matchProxyRoute('POST', 'workflow/delete'), null);
  assert.equal(matchProxyRoute('GET', 'docs/kr_docs'), null);
  assert.equal(matchProxyRoute('GET', 'docs/digest'), null);
  assert.equal(matchProxyRoute('POST', 'docs/overview'), null);
  assert.equal(matchProxyRoute('POST', 'compliance/destroy'), null);
  assert.equal(matchProxyRoute('GET', 'docs/deals'), null);
  assert.equal(matchProxyRoute('POST', 'login'), null);
});

test('agent company: reads for viewers, runs for analysts, waivers for admins only', () => {
  const status = matchProxyRoute('GET', 'agents');
  assert.ok(status);
  assert.equal(status.route.minRole, 'VIEWER');
  assert.equal(status.route.target('demo-deal', status.match), '/api/agents/demo-deal');
  const org = matchProxyRoute('GET', 'agents/org');
  assert.ok(org);
  assert.equal(org.route.target('demo-deal', org.match), '/api/agents/org');
  const ledger = matchProxyRoute('GET', 'agents/ledger');
  assert.ok(ledger);
  assert.equal(ledger.route.mutation, false);
  assert.match(
    ledger.route.target('demo-deal', ledger.match) ?? '',
    /^\/api\/agents\/demo-deal\/ledger\?/
  );
  const simLedger = matchProxyRoute('GET', 'agents/simulation/ledger');
  assert.ok(simLedger);
  assert.match(simLedger.route.target('demo-deal', simLedger.match) ?? '', /simulation=true/);

  const run = matchProxyRoute('POST', 'agents/run');
  assert.ok(run);
  assert.equal(run.route.minRole, 'ANALYST');
  assert.equal(run.route.mutation, true);

  const resolve = matchProxyRoute('POST', 'agents/resolve');
  const waive = matchProxyRoute('POST', 'agents/waive');
  assert.ok(resolve && waive);
  assert.equal(resolve.route.minRole, 'ANALYST', 'marking fixed is re-checked on the next run');
  assert.equal(waive.route.minRole, 'ADMIN', 'a waiver accepts the risk, like a stage decision');
  assert.equal(resolve.route.target('d', resolve.match), '/api/agents/resolve');
  assert.equal(waive.route.target('d', waive.match), '/api/agents/resolve');

  // No agent route can record a stage decision; decide stays ADMIN-only on workflow/decide.
  assert.equal(matchProxyRoute('POST', 'agents/decide'), null);
  assert.equal(matchProxyRoute('GET', 'agents/run'), null);
  assert.equal(matchProxyRoute('POST', 'agents/ledger'), null);
  assert.equal(matchProxyRoute('GET', 'agents/../workflow'), null);
});

test('proxied POST body: the OS pins waive and always chooses deal and operator', () => {
  const resolve = matchProxyRoute('POST', 'agents/resolve');
  const waive = matchProxyRoute('POST', 'agents/waive');
  assert.ok(resolve && waive);
  const sneaky = {
    finding_id: 'F-0123456789',
    note: '확인함',
    waive: true,
    deal_id: 'other-deal',
    operator: 'agent:deal_head'
  };
  const r = buildProxyBody(resolve.route, sneaky, 'demo-deal', '김분석');
  assert.equal(r.waive, false, 'an analyst cannot turn a resolve into a waiver');
  assert.equal(r.deal_id, 'demo-deal');
  assert.equal(r.operator, '김분석');
  assert.equal(r.finding_id, 'F-0123456789');
  const w = buildProxyBody(waive.route, { ...sneaky, waive: false }, 'demo-deal', '박관리');
  assert.equal(w.waive, true);
  assert.equal(w.operator, '박관리');

  const digest = matchProxyRoute('POST', 'docs/digest');
  assert.ok(digest);
  const d = buildProxyBody(digest.route, { budget: 3000, deal_id: 'x' }, 'demo-deal', 'op');
  assert.deepEqual(d, { budget: 3000, deal_id: 'demo-deal', operator: 'op' });
});

test('forwarding is a no-op when the analyzer is not configured', async () => {
  await withEnv({ ANALYZER_URL: undefined, ANALYZER_SERVICE_TOKEN: undefined }, async () => {
    const result = await forwardDocumentToAnalyzer({
      dealCode: 'Demo-Deal',
      operator: { identifier: 'kim', role: 'ANALYST' },
      fileName: 'a.pdf',
      bytes: new Uint8Array([1, 2, 3])
    });
    assert.deepEqual(result, { ok: false, skipped: true, error: 'not configured' });
  });
});
