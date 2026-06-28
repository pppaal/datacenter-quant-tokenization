import assert from 'node:assert/strict';
import { test } from 'node:test';
import { logger, reportError } from '@/lib/observability/logger';

/**
 * The logger is an observability helper used at 45+ call sites — it must NEVER
 * throw, even when handed a value JSON.stringify chokes on (a circular
 * reference). Previously safeStringify called JSON.stringify with no cycle
 * guard, so a cyclic field propagated "Converting circular structure to JSON"
 * synchronously into every caller (and rejected the never-throws reportError).
 */

function captureConsole<T>(fn: () => T): { result: T; lines: string[] } {
  const lines: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (line?: unknown) => {
    lines.push(String(line));
  };
  console.error = (line?: unknown) => {
    lines.push(String(line));
  };
  try {
    const result = fn();
    return { result, lines };
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}

test('logger.error does not throw on a circular field and marks the cycle', () => {
  const cyclic: Record<string, unknown> = { kind: 'prisma-entity' };
  cyclic.self = cyclic; // back-reference

  const { lines } = captureConsole(() => {
    assert.doesNotThrow(() => logger.error('circular_field', { entity: cyclic }));
  });

  assert.equal(lines.length, 1, 'expected exactly one emitted line');
  assert.match(lines[0]!, /\[Circular\]/, 'the cycle must be rendered as [Circular]');
  // The real message survives and the line is valid JSON.
  const parsed = JSON.parse(lines[0]!);
  assert.equal(parsed.msg, 'circular_field');
});

test('logger.info still serializes normal fields and bigint/Error', () => {
  const { lines } = captureConsole(() => {
    logger.error('normal', { n: 42n, err: new Error('boom'), nested: { a: 1 } });
  });
  const parsed = JSON.parse(lines[0]!);
  assert.equal(parsed.n, '42'); // bigint → string
  assert.equal(parsed.err.message, 'boom'); // Error → {name,message,stack}
  assert.equal(parsed.nested.a, 1);
});

test('reportError never throws, even with a circular context (no backend configured)', async () => {
  // Keep the test network-free: ensure neither backend is configured so no
  // fetch / Sentry import runs.
  delete process.env.ERROR_REPORT_WEBHOOK_URL;
  delete process.env.SENTRY_DSN;
  const cyclic: Record<string, unknown> = {};
  cyclic.loop = cyclic;
  await captureConsole(() => reportError(new Error('reported'), { ctx: cyclic })).result;
  // Reaching here without rejection is the assertion; make it explicit.
  assert.ok(true);
});
