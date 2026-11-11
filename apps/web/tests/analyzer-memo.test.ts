import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { __resetEnvCache } from '@/lib/env';
import {
  AnalyzerMemoError,
  DOCX_MIME,
  analyzerMemoFileName,
  analyzerMemoTitle,
  isAnalyzerMemoSpec,
  saveAnalyzerMemoAsDocument
} from '@/lib/services/analyzer-memo';
import type { uploadDocumentVersion } from '@/lib/services/documents';

const TOKEN = 'a-very-long-shared-service-token-123456';

async function withAnalyzerEnv<T>(fn: () => Promise<T>): Promise<T> {
  const keys = ['ANALYZER_URL', 'ANALYZER_SERVICE_TOKEN'] as const;
  const previous = keys.map((key) => [key, process.env[key]] as const);
  process.env.ANALYZER_URL = 'http://analyzer.test:8000';
  process.env.ANALYZER_SERVICE_TOKEN = TOKEN;
  __resetEnvCache();
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    __resetEnvCache();
  }
}

type DealRow = { dealCode: string; assetId: string | null } | null;

function fakeDb(deal: DealRow, existingDocumentId: string | null = null) {
  const calls: { findFirst: unknown[] } = { findFirst: [] };
  const db = {
    deal: { findUnique: async () => deal },
    document: {
      findFirst: async (args: unknown) => {
        calls.findFirst.push(args);
        return existingDocumentId ? { id: existingDocumentId } : null;
      }
    }
  } as unknown as PrismaClient;
  return { db, calls };
}

const DOCX_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6]);

function fakeFetch(status: number, bytes: Uint8Array, seen: { url?: string; headers?: Headers }[]) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), headers: new Headers(init?.headers) });
    return new Response(Buffer.from(bytes), { status, headers: { 'content-type': DOCX_MIME } });
  }) as typeof fetch;
}

function fakeUpload(
  captured: {
    input?: Record<string, unknown>;
    file?: { name: string; type: string; size: number };
  }[]
) {
  return (async (input: unknown, file: { name: string; type: string; size: number }) => {
    captured.push({ input: input as Record<string, unknown>, file });
    const parsed = input as { title: string; documentId?: string };
    return {
      id: parsed.documentId ?? 'doc_new',
      title: parsed.title,
      currentVersion: parsed.documentId ? 2 : 1
    };
  }) as unknown as typeof uploadDocumentVersion;
}

test('memo spec helpers: names follow the analyzer allow-list', () => {
  assert.equal(isAnalyzerMemoSpec('prememo'), true);
  assert.equal(isAnalyzerMemoSpec('icmemo'), true);
  assert.equal(isAnalyzerMemoSpec('../etc'), false);
  assert.equal(analyzerMemoFileName('icmemo', 'cottonwood'), 'icmemo_cottonwood_draft.docx');
  assert.ok(analyzerMemoTitle('prememo', 'COTTONWOOD').startsWith('사전협의서 초안'));
  assert.ok(analyzerMemoTitle('icmemo', 'X'.repeat(300)).length <= 140);
});

