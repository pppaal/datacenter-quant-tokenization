import assert from 'node:assert/strict';
import { mkdtemp, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DocumentType } from '@prisma/client';
import { uploadDocumentVersion } from '@/lib/services/documents';
import { createLocalDocumentStorage } from '@/lib/storage/local';

test('document upload stores a file, summary, and hash metadata', async () => {
  let captured: any;
  let extractionCalledWith: any;
  let financialIngestionCalledWith: any;
  let promotionCalledWith: any;
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'kdc-docs-'));

  const fakeDb = {
    asset: {
      async findUnique() {
        return { id: 'asset_1', name: 'Seoul Hyperscale Campus I' };
      }
    },
    document: {
      async create(args: any) {
        captured = args;
        return {
          id: 'document_1',
          ...args.data,
          versions: args.data.versions.create
            ? [{ id: 'version_1', ...args.data.versions.create }]
            : []
        };
      }
    }
  };

  const result = await uploadDocumentVersion(
    {
      assetId: 'asset_1',
      title: 'Power Allocation Review Memo',
      documentType: DocumentType.POWER_STUDY,
      sourceLink: 'https://example.com/power-review',
      extractedText: 'Utility allocation timing remains subject to committee slotting.'
    },
    {
      name: 'power-review.pdf',
      type: 'application/pdf',
      size: 128,
      buffer: Buffer.from('sample diligence content')
    },
    {
      db: fakeDb as any,
      storage: createLocalDocumentStorage(tmpDir),
      summarizer: async () => 'Summary generated for diligence support.',
      extractor: async (input) => {
        extractionCalledWith = input;
        return { runId: 'run_1', chunkCount: 1, factCount: 2 };
      },
      financialIngester: async (input) => {
        financialIngestionCalledWith = input;
        return null;
      },
      promoter: async (documentVersionId) => {
        promotionCalledWith = documentVersionId;
        return { snapshotId: 'snapshot_1', assetId: 'asset_1', valueCount: 2 };
      }
    }
  );

  assert.ok(result.latestStoragePath);
  const savedPath = path.join(process.cwd(), result.latestStoragePath as string);
  const savedFile = await stat(savedPath);

  assert.ok(savedFile.isFile());
  assert.equal(result.aiSummary, 'Summary generated for diligence support.');
  assert.equal(captured.data.versions.create.versionNumber, 1);
  assert.equal(result.documentHash.length, 64);
  assert.equal(extractionCalledWith.documentVersionId, 'version_1');
  assert.equal(extractionCalledWith.assetId, 'asset_1');
  assert.equal(financialIngestionCalledWith.documentVersionId, 'version_1');
  assert.equal(financialIngestionCalledWith.assetId, 'asset_1');
  assert.equal(promotionCalledWith, 'version_1');
});
