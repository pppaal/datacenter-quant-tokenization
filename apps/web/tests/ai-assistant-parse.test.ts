import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseResearchSummary, parseDealScore } from '@/lib/services/ai-assistant';

// The LLM output-parsing contract, unit-tested without an API key. Pins the
// validation/coercion the underwriting + research summaries rely on.

test('parseResearchSummary extracts summary + filters bullets', () => {
  const out = parseResearchSummary(
    JSON.stringify({ summary: '  Strong office demand.  ', bullets: ['a', '', 2, '  b  '] })
  );
  assert.equal(out.summary, 'Strong office demand.');
  assert.deepEqual(out.bullets, ['a', 'b']); // empties + non-strings dropped, trimmed
});

test('parseResearchSummary rejects a missing/empty summary', () => {
  assert.throws(() => parseResearchSummary(JSON.stringify({ bullets: ['x'] })), /invalid summary/);
  assert.throws(() => parseResearchSummary(JSON.stringify({ summary: '   ' })), /invalid summary/);
});

test('parseDealScore clamps the score and sanitizes flags', () => {
  const out = parseDealScore(
    JSON.stringify({ score: 999, reasoning: 'ok', redFlags: ['r', 1], greenFlags: 'nope' })
  );
  assert.equal(out.score, 100); // clamped to 0..100
  assert.equal(out.reasoning, 'ok');
  assert.deepEqual(out.redFlags, ['r']); // non-strings dropped
  assert.deepEqual(out.greenFlags, []); // non-array → empty
});

test('parseDealScore defaults a non-numeric score to 0 and requires reasoning', () => {
  const out = parseDealScore(JSON.stringify({ score: 'high', reasoning: 'x' }));
  assert.equal(out.score, 0);
  assert.throws(() => parseDealScore(JSON.stringify({ score: 50 })), /invalid deal score/);
});

test('both parsers reject non-object JSON (array / scalar) and non-JSON', () => {
  // OpenAI json_object mode returns an object; defend against a misbehaving model.
  assert.throws(() => parseResearchSummary(JSON.stringify(['a', 'b'])));
  assert.throws(() => parseResearchSummary(JSON.stringify('just a string')));
  assert.throws(() => parseDealScore('not json at all'));
});
