import OpenAI from 'openai';
import { openaiModel } from '@/lib/ai/models';

/**
 * Embedding client for the document corpus.
 *
 * Uses OpenAI's text-embedding-3-small (1536 dims) which matches the column
 * width on DocumentEmbedding. Returns null per-input on API failure rather
 * than throwing, so a partial-success batch can persist what it can.
 *
 * The model identifier is intentionally pinned here (not derived from
 * openaiModel()) — the chat-completion model and the embedding model are
 * separate concerns and pinning keeps cosine similarity comparable across
 * batches indexed at different times.
 */

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

void openaiModel;

function getClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export type EmbedResult = {
  model: string;
  dimensions: number;
  vectors: Array<number[] | null>;
};

export async function embedTexts(texts: string[]): Promise<EmbedResult> {
  const client = getClient();
  if (!client || texts.length === 0) {
    return {
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
      vectors: texts.map(() => null)
    };
  }

  // OpenAI's embeddings.create accepts an array; one round-trip per batch
  // keeps cost and latency bounded. Hard-cap the batch size so a 1000-chunk
  // document doesn't exceed the request size limit.
  const BATCH_SIZE = 64;
  const out: Array<number[] | null> = new Array(texts.length).fill(null);
  for (let offset = 0; offset < texts.length; offset += BATCH_SIZE) {
    const slice = texts.slice(offset, offset + BATCH_SIZE);
    try {
      const response = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: slice
      });
      for (let i = 0; i < slice.length; i += 1) {
        const item = response.data[i];
        if (item?.embedding && Array.isArray(item.embedding)) {
          out[offset + i] = item.embedding;
        }
      }
    } catch {
      // Best-effort: leave the batch as nulls and continue. The caller
      // persists only successful chunks and can re-queue the rest.
    }
  }
  return {
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    vectors: out
  };
}

export const EMBEDDING_MODEL_ID = EMBEDDING_MODEL;
export const EMBEDDING_DIMENSION_COUNT = EMBEDDING_DIMENSIONS;
