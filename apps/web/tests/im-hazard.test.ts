import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyHazardScore, describeHazard } from '@/lib/services/im/hazard';

test('classifyHazardScore bands by typical 0-5 cutoffs', () => {
  assert.equal(classifyHazardScore(0), 'minimal');
  assert.equal(classifyHazardScore(0.4), 'minimal');
  assert.equal(classifyHazardScore(0.5), 'low');
  assert.equal(classifyHazardScore(0.99), 'low');
  assert.equal(classifyHazardScore(1.0), 'moderate');
  assert.equal(classifyHazardScore(1.8), 'moderate');
  assert.equal(classifyHazardScore(2.0), 'elevated');
  assert.equal(classifyHazardScore(2.9), 'elevated');
  assert.equal(classifyHazardScore(3.0), 'high');
  assert.equal(classifyHazardScore(5), 'high');
});

test('classifyHazardScore returns null for non-finite', () => {
  assert.equal(classifyHazardScore(null), null);
  assert.equal(classifyHazardScore(undefined), null);
  assert.equal(classifyHazardScore(NaN), null);
});

test('describeHazard returns label + tone', () => {
  assert.deepEqual(describeHazard(0.3), { band: 'minimal', label: 'Minimal', tone: 'good' });
  assert.deepEqual(describeHazard(1.8), { band: 'moderate', label: 'Moderate', tone: 'warn' });
  assert.deepEqual(describeHazard(4.0), { band: 'high', label: 'High', tone: 'risk' });
  assert.deepEqual(describeHazard(null), { band: null, label: '—', tone: null });
});
