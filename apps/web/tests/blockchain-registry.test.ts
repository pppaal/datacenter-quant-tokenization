import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRegistryAssetId,
  buildRegistryMetadataRef,
  normalizeDocumentHash,
  shortenHash
} from '@/lib/blockchain/registry';

test('blockchain registry helpers derive stable ids and metadata refs', () => {
  assert.equal(
    buildRegistryAssetId(' kr-seoul-dc-01 '),
    '0x7c3456d76c915d5ef542577e26be14877c593c4e3d4b21e4233b3b91672aabe8'
  );
  assert.equal(
    buildRegistryMetadataRef('asset_123', 'http://localhost:3000/'),
    'http://localhost:3000/api/readiness/assets/asset_123'
  );
});

test('blockchain registry helpers normalize document hashes and shorten tx ids', () => {
  assert.equal(
    normalizeDocumentHash('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  );
  assert.equal(shortenHash('0x1234567890abcdef1234567890abcdef', 6), '0x1234...abcdef');
  assert.throws(
    () => normalizeDocumentHash('bad-hash'),
    /Document hash must be a 32-byte SHA-256 hex string/
  );
});
