import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { recordAuditEvent } from '@/lib/services/audit';
import {
  indexDocumentForSearch,
  type IndexDocumentResult
} from '@/lib/services/research/document-indexer';

/**
 * Cron-triggered worker that finds DocumentVersion rows with extracted
 * text but no DocumentEmbedding entries yet and indexes them for the
 * semantic-search corpus. Bounded per-run by a configurable batch so a
 * backlog doesn't take the API timeout window with it.
 *
 * Trigger surface:
 *   POST /api/ops/index-documents              5 docs/run (cron default)
 *   POST /api/ops/index-documents?batch=N      N docs/run (clamped 1..200)
 *   POST /api/ops/index-documents?bulk=true    drains the entire backlog
 *                                              up to MAX_BULK_SIZE
 *
 * Bulk mode is for one-shot backfills against an empty embedding table
 * (initial pgvector hydration after this round's HNSW index landed). It
 * should NOT be on a recurring cron — at scale a single bulk call would
 * exhaust the OpenAI rate limit and tie up a worker for many minutes.
 *
 * Note on naming: DocumentEmbedding.documentId stores the
 * DocumentVersion.id (the versioned text), not Document.id — the same
 * upload can produce multiple versions with different text and we want
 * each version embedded separately.
 */

const DEFAULT_BATCH = 5;
const MAX_BATCH = 200;
const MAX_BULK_SIZE = 1000;

function isAuthorized(request: Request, expectedToken: string) {
  const bearer = request.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '')
    .trim();
  const headerToken = request.headers.get('x-ops-cron-token')?.trim();
  return bearer === expectedToken || headerToken === expectedToken;
}

function resolveBatchSize(url: URL): { size: number; mode: 'cron' | 'sized' | 'bulk' } {
  if (url.searchParams.get('bulk') === 'true') {
    return { size: MAX_BULK_SIZE, mode: 'bulk' };
  }
  const explicit = url.searchParams.get('batch');
  if (explicit) {
    const n = Number(explicit);
    if (Number.isInteger(n) && n > 0) {
      return { size: Math.min(MAX_BATCH, n), mode: 'sized' };
    }
  }
  return { size: DEFAULT_BATCH, mode: 'cron' };
}

export async function POST(request: Request) {
  const expectedToken = process.env.OPS_CRON_TOKEN?.trim();
  if (!expectedToken) {
    return NextResponse.json({ error: 'OPS_CRON_TOKEN is not configured' }, { status: 503 });
  }
  if (!isAuthorized(request, expectedToken)) {
    return NextResponse.json({ error: 'Unauthorized cron trigger' }, { status: 401 });
  }

  const url = new URL(request.url);
  const { size: batchSize, mode } = resolveBatchSize(url);

  try {
    // Take batchSize * 4 candidates so the loop has slack to skip empty
    // extractedText rows without re-querying. Bulk mode caps at
    // batchSize * 2 because the bulk size is already large.
    const candidateCap = mode === 'bulk' ? batchSize * 2 : batchSize * 4;
    const versions = await prisma.documentVersion.findMany({
      where: { extractedText: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: candidateCap,
      select: { id: true, extractedText: true, documentId: true }
    });

    const results: IndexDocumentResult[] = [];
    let attempted = 0;
    for (const version of versions) {
      if (attempted >= batchSize) break;
      const text = version.extractedText ?? '';
      if (!text.trim()) continue;
      attempted += 1;
      const result = await indexDocumentForSearch({ documentId: version.id, text });
      results.push(result);
    }

    const totalInserted = results.reduce((sum, r) => sum + r.chunksInserted, 0);
    const totalSkipped = results.reduce((sum, r) => sum + r.chunksSkipped, 0);

    await recordAuditEvent({
      actorIdentifier: 'ops-cron',
      actorRole: 'SYSTEM',
      action: `documents.index.${mode}`,
      entityType: 'DocumentEmbedding',
      requestPath: '/api/ops/index-documents',
      requestMethod: 'POST',
      statusLabel: 'OK',
      metadata: {
        mode,
        batchSize,
        documentsAttempted: attempted,
        chunksInserted: totalInserted,
        chunksSkipped: totalSkipped
      }
    });

    return NextResponse.json({
      ok: true,
      mode,
      batchSize,
      documentsAttempted: attempted,
      chunksInserted: totalInserted,
      chunksSkipped: totalSkipped,
      results
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to index documents';
    await recordAuditEvent({
      actorIdentifier: 'ops-cron',
      actorRole: 'SYSTEM',
      action: `documents.index.${mode}`,
      entityType: 'DocumentEmbedding',
      requestPath: '/api/ops/index-documents',
      requestMethod: 'POST',
      statusLabel: 'FAILED',
      metadata: { mode, batchSize, error: message }
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
