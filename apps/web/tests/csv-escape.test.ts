import assert from 'node:assert/strict';
import { test } from 'node:test';
import { csvEscape } from '@/lib/security/csv';

test('csvEscape neutralizes formula-injection lead characters', () => {
  // Each dangerous lead char must be prefixed with a single quote.
  assert.equal(csvEscape('=1+2'), "'=1+2");
  assert.equal(csvEscape('+1'), "'+1");
  assert.equal(csvEscape('-cmd'), "'-cmd");
  assert.equal(csvEscape('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvEscape('\tlead-tab'), "'\tlead-tab");
});

test('csvEscape quotes a formula cell that also contains a comma', () => {
  // Formula prefix happens first, then RFC-4180 quoting wraps the comma.
  assert.equal(csvEscape('=HYPERLINK("http://x"),y'), '"\'=HYPERLINK(""http://x""),y"');
});

test('csvEscape leaves safe values untouched', () => {
  assert.equal(csvEscape('Acme Tower'), 'Acme Tower');
  assert.equal(csvEscape(1234), '1234');
  assert.equal(csvEscape(''), '');
  assert.equal(csvEscape(null), '');
  assert.equal(csvEscape(undefined), '');
});

test('csvEscape still applies RFC-4180 quoting to commas/quotes/newlines', () => {
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('she said "hi"'), '"she said ""hi"""');
  assert.equal(csvEscape('line1\nline2'), '"line1\nline2"');
});
