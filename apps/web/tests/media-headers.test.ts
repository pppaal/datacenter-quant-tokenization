import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMediaServingHeaders } from '@/lib/storage/media-headers';

test('svg media is forced to download + sandboxed (stored-XSS guard)', () => {
  const h = buildMediaServingHeaders('image/svg+xml', 1024);
  assert.equal(h['Content-Disposition'], 'attachment');
  assert.match(h['Content-Security-Policy'] ?? '', /default-src 'none'/);
  assert.match(h['Content-Security-Policy'] ?? '', /sandbox/);
  assert.equal(h['X-Content-Type-Options'], 'nosniff');
});

test('xml media is also treated as dangerous-inline', () => {
  for (const mime of ['text/xml', 'application/xml', 'IMAGE/SVG+XML']) {
    const h = buildMediaServingHeaders(mime, 10);
    assert.equal(h['Content-Disposition'], 'attachment', `${mime} must download`);
  }
});

test('raster images are served inline (no attachment) but still nosniff', () => {
  const h = buildMediaServingHeaders('image/png', 2048);
  assert.equal(h['Content-Disposition'], undefined, 'png must render inline for the gallery');
  assert.equal(h['Content-Security-Policy'], undefined);
  assert.equal(h['X-Content-Type-Options'], 'nosniff');
  assert.equal(h['Content-Type'], 'image/png');
  assert.equal(h['Content-Length'], '2048');
});
