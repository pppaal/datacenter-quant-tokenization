import {
  OPENAI_MODEL,
  OpenAIConfigurationError,
  getOpenAIClient,
  isOpenAIConfigured
} from '@/lib/ai/openai-client';
import type { MacroFactorPoint, MacroFactorSnapshot } from '@/lib/services/macro/factors';
import type { MacroInterpretation } from '@/lib/services/macro/regime';
import type { TrendAnalysis } from '@/lib/services/macro/trend';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MacroNarrativeInput = {
  market: string;
  asOf: string | null;
  regime: MacroInterpretation;
  trends: TrendAnalysis[];
  previousRegime?: MacroInterpretation | null;
};

export type MacroNarrative = {
  headline: string;
  whatChanged: string;
  portfolioImplication: string;
  watchItems: string[];
  riskCallout: string | null;
  cached: boolean;
};

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const REQUEST_TIMEOUT_MS = 30_000;
const CACHE_TTL_MS = 60 * 60 * 1000;

type CacheEntry = { value: Omit<MacroNarrative, 'cached'>; expiresAt: number };
const narrativeCache = new Map<string, CacheEntry>();

// ---------------------------------------------------------------------------
// Template-based fallback (no LLM required)
// ---------------------------------------------------------------------------

function dirLabel(d: string) {
  return d === 'POSITIVE' ? 'tailwind' : d === 'NEGATIVE' ? 'headwind' : 'neutral';
}

function trendLabel(d: string) {
  return d === 'ACCELERATING_UP'
    ? 'accelerating higher'
    : d === 'RISING'
      ? 'rising'
      : d === 'DECLINING'
        ? 'declining'
        : d === 'ACCELERATING_DOWN'
          ? 'falling rapidly'
          : 'stable';
}

function pickTopFactors(factors: MacroFactorPoint[], direction: string, n: number) {
  return factors
    .filter((f) => f.direction === direction && f.isObserved)
    .slice(0, n)
    .map((f) => f.label.toLowerCase());
}

export function buildTemplateNarrative(input: MacroNarrativeInput): MacroNarrative {
  const { market, regime, trends, previousRegime } = input;
  const factors = regime.factors;

  const headwinds = pickTopFactors(factors, 'NEGATIVE', 3);
  const tailwinds = pickTopFactors(factors, 'POSITIVE', 3);
  const anomalies = trends.filter((t) => t.anomaly?.isAnomaly);
  const accelerating = trends.filter((t) => t.direction === 'ACCELERATING_UP' || t.direction === 'ACCELERATING_DOWN');

  const overallStance =
    headwinds.length > tailwinds.length
      ? 'defensive'
      : tailwinds.length > headwinds.length
        ? 'constructive'
        : 'balanced';

  const headline = `${market} macro environment leans ${overallStance} as of ${regime.asOf ?? 'latest reading'}.`;

  // What changed
  let whatChanged: string;
  if (previousRegime) {
    const prevHeadwinds = pickTopFactors(previousRegime.factors, 'NEGATIVE', 3);
    const newHeadwinds = headwinds.filter((h) => !prevHeadwinds.includes(h));
    const resolvedHeadwinds = prevHeadwinds.filter((h) => !headwinds.includes(h));
    const parts: string[] = [];
    if (newHeadwinds.length > 0) parts.push(`New headwinds emerged in ${newHeadwinds.join(', ')}.`);
    if (resolvedHeadwinds.length > 0) parts.push(`Prior pressure from ${resolvedHeadwinds.join(', ')} has eased.`);
    if (accelerating.length > 0)
      parts.push(
        `${accelerating.map((t) => `${t.label} is ${trendLabel(t.direction)}`).join('; ')}.`
      );
    whatChanged = parts.length > 0 ? parts.join(' ') : 'No material change from the prior reading.';
  } else {
    whatChanged = headwinds.length > 0
      ? `Primary headwinds come from ${headwinds.join(', ')}.`
      : 'No significant headwinds are present.';
    if (tailwinds.length > 0) whatChanged += ` Tailwinds include ${tailwinds.join(', ')}.`;
  }

  // Portfolio implication
  const guidance = regime.guidance;
  const shifts: string[] = [];
  if (Math.abs(guidance.discountRateShiftPct) >= 0.1)
    shifts.push(`discount rate ${guidance.discountRateShiftPct > 0 ? '+' : ''}${guidance.discountRateShiftPct.toFixed(1)}%`);
  if (Math.abs(guidance.exitCapRateShiftPct) >= 0.1)
    shifts.push(`exit cap rate ${guidance.exitCapRateShiftPct > 0 ? '+' : ''}${guidance.exitCapRateShiftPct.toFixed(1)}%`);
  if (Math.abs(guidance.occupancyShiftPct) >= 0.3)
    shifts.push(`occupancy ${guidance.occupancyShiftPct > 0 ? '+' : ''}${guidance.occupancyShiftPct.toFixed(1)}%`);
  const portfolioImplication = shifts.length > 0
    ? `The regime analysis adjusts ${shifts.join(', ')} for ${regime.assetClass} assets in this market. ${
        overallStance === 'defensive'
          ? 'Underwriting should stress-test downside scenarios.'
          : overallStance === 'constructive'
            ? 'Current conditions support growth-oriented positioning.'
            : 'A balanced stance is appropriate with selective conviction.'
      }`
    : `No material valuation adjustments are triggered by the current macro regime for ${regime.assetClass} assets.`;

  // Watch items
  const watchItems: string[] = [];
  for (const f of factors) {
    if (f.direction === 'NEGATIVE' && f.isObserved) {
      const trend = trends.find((t) => t.seriesKey === f.key || t.label.toLowerCase().includes(f.label.toLowerCase()));
      watchItems.push(
        `${f.label}: ${f.commentary}${trend ? ` Trend is ${trendLabel(trend.direction)}.` : ''}`
      );
    }
  }
  if (watchItems.length === 0) watchItems.push('No critical watch items at this time.');

  // Risk callout
  const riskCallout =
    anomalies.length > 0
      ? `Anomaly detected: ${anomalies.map((a) => `${a.label} z-score ${a.anomaly!.zScore.toFixed(1)}`).join(', ')}. Investigate for regime-change signal.`
      : null;

  return { headline, whatChanged, portfolioImplication, watchItems: watchItems.slice(0, 5), riskCallout, cached: false };
}