test('saveAnalyzerMemoAsDocument stores the analyzer docx as a REPORT on the deal asset', async () => {
  await withAnalyzerEnv(async () => {
    const seen: { url?: string; headers?: Headers }[] = [];
    const captured: {
      input?: Record<string, unknown>;
      file?: { name: string; type: string; size: number };
    }[] = [];
    const { db, calls } = fakeDb({ dealCode: 'Cottonwood', assetId: 'asset_1' });
    const result = await saveAnalyzerMemoAsDocument(
      {
        dealId: 'deal_1',
        spec: 'icmemo',
        operator: { identifier: '김분석', role: 'ANALYST' },
        uploadedById: 'user_1'
      },
      { db, fetchImpl: fakeFetch(200, DOCX_BYTES, seen), upload: fakeUpload(captured) }
    );
    assert.equal(seen.length, 1);
    assert.ok(
      seen[0].url?.startsWith(
        'http://analyzer.test:8000/api/docs/outputs/cottonwood/icmemo_cottonwood_draft.docx?operator='
      )
    );
    assert.equal(seen[0].headers?.get('X-Service-Token'), TOKEN);
    assert.equal(seen[0].headers?.get('X-Operator'), encodeURIComponent('김분석'));
    assert.equal(captured.length, 1);
    assert.equal(captured[0].input?.documentType, 'REPORT');
    assert.equal(captured[0].input?.assetId, 'asset_1');
    assert.equal(captured[0].input?.dealId, 'deal_1');
    assert.equal(captured[0].input?.documentId, undefined);
    assert.equal(
      captured[0].input?.extractedText,
      undefined,
      'memo text must not reach the OS AI sidecar'
    );
    assert.equal(captured[0].file?.type, DOCX_MIME);
    assert.equal(captured[0].file?.size, DOCX_BYTES.length);
    assert.equal(result.documentId, 'doc_new');
    assert.equal(result.version, 1);
    assert.equal(result.sha256.length, 64);
    assert.equal(calls.findFirst.length, 1);
  });
});

test('saving again versions the existing document instead of creating a new one', async () => {
  await withAnalyzerEnv(async () => {
    const captured: { input?: Record<string, unknown> }[] = [];
    const { db } = fakeDb({ dealCode: 'Cottonwood', assetId: 'asset_1' }, 'doc_existing');
    const result = await saveAnalyzerMemoAsDocument(
      { dealId: 'deal_1', spec: 'prememo', operator: { identifier: 'kim', role: 'ANALYST' } },
      { db, fetchImpl: fakeFetch(200, DOCX_BYTES, []), upload: fakeUpload(captured) }
    );
    assert.equal(captured[0].input?.documentId, 'doc_existing');
    assert.equal(result.version, 2);
  });
});

test('save-memo refuses deals without an asset, missing drafts and non-docx bytes', async () => {
  await withAnalyzerEnv(async () => {
    const operator = { identifier: 'kim', role: 'ANALYST' as const };
    await assert.rejects(
      saveAnalyzerMemoAsDocument(
        { dealId: 'deal_1', spec: 'prememo', operator },
        {
          db: fakeDb({ dealCode: 'Cottonwood', assetId: null }).db,
          fetchImpl: fakeFetch(200, DOCX_BYTES, []),
          upload: fakeUpload([])
        }
      ),
      (error: unknown) => error instanceof AnalyzerMemoError && error.status === 409
    );
    await assert.rejects(
      saveAnalyzerMemoAsDocument(
        { dealId: 'deal_1', spec: 'prememo', operator },
        { db: fakeDb(null).db, fetchImpl: fakeFetch(200, DOCX_BYTES, []), upload: fakeUpload([]) }
      ),
      (error: unknown) => error instanceof AnalyzerMemoError && error.status === 404
    );
    await assert.rejects(
      saveAnalyzerMemoAsDocument(
        { dealId: 'deal_1', spec: 'prememo', operator },
        {
          db: fakeDb({ dealCode: 'Cottonwood', assetId: 'asset_1' }).db,
          fetchImpl: fakeFetch(404, new Uint8Array([1]), []),
          upload: fakeUpload([])
        }
      ),
      (error: unknown) => error instanceof AnalyzerMemoError && error.status === 404
    );
    const captured: { input?: Record<string, unknown> }[] = [];
    await assert.rejects(
      saveAnalyzerMemoAsDocument(
        { dealId: 'deal_1', spec: 'prememo', operator },
        {
          db: fakeDb({ dealCode: 'Cottonwood', assetId: 'asset_1' }).db,
          fetchImpl: fakeFetch(200, new Uint8Array([0x3c, 0x68, 0x74]), []),
          upload: fakeUpload(captured)
        }
      ),
      (error: unknown) => error instanceof AnalyzerMemoError && error.status === 502
    );
    assert.equal(captured.length, 0, 'nothing is stored when the analyzer returns a non-docx body');
  });
});
