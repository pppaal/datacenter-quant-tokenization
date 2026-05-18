import assert from 'node:assert/strict';
import test from 'node:test';
import { chunkText } from '@/lib/services/research/document-indexer';

test('chunkText returns single chunk for short text', () => {
  const result = chunkText('Short document content.');
  assert.equal(result.length, 1);
  assert.equal(result[0], 'Short document content.');
});

test('chunkText returns empty array for empty / whitespace input', () => {
  assert.deepEqual(chunkText(''), []);
  assert.deepEqual(chunkText('   \n  \t  '), []);
});

test('chunkText collapses whitespace before chunking', () => {
  const text = 'first\n\n\nsentence.\t\tsecond  sentence.';
  const result = chunkText(text);
  assert.equal(result.length, 1);
  assert.equal(result[0], 'first sentence. second sentence.');
});

test('chunkText splits long text into multiple chunks with overlap', () => {
  // Build a string > TARGET_CHUNK_CHARS (1200) with sentence boundaries.
  const sentence = 'This is a deliberately long sentence about Korean office market dynamics. ';
  const text = sentence.repeat(40);
  const result = chunkText(text);
  assert.ok(result.length >= 2, `expected >= 2 chunks, got ${result.length}`);
  for (const chunk of result) {
    assert.ok(chunk.length > 0);
    assert.ok(chunk.length <= 1500, `chunk too large: ${chunk.length}`);
  }
});

test('chunkText preserves rough overlap between adjacent chunks', () => {
  const sentence = 'This sentence has some content. ';
  const text = sentence.repeat(60);
  const chunks = chunkText(text);
  if (chunks.length < 2) {
    assert.fail('expected multiple chunks for overlap test');
  }
  // The tail of chunk[0] should appear at or near the head of chunk[1].
  const tail = chunks[0]!.slice(-50);
  const head = chunks[1]!.slice(0, 250);
  assert.ok(
    head.includes(tail.slice(-20)) || head.startsWith(tail.slice(0, 20)) || tail.length < 20,
    'expected tail of chunk N to appear near head of chunk N+1'
  );
});

test('chunkText prefers sentence boundaries over hard cuts', () => {
  // Construct text where the natural sentence break is just before the
  // 1200-char target — chunkText should land the cut on the period.
  const head = 'A'.repeat(1100) + '. ';
  const tail = 'B'.repeat(1500);
  const chunks = chunkText(head + tail);
  assert.ok(chunks[0]!.endsWith('.'), `first chunk should end at sentence: "${chunks[0]!.slice(-10)}"`);
});
