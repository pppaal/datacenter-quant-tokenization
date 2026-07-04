import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifySourceDataOrigin } from '@/lib/services/sources';

test('classifySourceDataOrigin flags built-in fallback datasets', () => {
  assert.equal(classifySourceDataOrigin('fallback dataset'), 'fallback');
  assert.equal(classifySourceDataOrigin('Fallback Dataset'), 'fallback');
  assert.equal(classifySourceDataOrigin('market feed unavailable'), 'fallback');
});

test('classifySourceDataOrigin recognizes live and manual origins', () => {
  assert.equal(classifySourceDataOrigin('fresh api'), 'live');
  assert.equal(classifySourceDataOrigin('identity rate'), 'live');
  assert.equal(classifySourceDataOrigin('manual override'), 'manual');
});

test('classifySourceDataOrigin fails to unknown, never to live', () => {
  assert.equal(classifySourceDataOrigin(null), 'unknown');
  assert.equal(classifySourceDataOrigin(undefined), 'unknown');
  assert.equal(classifySourceDataOrigin(''), 'unknown');
  assert.equal(classifySourceDataOrigin('some future label'), 'unknown');
});
