import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { canonicalizeToJson } from '@/lib/services/onchain/canonicalize';
import { prisma as defaultPrisma } from '@/lib/db/prisma';

/**
 * SHA-256 over the canonical JSON of the request envelope used to call an
 * LLM. Any operation that is genuinely deterministic w.r.t. (model, system,
 * messages, tools) can short-circuit on a cache hit instead of paying for
 * a fresh round-trip.
 *
 * What "deterministic" means here:
 *   - LLM calls with temperature = 0 and a fixed seed are not bit-stable
 *     across vendor model revisions, but for the workflows we use (memo
 *     drafts, scenario summaries, structured extraction) the variation is
 *     small enough that a cached response is materially better than a
 *     fresh sample with stale market context. TTL handles staleness.
 *   - Tool-use loops are NOT cache-safe — the model can choose different
 *     tools across runs. Only call this for terminal one-shot prompts.
 */
export function computeAiPromptHash(input: {
  model: string;
  system?: string;
  messages: unknown;
  tools?: unknown;
}): string {
  const canonical = canonicalizeToJson({
    model: input.model,
    system: input.system ?? null,
    messages: input.messages,
    tools: input.tools ?? null
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export type CachedAiResponse = {
  response: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

export async function getCachedAiResponse(
  input: { promptHash: string; model: string },
  db: PrismaClient = defaultPrisma
): Promise<CachedAiResponse | null> {
  const row = await db.aiResponseCache.findUnique({
    where: { promptHash_model: { promptHash: input.promptHash, model: input.model } }
  });
  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) {
    // Stale entry — don't serve, leave it for the eviction sweep.
    return null;
  }
  // Best-effort hit-count bump; failure here doesn't affect correctness.
  await db.aiResponseCache
    .update({
      where: { id: row.id },
      data: { hitCount: { increment: 1 }, lastHitAt: new Date() }
    })
    .catch(() => {});
  return {
    response: row.response,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens
  };
}

export async function setCachedAiResponse(
  input: {
    promptHash: string;
    model: string;
    response: string;
    inputTokens?: number | null;
    outputTokens?: number | null;
    ttlSeconds: number;
  },
  db: PrismaClient = defaultPrisma
): Promise<void> {
  const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000);
  await db.aiResponseCache.upsert({
    where: { promptHash_model: { promptHash: input.promptHash, model: input.model } },
    create: {
      promptHash: input.promptHash,
      model: input.model,
      response: input.response,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      expiresAt
    },
    update: {
      response: input.response,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      expiresAt
    }
  });
}

/** Delete cache entries whose TTL has passed. Run from the ops cron. */
export async function evictExpiredAiResponses(
  db: PrismaClient = defaultPrisma
): Promise<{ deleted: number }> {
  const result = await db.aiResponseCache.deleteMany({
    where: { expiresAt: { lt: new Date() } }
  });
  return { deleted: result.count };
}
