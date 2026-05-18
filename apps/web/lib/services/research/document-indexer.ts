/**
 * Document → DocumentEmbedding indexer.
 *
 * Splits each document's extracted text into overlapping chunks, embeds
 * them, and persists into DocumentEmbedding via raw SQL (the `embedding`
 * column is pgvector's vector(1536) type which Prisma 5 can't shape, so
 * inserts use $executeRaw with the vector literal `[v1,v2,...]::vector`).
 *
 * Idempotent: rows are keyed (documentId, chunkIndex, model). Re-running
 * skips chunks already indexed for the same model.
 */
import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db/prisma';
import {
  EMBEDDING_DIMENSION_COUNT,
  EMBEDDING_MODEL_ID,
  embedTexts
} from '@/lib/services/ai/embeddings';

const TARGET_CHUNK_CHARS = 1200;
const OVERLAP_CHARS = 150;

/**
 * Split text into ~TARGET_CHUNK_CHARS-sized pieces with OVERLAP_CHARS of
 * context preserved between adjacent chunks. Sentence-aware: prefers
 * boundaries at . ! ? \n so a chunk doesn't end mid-sentence and confuse
 * the embedding model.
 */
export function chunkText(text: string): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  if (cleaned.length <= TARGET_CHUNK_CHARS) return [cleaned];

  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < cleaned.length) {
    const remaining = cleaned.length - cursor;
    if (remaining <= TARGET_CHUNK_CHARS) {
      chunks.push(cleaned.slice(cursor));
      break;
    }

    let end = cursor + TARGET_CHUNK_CHARS;
    // Look for a sentence boundary within the last ~200 chars of the slice.
    const window = cleaned.slice(end - 200, end + 50);
    const localBoundary =
      window.lastIndexOf('. ') !== -1
        ? window.lastIndexOf('. ') + 1
        : window.lastIndexOf('! ') !== -1
          ? window.lastIndexOf('! ') + 1
          : window.lastIndexOf('? ') !== -1
            ? window.lastIndexOf('? ') + 1
            : window.lastIndexOf('\n');
    if (localBoundary !== -1) {
      end = end - 200 + localBoundary + 1;
    }

    chunks.push(cleaned.slice(cursor, end).trim());
    cursor = Math.max(end - OVERLAP_CHARS, cursor + 1);
  }
  return chunks.filter((chunk) => chunk.length > 0);
}

function vectorLiteral(values: number[]): string {
  // Postgres vector literal: '[v1,v2,...]'. Use ::vector cast at the
  // call site since template-tagged $executeRaw escapes string params.
  return `[${values.join(',')}]`;
}

export type IndexDocumentResult = {
  documentId: string;
  chunksTotal: number;
  chunksInserted: number;
  chunksSkipped: number;
};

/**
 * Index one document's text. Caller passes the documentId and the raw
 * extracted text (already cleaned of binary noise upstream). Returns a
 * count summary; never throws on partial embedding failures so a batch
 * can keep working through other documents.
 */
export async function indexDocumentForSearch(
  input: { documentId: string; text: string },
  db: PrismaClient = defaultPrisma
): Promise<IndexDocumentResult> {
  const chunks = chunkText(input.text);
  if (chunks.length === 0) {
    return { documentId: input.documentId, chunksTotal: 0, chunksInserted: 0, chunksSkipped: 0 };
  }

  // Skip chunks we've already embedded for this (document, model).
  const existing = await db.documentEmbedding.findMany({
    where: { documentId: input.documentId, model: EMBEDDING_MODEL_ID },
    select: { chunkIndex: true }
  });
  const indexedSet = new Set(existing.map((row) => row.chunkIndex));
  const toEmbed: Array<{ chunkIndex: number; text: string }> = [];
  for (let i = 0; i < chunks.length; i += 1) {
    if (indexedSet.has(i)) continue;
    toEmbed.push({ chunkIndex: i, text: chunks[i]! });
  }
  if (toEmbed.length === 0) {
    return {
      documentId: input.documentId,
      chunksTotal: chunks.length,
      chunksInserted: 0,
      chunksSkipped: chunks.length
    };
  }

  const { vectors } = await embedTexts(toEmbed.map((e) => e.text));

  let inserted = 0;
  for (let i = 0; i < toEmbed.length; i += 1) {
    const vector = vectors[i];
    if (!vector || vector.length !== EMBEDDING_DIMENSION_COUNT) continue;
    const literal = vectorLiteral(vector);
    const id = `embed_${input.documentId}_${toEmbed[i]!.chunkIndex}_${EMBEDDING_MODEL_ID}`;
    // Cast the bound :literal string to the vector type at the database
    // boundary; Prisma escapes it as a string param so this is safe.
    await db.$executeRawUnsafe(
      `INSERT INTO "DocumentEmbedding"
        ("id", "documentId", "chunkIndex", "model", "embedding", "text", "tokenCount", "createdAt")
       VALUES ($1, $2, $3, $4, $5::vector, $6, $7, NOW())
       ON CONFLICT ("documentId", "chunkIndex", "model") DO NOTHING`,
      id,
      input.documentId,
      toEmbed[i]!.chunkIndex,
      EMBEDDING_MODEL_ID,
      literal,
      toEmbed[i]!.text,
      null
    );
    inserted += 1;
  }

  return {
    documentId: input.documentId,
    chunksTotal: chunks.length,
    chunksInserted: inserted,
    chunksSkipped: chunks.length - toEmbed.length
  };
}

export type SemanticSearchHit = {
  documentId: string;
  chunkIndex: number;
  text: string;
  similarity: number;
};

/**
 * Cosine-similarity search over the indexed corpus. Pgvector's `<=>` is
 * cosine distance (lower = more similar); converting to similarity via
 * `1 - distance` gives an intuitive 0..1 score.
 *
 * Limit is capped at 50 to keep a stray "topK = 10000" query from doing
 * a full sort over the entire corpus.
 */
export async function semanticSearch(
  input: { queryText: string; limit?: number; documentIds?: string[] },
  db: PrismaClient = defaultPrisma
): Promise<SemanticSearchHit[]> {
  const limit = Math.max(1, Math.min(50, input.limit ?? 10));
  const { vectors } = await embedTexts([input.queryText]);
  const queryVector = vectors[0];
  if (!queryVector) return [];
  const literal = vectorLiteral(queryVector);

  const idFilter = input.documentIds && input.documentIds.length > 0;
  const sql = idFilter
    ? `SELECT "documentId", "chunkIndex", "text",
              1 - ("embedding" <=> $1::vector) AS similarity
         FROM "DocumentEmbedding"
        WHERE "documentId" = ANY($3::text[])
        ORDER BY "embedding" <=> $1::vector ASC
        LIMIT $2`
    : `SELECT "documentId", "chunkIndex", "text",
              1 - ("embedding" <=> $1::vector) AS similarity
         FROM "DocumentEmbedding"
        ORDER BY "embedding" <=> $1::vector ASC
        LIMIT $2`;

  const rows = (await (idFilter
    ? db.$queryRawUnsafe(sql, literal, limit, input.documentIds)
    : db.$queryRawUnsafe(sql, literal, limit))) as Array<{
    documentId: string;
    chunkIndex: number;
    text: string;
    similarity: number;
  }>;

  return rows.map((row) => ({
    documentId: row.documentId,
    chunkIndex: row.chunkIndex,
    text: row.text,
    similarity: Number(row.similarity)
  }));
}