// ---------------------------------------------------------------------------
// LLM-powered narrative
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a senior macro analyst at a Korean institutional real-estate investment firm.
Your firm focuses on datacenter, office, and logistics assets denominated in KRW.
The LP base is institutional (pension funds, insurers, sovereign wealth).

Given the current macro regime analysis, factor snapshot with trend data, and optionally the prior regime:
1. Write a 1-sentence headline summarizing the macro stance.
2. Write 2-3 sentences on what changed period-over-period.
3. Write 2-3 sentences on what this means for our portfolio and active deals.
4. List 3-5 specific watch items (concrete, actionable).
5. If any anomaly or regime shift is material, write a risk callout (1-2 sentences). Otherwise null.

Respond in JSON: {"headline":"...","whatChanged":"...","portfolioImplication":"...","watchItems":["..."],"riskCallout":"..." or null}`;

function buildLlmPayload(input: MacroNarrativeInput) {
  return {
    market: input.market,
    asOf: input.asOf,
    assetClass: input.regime.assetClass,
    regimes: input.regime.regimes,
    guidance: input.regime.guidance,
    factors: input.regime.factors.map((f) => ({
      key: f.key,
      label: f.label,
      value: f.value,
      direction: f.direction,
      trend: f.trend ?? null
    })),
    trends: input.trends.map((t) => ({
      seriesKey: t.seriesKey,
      direction: t.direction,
      momentum: t.momentum,
      anomaly: t.anomaly
        ? { zScore: t.anomaly.zScore, severity: t.anomaly.severity }
        : null
    })),
    previousGuidance: input.previousRegime
      ? {
          regimes: input.previousRegime.regimes,
          guidance: input.previousRegime.guidance
        }
      : null
  };
}

export async function generateMacroNarrative(input: MacroNarrativeInput): Promise<MacroNarrative> {
  const cacheKey = `${input.market}:${input.asOf ?? 'latest'}`;
  const cached = narrativeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.value, cached: true };
  }

  if (!isOpenAIConfigured()) {
    return buildTemplateNarrative(input);
  }

  try {
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
          temperature: 0.3,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(buildLlmPayload(input)) }
          ]
        },
        { signal: controller.signal }
      );

      const raw = response.choices[0]?.message?.content?.trim() ?? '';
      if (!raw) throw new Error('Empty LLM response');

      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const result: Omit<MacroNarrative, 'cached'> = {
        headline: typeof parsed.headline === 'string' ? parsed.headline : 'Macro narrative unavailable.',
        whatChanged: typeof parsed.whatChanged === 'string' ? parsed.whatChanged : '',
        portfolioImplication: typeof parsed.portfolioImplication === 'string' ? parsed.portfolioImplication : '',
        watchItems: Array.isArray(parsed.watchItems)
          ? parsed.watchItems.filter((w): w is string => typeof w === 'string').slice(0, 5)
          : [],
        riskCallout: typeof parsed.riskCallout === 'string' ? parsed.riskCallout : null
      };

      narrativeCache.set(cacheKey, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
      return { ...result, cached: false };
    } catch (error) {
      if (timedOut) throw new Error('Narrative LLM request timed out.');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return buildTemplateNarrative(input);
  }
}

export function resetNarrativeCacheForTesting() {
  narrativeCache.clear();
}
