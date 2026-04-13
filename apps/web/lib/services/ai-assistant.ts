import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  OPENAI_MODEL,
  OpenAIConfigurationError,
  getOpenAIClient,
  isOpenAIConfigured
} from '@/lib/ai/openai-client';

export { OpenAIConfigurationError };

export type ResearchSnapshotSummary = {
  summary: string;
  bullets: string[];
  cached: boolean;
};

export type DealScore = {
  score: number;
  reasoning: string;
  redFlags: string[];
  greenFlags: string[];
};

type AssistantDb = Pick<PrismaClient, 'researchSnapshot' | 'deal'>;

const REQUEST_TIMEOUT_MS = 30_000;
const CACHE_TTL_MS = 60 * 60 * 1000;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const summaryCache = new Map<string, CacheEntry<Omit<ResearchSnapshotSummary, 'cached'>>>();

function readFromCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function writeToCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

function clampScore(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function runChatCompletion<T>(args: {
  systemPrompt: string;
  userPayload: unknown;
  temperature: number;
  parse: (raw: string) => T;
}): Promise<T> {
  if (!isOpenAIConfigured()) {
    throw new OpenAIConfigurationError();
  }

  const client = getOpenAIClient();
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await client.chat.completions.create(
      {
        model: OPENAI_MODEL,
        temperature: args.temperature,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: args.systemPrompt },
          { role: 'user', content: JSON.stringify(args.userPayload) }
        ]
      },
      { signal: controller.signal }
    );

    const raw = response.choices[0]?.message?.content?.trim() ?? '';
    if (!raw) {
      throw new Error('AI assistant returned an empty response.');
    }
    return args.parse(raw);
  } catch (error) {
    if (timedOut) {
      throw new Error('AI assistant request timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function summarizeResearchSnapshot(
  snapshotId: string,
  db: AssistantDb = prisma
): Promise<ResearchSnapshotSummary> {
  if (!isOpenAIConfigured()) {
    throw new OpenAIConfigurationError();
  }

  const cached = readFromCache(summaryCache, snapshotId);
  if (cached) {
    return { ...cached, cached: true };
  }

  const snapshot = await db.researchSnapshot.findUnique({
    where: { id: snapshotId },
    select: {
      id: true,
      title: true,
      summary: true,
      snapshotType: true,
      snapshotDate: true,
      metrics: true,
      sourceSystem: true,
      freshnessLabel: true
    }
  });

  if (!snapshot) {
    throw new Error('Research snapshot not found.');
  }

  const parsed = await runChatCompletion({
    temperature: 0.2,
    systemPrompt:
      'You are an institutional research analyst for a Korean real-estate investment firm. ' +
      'Summarize research snapshots for the investment committee. ' +
      'Return JSON with keys: "summary" (a 2-4 sentence prose summary) and "bullets" ' +
      '(an array of 3-6 concise action-oriented insight strings). ' +
      'Use neutral diligence language. Do not use retail offering or return-guarantee language.',
    userPayload: {
      title: snapshot.title,
      summary: snapshot.summary,
      snapshotType: snapshot.snapshotType,
      snapshotDate: snapshot.snapshotDate.toISOString(),
      sourceSystem: snapshot.sourceSystem,
      freshnessLabel: snapshot.freshnessLabel,
      metrics: snapshot.metrics
    },
    parse: (raw) => {
      const data = JSON.parse(raw) as Record<string, unknown>;
      const summary = typeof data.summary === 'string' ? data.summary.trim() : '';
      const bullets = toStringArray(data.bullets);
      if (!summary) {
        throw new Error('AI assistant returned an invalid summary payload.');
      }
      return { summary, bullets };
    }
  });

  writeToCache(summaryCache, snapshotId, parsed);
  return { ...parsed, cached: false };
}

export async function scoreDeal(
  dealId: string,
  db: AssistantDb = prisma
): Promise<DealScore> {
  if (!isOpenAIConfigured()) {
    throw new OpenAIConfigurationError();
  }

  const deal = await db.deal.findUnique({
    where: { id: dealId },
    select: {
      id: true,
      title: true,
      dealCode: true,
      stage: true,
      market: true,
      city: true,
      country: true,
      assetClass: true,
      strategy: true,
      headline: true,
      originSummary: true,
      statusLabel: true,
      originationSource: true,
      sellerGuidanceKrw: true,
      bidGuidanceKrw: true,
      purchasePriceKrw: true,
      targetCloseDate: true
    }
  });

  if (!deal) {
    throw new Error('Deal not found.');
  }

  return runChatCompletion({
    temperature: 0.3,
    systemPrompt:
      'You are an institutional investment-committee analyst scoring a Korean real-estate deal. ' +
      'Return JSON with keys: "score" (integer 0-100 where higher is stronger conviction), ' +
      '"reasoning" (2-4 sentence prose rationale), "redFlags" (array of concise concern strings), ' +
      'and "greenFlags" (array of concise positive strings). ' +
      'Use institutional diligence language. Avoid retail offering or return-guarantee language.',
    userPayload: {
      title: deal.title,
      dealCode: deal.dealCode,
      stage: deal.stage,
      market: deal.market,
      city: deal.city,
      country: deal.country,
      assetClass: deal.assetClass,
      strategy: deal.strategy,
      headline: deal.headline,
      originSummary: deal.originSummary,
      statusLabel: deal.statusLabel,
      originationSource: deal.originationSource,
      sellerGuidanceKrw: deal.sellerGuidanceKrw,
      bidGuidanceKrw: deal.bidGuidanceKrw,
      purchasePriceKrw: deal.purchasePriceKrw,
      targetCloseDate: deal.targetCloseDate?.toISOString() ?? null
    },
    parse: (raw) => {
      const data = JSON.parse(raw) as Record<string, unknown>;
      const reasoning = typeof data.reasoning === 'string' ? data.reasoning.trim() : '';
      if (!reasoning) {
        throw new Error('AI assistant returned an invalid deal score payload.');
      }
      return {
        score: clampScore(data.score),
        reasoning,
        redFlags: toStringArray(data.redFlags),
        greenFlags: toStringArray(data.greenFlags)
      };
    }
  });
}

export function resetAiAssistantCacheForTesting() {
  summaryCache.clear();
}
