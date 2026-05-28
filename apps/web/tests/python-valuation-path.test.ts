import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { resolvePythonScriptPath, runPythonValuation } from '@/lib/services/python-valuation';
import { logger } from '@/lib/observability/logger';
import type { UnderwritingBundle } from '@/lib/services/valuation-engine';

const SCRIPT_TAIL = path.join('services', 'valuation_python', 'engine.py');

test('resolvePythonScriptPath ends at the expected engine location', () => {
  delete process.env.VAL_PYTHON_SCRIPT_PATH;
  const resolved = resolvePythonScriptPath();
  assert.ok(path.isAbsolute(resolved), 'path should be absolute');
  assert.ok(resolved.endsWith(SCRIPT_TAIL), `expected path to end with ${SCRIPT_TAIL}, got ${resolved}`);
  // It must land inside apps/web, derived from the module location.
  assert.ok(resolved.includes(path.join('apps', 'web', 'services', 'valuation_python')), resolved);
});

test('resolvePythonScriptPath does NOT depend on process.cwd()', () => {
  delete process.env.VAL_PYTHON_SCRIPT_PATH;
  const fromHere = resolvePythonScriptPath();

  const realCwd = process.cwd;
  try {
    // Simulate a serverless/monorepo cwd (repo root or lambda root).
    process.cwd = () => '/var/task';
    const fromFakeCwd = resolvePythonScriptPath();
    assert.equal(fromHere, fromFakeCwd, 'resolved path must be identical regardless of cwd');
    assert.ok(!fromFakeCwd.startsWith('/var/task'), 'must not be rooted at the fake cwd');
  } finally {
    process.cwd = realCwd;
  }
});

test('VAL_PYTHON_SCRIPT_PATH override is honored', () => {
  process.env.VAL_PYTHON_SCRIPT_PATH = '/opt/custom/engine.py';
  try {
    assert.equal(resolvePythonScriptPath(), '/opt/custom/engine.py');
  } finally {
    delete process.env.VAL_PYTHON_SCRIPT_PATH;
  }
});

test('runPythonValuation returns null AND logs a warning when the script is missing', async () => {
  // Point at a guaranteed-missing path so scriptExists() is false, exercising
  // the documented contract: null return + a warn line (instead of a silent
  // no-op). Path is resolved per-call, so the override takes effect here.
  process.env.VAL_PYTHON_SCRIPT_PATH = '/nonexistent/path/to/engine.py';

  const warnings: Array<{ msg: string; fields?: Record<string, unknown> }> = [];
  const realWarn = logger.warn;
  logger.warn = (msg: string, fields?: Record<string, unknown>) => {
    warnings.push({ msg, fields });
  };

  // Minimal bundle; the function short-circuits before reading most fields when
  // the script is missing. Cast keeps the test offline and decoupled from the
  // full underwriting shape.
  const bundle = {
    asset: {
      assetCode: 'DC-TEST',
      name: 'Test DC',
      stage: 'PIPELINE',
      market: 'SEOUL',
      assetClass: 'DATA_CENTER'
    }
  } as unknown as UnderwritingBundle;

  try {
    const result = await runPythonValuation(bundle);
    assert.equal(result, null);
    const missing = warnings.find((w) => w.msg === 'python_valuation_script_missing');
    assert.ok(missing, 'expected a python_valuation_script_missing warning');
    assert.ok(
      typeof missing?.fields?.scriptPath === 'string' &&
        (missing.fields.scriptPath as string).endsWith('engine.py'),
      'warning should include the resolved script path'
    );
  } finally {
    logger.warn = realWarn;
    delete process.env.VAL_PYTHON_SCRIPT_PATH;
  }
});
