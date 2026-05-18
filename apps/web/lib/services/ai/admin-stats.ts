/**
 * Operator-console summaries for the AI infrastructure layer:
 *   - AiResponseCache hit-rate, freshness, and token savings.
 *   - DocumentEmbedding corpus state and indexing backlog.
 *
 * Aggregations are read-only Prisma queries. The page that consumes them
 * is server-rendered, so a single round trip is cheap; we don't pre-cache
 * the stats themselves because operators expect a refresh-on-load to be
 * accurate, not stale.
 */
import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db/prisma';

export type AiCacheModelStat = {
  model: string;
  entries: number;
  freshEntries: number;
  expiredEntries: number;
  totalHits: number;
  inputTokensSum: number;
  outputTokensSum: number;
};

export type AiCacheSummary = {
  totalEntries: number;
  freshEntries: number;
  expiredEntries: number;
  totalHits: number;
  estimatedSavedInputTokens: number;
  estimatedSavedOutputTokens: number;
  perModel: AiCacheModelStat[];
  recentHits: Array<{
    promptHash: string;
    model: string;
    hitCount: number;
    lastHitAt: Date | null;
    expiresAt: Date;
  }>;
};

export async function getAiCacheSummary(
  db: PrismaClient = defaultPrisma
): Promise<AiCacheSummary> {
  const now = new Date();
  const [rows, recent] = await Promise.all([
    db.aiResponseCache.findMany({
      select: {
        model: true,
        hitCount: true,
        inputTokens: true,
        outputTokens: true,
        expiresAt: true
      }
    }),
    db.aiResponseCache.findMany({
      where: { hitCount: { gt: 0 } },
      orderBy: { lastHitAt: 'desc' },
      take: 12,
      select: {
        promptHash: true,
        model: true,
        hitCount: true,
        lastHitAt: true,
        expiresAt: true
      }
    })
  ]);

  const perModelMap = new Map<string, AiCacheModelStat>();
  let totalHits = 0;
  let estimatedSavedInputTokens = 0;
  let estimatedSavedOutputTokens = 0;
  let freshEntries = 0;
  let expiredEntries = 0;

  for (const row of rows) {
    const isExpired = row.expiresAt.getTime() <= now.getTime();
    const inputTokens = row.inputTokens ?? 0;
    const outputTokens = row.outputTokens ?? 0;

    if (isExpired) expiredEntries += 1;
    else freshEntries += 1;

    totalHits += row.hitCount;
    // A single cache hit saves one round-trip with the recorded token
    // counts; multiplying by hitCount gives the cumulative savings.
    estimatedSavedInputTokens += inputTokens * row.hitCount;
    estimatedSavedOutputTokens += outputTokens * row.hitCount;

    const stat = perModelMap.get(row.model) ?? {
      model: row.model,
      entries: 0,
      freshEntries: 0,
      expiredEntries: 0,
      totalHits: 0,
      inputTokensSum: 0,
      outputTokensSum: 0
    };
    stat.entries += 1;
    if (isExpired) stat.expiredEntries += 1;
    else stat.freshEntries += 1;
    stat.totalHits += row.hitCount;
    stat.inputTokensSum += inputTokens * row.hitCount;
    stat.outputTokensSum += outputTokens * row.hitCount;
    perModelMap.set(row.model, stat);
  }

  return {
    totalEntries: rows.length,
    freshEntries,
    expiredEntries,
    totalHits,
    estimatedSavedInputTokens,
    estimatedSavedOutputTokens,
    perModel: Array.from(perModelMap.values()).sort((a, b) => b.entries - a.entries),
    recentHits: recent
  };
}

export type EmbeddingCorpusSummary = {
  embeddedChunks: number;
  embeddedDocuments: number;
  perModel: Array<{ model: string; chunks: number }>;
  unembeddedDocumentVersions: number;
  recentDocuments: Array<{
    documentVersionId: string;
    title: string;
    chunkCount: number;
    indexedAt: Date | null;
  }>;
};

export async function getEmbeddingCorpusSummary(
  db: PrismaClient = defaultPrisma
): Promise<EmbeddingCorpusSummary> {
  const [chunkCount, perModelGroups, embeddedDocVersions] = await Promise.all([
    db.documentEmbedding.count(),
    db.documentEmbedding.groupBy({
      by: ['model'],
      _count: { _all: true },
      orderBy: { _count: { id: 'desc' } }
    }),
    db.documentEmbedding.findMany({
      distinct: ['documentId'],
      select: { documentId: true }
    })
  ]);

  // "Backlog" = DocumentVersion rows that have extractedText but no
  // matching DocumentEmbedding rows yet. This is the queue the indexer
  // cron will drain on its next run.
  const embeddedVersionIds = new Set(embeddedDocVersions.map((row) => row.documentId));
  const candidateVersions = await db.documentVersion.findMany({
    where: { extractedText: { not: null } },
    select: { id: true, document: { select: { title: true } }, createdAt: true }
  });
  const unembedded = candidateVersions.filter((v) => !embeddedVersionIds.has(v.id));

  // Recent docs view: what got indexed last, ordered by max(indexedAt)
  // per documentId. Postgres GROUP BY would be cleaner; this is fine
  // for the operator console at low scale.
  const recentSampling = await db.documentEmbedding.findMany({
    take: 200,
    orderBy: { indexedAt: 'desc' },
    select: { documentId: true, indexedAt: true }
  });
  const lastIndexed = new Map<string, Date>();
  const chunkCountMap = new Map<string, number>();
  for (const row of recentSampling) {
    const existing = lastIndexed.get(row.documentId);
    if (!existing || row.indexedAt > existing) {
      lastIndexed.set(row.documentId, row.indexedAt);
    }
    chunkCountMap.set(row.documentId, (chunkCountMap.get(row.documentId) ?? 0) + 1);
  }
  const recentVersionIds = Array.from(lastIndexed.keys()).slice(0, 12);
  const versionTitles = await db.documentVersion.findMany({
    where: { id: { in: recentVersionIds } },
    select: { id: true, document: { select: { title: true } } }
  });
  const titleByVersion = new Map(versionTitles.map((v) => [v.id, v.document?.title ?? 'Unknown']));

  return {
    embeddedChunks: chunkCount,
    embeddedDocuments: embeddedVersionIds.size,
    perModel: perModelGroups.map((g) => ({ model: g.model, chunks: g._count._all })),
    unembeddedDocumentVersions: unembedded.length,
    recentDocuments: recentVersionIds.map((id) => ({
      documentVersionId: id,
      title: titleByVersion.get(id) ?? 'Unknown',
      chunkCount: chunkCountMap.get(id) ?? 0,
      indexedAt: lastIndexed.get(id) ?? null
    }))
  };
}
