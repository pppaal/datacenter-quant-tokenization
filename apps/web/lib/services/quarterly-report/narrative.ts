/**
 * AI narrative generator — consumes a QuarterlyMarketSnapshot (+ optional prior
 * quarter) and produces a CBRE-style structured narrative via Claude Opus 4.7.
 *
 *   Env: ANTHROPIC_API_KEY
 *   Model: claude-opus-4-7 (override via ANTHROPIC_NARRATIVE_MODEL)
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AssetClass, QuarterlyMarketNarrative, QuarterlyMarketSnapshot } from '@prisma/client';
import { anthropicModel } from '@/lib/ai/models';
import { prisma } from '@/lib/db/prisma';

export type NarrativeDraft = {
  headline: string;
  marketPulse: string;
  supplyPipeline: string;
  capitalMarkets: string;
  outlook: string;
  overweightList: AssetClass[];
  underweightList: AssetClass[];
  risks: Array<{ severity: 'LOW' | 'MEDIUM' | 'HIGH'; title: string; rationale: string }>;
};

function resolveModel(): string {
  return anthropicModel('ANTHROPIC_NARRATIVE_MODEL');
}

function resolveClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

// ---------------------------------------------------------------------------
// Offline fallback — deterministic template-based narrative used when no API
// key is set. Keeps the pipeline runnable end-to-end in dev.
// ---------------------------------------------------------------------------
function buildOfflineNarrative(
  snap: QuarterlyMarketSnapshot,
  prior: QuarterlyMarketSnapshot | null
): NarrativeDraft {
  const base = Number(snap.baseRatePct ?? 0);
  const cpi = Number(snap.cpiYoYPct ?? 0);
  const fx = Number(snap.krwUsd ?? 0);
  const txCount = snap.transactionCount ?? 0;
  const priorPrice = prior?.medianPriceKrwPerSqm ? Number(prior.medianPriceKrwPerSqm) : null;
  const currPrice = snap.medianPriceKrwPerSqm ? Number(snap.medianPriceKrwPerSqm) : null;
  const qoq = priorPrice && currPrice ? ((currPrice - priorPrice) / priorPrice) * 100 : null;

  const regime = base >= 3.5 ? 'restrictive' : base >= 2.5 ? 'neutral' : 'accommodative';
  const overweight: AssetClass[] =
    regime === 'restrictive'
      ? ['INDUSTRIAL' as AssetClass, 'MULTIFAMILY' as AssetClass]
      : ['OFFICE' as AssetClass, 'DATA_CENTER' as AssetClass];
  const underweight: AssetClass[] =
    regime === 'restrictive' ? ['RETAIL' as AssetClass, 'HOTEL' as AssetClass] : ['LAND' as AssetClass];

  return {
    headline: `${snap.submarket} ${snap.quarter} · base ${base.toFixed(2)}% / CPI ${cpi.toFixed(1)}% · ${regime} regime`,
    marketPulse:
      `${snap.submarket} recorded ${txCount} commercial transactions for ` +
      `${snap.transactionVolumeKrw ? (Number(snap.transactionVolumeKrw) / 1e9).toFixed(1) : 'n/a'}B KRW in volume. ` +
      `Median price/sqm ${currPrice ? (currPrice / 1e6).toFixed(1) + 'M KRW' : 'n/a'}` +
      (qoq !== null ? `, ${qoq >= 0 ? '+' : ''}${qoq.toFixed(1)}% QoQ.` : '.'),
    supplyPipeline:
      `No construction-pipeline API wired to this snapshot; integrate 건축HUB (MOLIT 건축인허가) for ` +
      `forward-looking deliveries. Offline fallback can only surface backward-looking transaction flow.`,
    capitalMarkets:
      `BOK base rate ${base.toFixed(2)}%, KRW/USD ${fx ? fx.toFixed(0) : 'n/a'}, CPI YoY ${cpi.toFixed(2)}%. ` +
      `Macro regime inferred as ${regime}.`,
    outlook:
      regime === 'restrictive'
        ? `Restrictive rate stance + elevated CPI pressures cap rates upward. Prefer income-stable industrial and multifamily; defer discretionary office acquisitions absent IRR cushion.`
        : regime === 'neutral'
          ? `Balanced macro backdrop supports selective core-plus deployment. Maintain diversified posture; monitor rate path vs CPI divergence.`
          : `Accommodative conditions favor growth assets and value-add. Office and data center returns compress fastest in easing cycles — act ahead of the curve.`,
    overweightList: overweight,
    underweightList: underweight,
    risks: [
      {
        severity: cpi > 3 ? 'HIGH' : cpi > 2 ? 'MEDIUM' : 'LOW',
        title: 'Inflation persistence',
        rationale: `CPI YoY ${cpi.toFixed(1)}% vs BOK target 2%.`
      },
      {
        severity: fx > 1400 ? 'HIGH' : fx > 1300 ? 'MEDIUM' : 'LOW',
        title: 'KRW weakness',
        rationale: `KRW/USD ${fx.toFixed(0)} increases USD-denominated debt service.`
      }
    ]
  };
}

function buildPrompt(
  snap: QuarterlyMarketSnapshot,
  prior: QuarterlyMarketSnapshot | null,
  national: QuarterlyMarketSnapshot | null
): string {
  const lines: string[] = [];
  lines.push(`You are a senior Korean commercial real-estate strategist writing a CBRE-style`);
  lines.push(`quarterly market note. The reader is an institutional LP reviewing deployment.`);
  lines.push('');
  lines.push(`Submarket: ${snap.submarket}  Market: ${snap.market}  Quarter: ${snap.quarter}`);
  lines.push(`Asset class filter: ${snap.assetClass ?? '(all)'}`);
  lines.push('');
  lines.push('## Macro');
  lines.push(`- BOK base rate: ${snap.baseRatePct ?? 'n/a'}%`);
  lines.push(`- KRW/USD: ${snap.krwUsd ?? 'n/a'}`);
  lines.push(`- CPI YoY: ${snap.cpiYoYPct ?? 'n/a'}%`);
  lines.push(`- GDP YoY: ${snap.gdpYoYPct ?? 'n/a'}%`);
  lines.push('');
  lines.push('## Submarket transactions');
  lines.push(`- Transactions: ${snap.transactionCount ?? 'n/a'}`);
  lines.push(`- Volume KRW: ${snap.transactionVolumeKrw?.toString() ?? 'n/a'}`);
  lines.push(`- Median price/sqm: ${snap.medianPriceKrwPerSqm?.toString() ?? 'n/a'}`);
  lines.push(`- QoQ %: ${snap.priceChangeQoQPct?.toString() ?? 'n/a'}`);
  lines.push(`- YoY %: ${snap.priceChangeYoYPct?.toString() ?? 'n/a'}`);
  if (prior) {
    lines.push('');
    lines.push('## Prior-quarter comparison');
    lines.push(`- ${prior.quarter} transactions: ${prior.transactionCount ?? 'n/a'}`);
    lines.push(`- ${prior.quarter} volume: ${prior.transactionVolumeKrw?.toString() ?? 'n/a'}`);
    lines.push(`- ${prior.quarter} median price/sqm: ${prior.medianPriceKrwPerSqm?.toString() ?? 'n/a'}`);
  }
  if (national) {
    const raw = national.rawMetrics as { dart?: { topReitDisclosures?: unknown[]; topRealEstateTransactions?: unknown[] } };
    lines.push('');
    lines.push('## Capital-markets signal (DART disclosures, national)');
    lines.push(`- REIT disclosures this quarter: ${raw?.dart?.topReitDisclosures?.length ?? 0}`);
    lines.push(`- Real-estate transaction disclosures: ${raw?.dart?.topRealEstateTransactions?.length ?? 0}`);
    if (raw?.dart?.topRealEstateTransactions && raw.dart.topRealEstateTransactions.length > 0) {
      lines.push('- Sample disclosures:');
      for (const d of raw.dart.topRealEstateTransactions.slice(0, 8) as Array<{ corpName: string; reportName: string; receiptDate: string }>) {
        lines.push(`  * ${d.receiptDate} · ${d.corpName} · ${d.reportName}`);
      }
    }
  }
  lines.push('');
  lines.push('## Required output');
  lines.push('Return a single JSON object (no prose outside it) with this exact shape:');
  lines.push('{');
  lines.push('  "headline": "<1 sentence, ≤120 chars>",');
  lines.push('  "marketPulse": "<150-250 words: transaction volume, price trend, vacancy/rent signal>",');
  lines.push('  "supplyPipeline": "<100-200 words: acknowledge supply-pipeline data gap if none; otherwise cite new construction approvals>",');
  lines.push('  "capitalMarkets": "<150-250 words: rate path, cap rate implication, REIT flows, cross-border capital>",');
  lines.push('  "outlook": "<200-300 words forward-looking, specific to this submarket>",');
  lines.push('  "overweightList": ["OFFICE"|"INDUSTRIAL"|"RETAIL"|"MULTIFAMILY"|"HOTEL"|"DATA_CENTER"|"LAND"|"MIXED_USE", ...],');
  lines.push('  "underweightList": [...same enum...],');
  lines.push('  "risks": [{"severity":"LOW|MEDIUM|HIGH","title":"...","rationale":"..."}, ...at least 3 risks]');
  lines.push('}');
  lines.push('');
  lines.push('Rules:');
  lines.push('- Be specific about numbers; cite the value you are interpreting.');
  lines.push('- If a metric is null, call it out as a known data gap rather than fabricating.');
  lines.push('- Maintain an institutional tone (no hype, no hedging to the point of being useless).');
  lines.push('- Output ONLY the JSON object.');
  return lines.join('\n');
}

function parseModelResponse(raw: string): NarrativeDraft {
  // Strip markdown code fences if Claude wraps the JSON
  let text = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]+?)\s*```$/.exec(text);
  if (fence) text = fence[1]!.trim();
  const parsed = JSON.parse(text) as NarrativeDraft;
  if (
    typeof parsed.headline !== 'string' ||
    typeof parsed.marketPulse !== 'string' ||
    typeof parsed.outlook !== 'string' ||
    !Array.isArray(parsed.overweightList) ||
    !Array.isArray(parsed.underweightList) ||
    !Array.isArray(parsed.risks)
  ) {
    throw new Error('Narrative response missing required fields');
  }
  return parsed;
}

export type GenerateNarrativeInput = {
  snapshotId: string;
  reviewer?: string;
  status?: 'DRAFT' | 'HUMAN_REVIEWED' | 'PUBLISHED';
};

export async function generateNarrative(
  input: GenerateNarrativeInput
): Promise<QuarterlyMarketNarrative> {
  const snap = await prisma.quarterlyMarketSnapshot.findUnique({
    where: { id: input.snapshotId }
  });
  if (!snap) throw new Error(`Snapshot ${input.snapshotId} not found`);

  // Find prior quarter snapshot (same submarket + assetClass) for QoQ context
  const prior = await findPriorSnapshot(snap);
  const national = snap.submarket === '전국'
    ? null
    : await prisma.quarterlyMarketSnapshot.findUnique({
        where: {
          market_submarket_assetClass_quarter: {
            market: snap.market,
            submarket: '전국',
            assetClass: snap.assetClass as never,
            quarter: snap.quarter
          }
        }
      });

  const client = resolveClient();
  let draft: NarrativeDraft;
  let model: string;
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;

  if (!client) {
    draft = buildOfflineNarrative(snap, prior);
    model = 'offline-template';
  } else {
    model = resolveModel();
    const prompt = buildPrompt(snap, prior, national);
    const response = await client.messages.create({
      model,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    });
    const first = response.content[0];
    if (!first || first.type !== 'text') {
      throw new Error('Claude returned no text content');
    }
    draft = parseModelResponse(first.text);
    promptTokens = response.usage?.input_tokens ?? null;
    completionTokens = response.usage?.output_tokens ?? null;
  }

  const created = await prisma.quarterlyMarketNarrative.create({
    data: {
      snapshotId: snap.id,
      status: (input.status ?? 'DRAFT') as never,
      model,
      promptTokens,
      completionTokens,
      headline: draft.headline,
      marketPulse: draft.marketPulse,
      supplyPipeline: draft.supplyPipeline,
      capitalMarkets: draft.capitalMarkets,
      outlook: draft.outlook,
      overweightList: draft.overweightList as never,
      underweightList: draft.underweightList as never,
      risks: draft.risks as never,
      priorQuarterId: prior?.id ?? null,
      reviewedBy: input.reviewer ?? null,
      reviewedAt: input.status === 'HUMAN_REVIEWED' ? new Date() : null,
      publishedAt: input.status === 'PUBLISHED' ? new Date() : null
    }
  });
  return created;
}

async function findPriorSnapshot(
  snap: QuarterlyMarketSnapshot
): Promise<QuarterlyMarketSnapshot | null> {
  const m = /^(\d{4})Q([1-4])$/.exec(snap.quarter);
  if (!m) return null;
  const year = Number(m[1]);
  const q = Number(m[2]);
  const totalQ = year * 4 + (q - 1) - 1;
  const priorKey = `${Math.floor(totalQ / 4)}Q${(totalQ % 4) + 1}`;
  return prisma.quarterlyMarketSnapshot.findUnique({
    where: {
      market_submarket_assetClass_quarter: {
        market: snap.market,
        submarket: snap.submarket,
        assetClass: snap.assetClass as never,
        quarter: priorKey
      }
    }
  });
}
