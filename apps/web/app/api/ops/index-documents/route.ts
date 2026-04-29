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
 * semantic-search corpus. Bounded per-run by `BATCH_SIZE` so a backlog
 * doesn't take the API timeout window with it; subsequent runs drain the
 * remaining queue.
 *
 * Note on naming: DocumentEmbedding.documentId stores the
 * DocumentVersion.id (the versioned text), not Document.id — the same
 * upload can produce multiple versions with different text and we want
 * each version embedded separately.
 */

const BATCH_SIZE = 5;

function isAuthorized(request: Request, expectedToken: string) {
  const bearer = request.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '')
    .trim();
  const headerToken = request.headers.get('x-ops-cron-token')?.trim();
  return bearer === expectedToken || headerToken === expectedToken;
}

export async function POST(request: Request) {
  const expectedToken = process.env.OPS_CRON_TOKEN?.trim();
  if (!expectedToken) {
    return NextResponse.json({ error: 'OPS_CRON_TOKEN is not configured' }, { status: 503 });
  }
  if (!isAuthorized(request, expectedToken)) {
    return NextResponse.json({ error: 'Unauthorized cron trigger' }, { status: 401 });
  }

  try {
    // Pick versions with extracted text. Embedded vs not is decided per-row
    // inside indexDocumentForSearch so an upgrade to a new embedding model
    // re-indexes naturally without a separate "what's stale" query here.
    const versions = await prisma.documentVersion.findMany({
      where: { extractedText: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: BATCH_SIZE * 4,
      select: { id: true, extractedText: true, documentId: true }
    });

    const results: IndexDocumentResult[] = [];
    let attempted = 0;
    for (const version of versions) {
      if (attempted >= BATCH_SIZE) break;
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
      action: 'documents.index.scheduled',
      entityType: 'DocumentEmbedding',
      requestPath: '/api/ops/index-documents',
      requestMethod: 'POST',
      statusLabel: 'OK',
      metadata: {
        documentsAttempted: attempted,
        chunksInserted: totalInserted,
        chunksSkipped: totalSkipped
      }
    });

    return NextResponse.json({
      ok: true,
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
      action: 'documents.index.scheduled',
      entityType: 'DocumentEmbedding',
      requestPath: '/api/ops/index-documents',
      requestMethod: 'POST',
      statusLabel: 'FAILED',
      metadata: { error: message }
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
