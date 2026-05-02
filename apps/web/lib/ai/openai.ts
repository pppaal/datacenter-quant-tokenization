import OpenAI from 'openai';
import { openaiModel } from '@/lib/ai/models';
import {
  computeAiPromptHash,
  getCachedAiResponse,
  setCachedAiResponse
} from '@/lib/services/ai/response-cache';
import type { ExtractedDocumentFactInput } from '@/lib/services/document-extraction';
import type { ForecastDecisionNarrative } from '@/lib/services/forecast/decision';
import type { ParsedFinancialStatement } from '@/lib/services/financial-statements';
import type { UnderwritingAnalysis } from '@/lib/services/valuation-engine';

const model = openaiModel();

function getClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * Run a chat-completion call through the AiResponseCache.
 *
 * Hash key = SHA-256(canonical(model, system, messages)). Same input set →
 * same hash → cached response. The hash deliberately excludes temperature
 * + response_format because (a) those are stable per call site here, and
 * (b) including them would mean a future temperature tweak invalidates
 * every previously-cached row at once. If you change a call site's
 * temperature you should change its TTL on the next deploy too.
 *
 * Cache failures (DB down, etc.) MUST NOT break the live path: every read
 * + write is wrapped so the call site degrades to a fresh API hit.
 */
async function cachedChatCompletion(input: {
  client: OpenAI;
  systemPrompt: string;
  userContent: string;
  ttlSeconds: number;
  responseFormat?: { type: 'json_object' };
  temperature: number;
}): Promise<{ content: string | null; cacheHit: boolean }> {
  const messages: ChatMessage[] = [
    { role: 'system', content: input.systemPrompt },
    { role: 'user', content: input.userContent }
  ];
  const promptHash = computeAiPromptHash({ model, system: input.systemPrompt, messages });

  const hit = await getCachedAiResponse({ promptHash, model }).catch(() => null);
  if (hit) return { content: hit.response, cacheHit: true };

  const response = await input.client.chat.completions.create({
    model,
    temperature: input.temperature,
    response_format: input.responseFormat,
    messages
  });
  const content = response.choices[0]?.message?.content?.trim() ?? null;
  if (content) {
    await setCachedAiResponse({
      promptHash,
      model,
      response: content,
      inputTokens: response.usage?.prompt_tokens ?? null,
      outputTokens: response.usage?.completion_tokens ?? null,
      ttlSeconds: input.ttlSeconds
    }).catch(() => {});
  }
  return { content, cacheHit: false };
}

export async function generateUnderwritingMemo(
  analysis: UnderwritingAnalysis,
  options?: {
    forecastDecisionNarrative?: ForecastDecisionNarrative | null;
  }
) {
  const assetClassLabel =
    analysis.asset.assetClass === 'DATA_CENTER'
      ? 'data-center'
      : analysis.asset.assetClass.toLowerCase().replace(/_/g, ' ');
  const forecastNarrative = options?.forecastDecisionNarrative;
  const forecastSummary = forecastNarrative
    ? ` Forecast readout: ${forecastNarrative.leadSentence} ${forecastNarrative.constraintSentence} ${forecastNarrative.downsideSentence}`
    : '';
  const fallback = [
    `${analysis.asset.name} is positioned as a ${assetClassLabel} investment opportunity with a base scenario value of ${analysis.baseCaseValueKrw.toLocaleString()} KRW.`,
    `The investment memo highlights ${analysis.keyRisks[0]?.toLowerCase() ?? 'power and permit diligence'}, while the confidence score of ${analysis.confidenceScore.toFixed(1)} reflects current source coverage and fallback usage.`,
    ...(forecastSummary ? [forecastSummary.trim()] : []),
    'Use this IM as committee material for internal review rather than as a public offering or personalized recommendation.'
  ].join(' ');

  const client = getClient();
  if (!client) return fallback;

  try {
    // 1h TTL: the analysis blob is sensitive to confidence, scenario
    // values, and risk list, so a stale cache hit on a re-run after a
    // valuation refresh would hide the change. Hashing covers the
    // structured input directly so most re-renders within the hour are
    // genuine duplicates.
    const { content } = await cachedChatCompletion({
      client,
      systemPrompt: `You write concise institutional investment memos for ${assetClassLabel} real-estate opportunities. Use terms like investment memo, analysis, scenario, return profile, downside, and diligence support. Avoid retail offering or return-guarantee language.`,
      userContent: JSON.stringify({
        asset: analysis.asset,
        scenarios: analysis.scenarios,
        confidenceScore: analysis.confidenceScore,
        keyRisks: analysis.keyRisks,
        dueDiligenceChecklist: analysis.ddChecklist,
        forecastDecisionNarrative: forecastNarrative
      }),
      temperature: 0.2,
      ttlSeconds: 3600
    });
    return content || fallback;
  } catch {
    return fallback;
  }
}

export async function generateDocumentSummary(input: {
  assetName: string;
  title: string;
  extractedText?: string;
}) {
  const preview = input.extractedText?.slice(0, 600) ?? '';
  const fallback = `AI summary for ${input.title}: supporting diligence material for ${input.assetName}. Review coverage focuses on scope, counterparties, timing constraints, and any data gaps visible in the uploaded text excerpt.`;
  const client = getClient();
  if (!client || !preview) return fallback;

  try {
    // 24h TTL: the input is the document text excerpt, which doesn't change
    // unless the file is re-uploaded — at which point the hash changes too.
    const { content } = await cachedChatCompletion({
      client,
      systemPrompt:
        'Summarize diligence documents for an institutional asset-review platform. Keep it to 2 sentences. Avoid investment-advice language.',
      userContent: `Asset: ${input.assetName}\nDocument: ${input.title}\nExcerpt:\n${preview}`,
      temperature: 0.1,
      ttlSeconds: 86400
    });
    return content || fallback;
  } catch {
    return fallback;
  }
}

export async function extractDocumentFactsWithAi(input: {
  assetName: string;
  title: string;
  extractedText: string;
}): Promise<ExtractedDocumentFactInput[]> {
  const preview = input.extractedText.slice(0, 5000).trim();
  const client = getClient();
  if (!client || !preview) return [];

  try {
    // 24h TTL: structured extraction over a fixed text excerpt is stable.
    const { content: rawContent } = await cachedChatCompletion({
      client,
      systemPrompt:
        'Extract structured diligence facts for institutional real-estate underwriting. Return JSON with a top-level "facts" array. Each fact should include factType, factKey, optional factValueText, optional factValueNumber, optional factValueDate as ISO string, optional unit, and confidenceScore between 0 and 1.',
      userContent: `Asset: ${input.assetName}\nDocument: ${input.title}\nText:\n${preview}`,
      temperature: 0.1,
      responseFormat: { type: 'json_object' },
      ttlSeconds: 86400
    });

    const content = rawContent ?? '';
    const parsed = JSON.parse(content || '{}') as { facts?: unknown[] };

    const mapped = (parsed.facts ?? []).map((item) => {
      if (!item || typeof item !== 'object') return null;
      const candidate = item as Record<string, unknown>;
      const fact: ExtractedDocumentFactInput = {
        factType: typeof candidate.factType === 'string' ? candidate.factType : 'document_note',
        factKey: typeof candidate.factKey === 'string' ? candidate.factKey : 'note',
        factValueText: typeof candidate.factValueText === 'string' ? candidate.factValueText : null,
        factValueNumber:
          typeof candidate.factValueNumber === 'number' &&
          Number.isFinite(candidate.factValueNumber)
            ? candidate.factValueNumber
            : null,
        factValueDate: typeof candidate.factValueDate === 'string' ? candidate.factValueDate : null,
        unit: typeof candidate.unit === 'string' ? candidate.unit : null,
        confidenceScore:
          typeof candidate.confidenceScore === 'number' &&
          Number.isFinite(candidate.confidenceScore)
            ? Math.min(1, Math.max(0, candidate.confidenceScore))
            : 0.65
      };
      return fact;
    });

    return mapped.filter((fact): fact is ExtractedDocumentFactInput => fact !== null);
  } catch {
    return [];
  }
}

export async function extractFinancialStatementWithAi(input: {
  assetName: string;
  title: string;
  extractedText: string;
}): Promise<Partial<ParsedFinancialStatement> | null> {
  const preview = input.extractedText.slice(0, 7000).trim();
  const client = getClient();
  if (!client || !preview) return null;

  try {
    // 24h TTL: financial extraction over a frozen text excerpt is the most
    // strongly cacheable call we make — same numbers in, same numbers out.
    const { content: rawContent } = await cachedChatCompletion({
      client,
      systemPrompt:
        'Extract a structured financial statement for real-estate underwriting. Return JSON with keys: counterpartyName, counterpartyRole, statementType, fiscalYear, fiscalPeriod, currency, revenueKrw, ebitdaKrw, cashKrw, operatingCashFlowKrw, capexKrw, totalDebtKrw, currentAssetsKrw, currentLiabilitiesKrw, currentDebtMaturitiesKrw, totalAssetsKrw, totalEquityKrw, interestExpenseKrw, and optional lineItems array. Use normalized absolute numeric values, not formatted strings. If unknown, return null.',
      userContent: `Asset: ${input.assetName}\nDocument: ${input.title}\nText:\n${preview}`,
      temperature: 0.1,
      responseFormat: { type: 'json_object' },
      ttlSeconds: 86400
    });

    const content = rawContent ?? '';
    const parsed = JSON.parse(content || '{}') as Record<string, unknown>;
    const toNullableNumber = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) ? value : null;
    const lineItems = Array.isArray(parsed.lineItems)
      ? parsed.lineItems
          .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const candidate = item as Record<string, unknown>;
            const valueKrw = toNullableNumber(candidate.valueKrw ?? candidate.value);
            const lineKey = typeof candidate.lineKey === 'string' ? candidate.lineKey : null;
            const lineLabel = typeof candidate.lineLabel === 'string' ? candidate.lineLabel : null;
            if (!lineKey || !lineLabel || valueKrw === null) return null;
            return { lineKey, lineLabel, valueKrw };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null)
      : undefined;

    return {
      counterpartyName:
        typeof parsed.counterpartyName === 'string' ? parsed.counterpartyName : undefined,
      counterpartyRole:
        typeof parsed.counterpartyRole === 'string' ? parsed.counterpartyRole : undefined,
      statementType: typeof parsed.statementType === 'string' ? parsed.statementType : undefined,
      fiscalYear: toNullableNumber(parsed.fiscalYear),
      fiscalPeriod: typeof parsed.fiscalPeriod === 'string' ? parsed.fiscalPeriod : undefined,
      currency: typeof parsed.currency === 'string' ? parsed.currency : undefined,
      revenueKrw: toNullableNumber(parsed.revenueKrw),
      ebitdaKrw: toNullableNumber(parsed.ebitdaKrw),
      cashKrw: toNullableNumber(parsed.cashKrw),
      operatingCashFlowKrw: toNullableNumber(parsed.operatingCashFlowKrw),
      capexKrw: toNullableNumber(parsed.capexKrw),
      totalDebtKrw: toNullableNumber(parsed.totalDebtKrw),
      currentAssetsKrw: toNullableNumber(parsed.currentAssetsKrw),
      currentLiabilitiesKrw: toNullableNumber(parsed.currentLiabilitiesKrw),
      currentDebtMaturitiesKrw: toNullableNumber(parsed.currentDebtMaturitiesKrw),
      totalAssetsKrw: toNullableNumber(parsed.totalAssetsKrw),
      totalEquityKrw: toNullableNumber(parsed.totalEquityKrw),
      interestExpenseKrw: toNullableNumber(parsed.interestExpenseKrw),
      lineItems
    };
  } catch {
    return null;
  }
}

export type QuarterlyNarrativeInput = {
  quarterLabel: string;
  capRateMatrix: string;
  topTransactions: string;
  houseViewBullets: string;
};

/**
 * 3-paragraph quarterly market narrative for the House view publication.
 * Input is already string-shaped by the caller (see
 * lib/services/research/quarterly-narrative.ts); this just wraps the
 * cached chat completion so behaviour is consistent with the other
 * AI call sites — temp 0.3 (some flow), 6h TTL (a re-render in the
 * same afternoon should be cheap, but a manual edit-then-re-run picks
 * up the change).
 */
export async function generateQuarterlyMarketNarrative(
  input: QuarterlyNarrativeInput
): Promise<string | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const { content } = await cachedChatCompletion({
      client,
      systemPrompt:
        '당신은 한국 상업용 부동산 리서치 시니어 애널리스트다. 분기 IC 보고서의 도입 narrative를 작성한다. ' +
        '원칙: 입력으로 받은 캡레이트 매트릭스 + 거래 명단 + 승인된 House view bullet 외의 숫자를 만들어내지 말 것. ' +
        '3개 단락. (1) 시장 요약 — 분기 매트릭스에서 가장 큰 시그널 1-2개. ' +
        '(2) 거래 헤드라인 — 최상위 거래 1-2건 인용. ' +
        '(3) House view 정렬 — 승인된 view bullet과 매트릭스 사이 정렬/괴리. ' +
        '한국어, 단락당 3-5문장, IC 톤. 마크다운 헤더 / 리스트 사용 금지.',
      userContent: [
        `분기: ${input.quarterLabel}`,
        '',
        '캡레이트 매트릭스 (서브마켓 × 등급 × 자산군):',
        input.capRateMatrix,
        '',
        '분기 상위 거래:',
        input.topTransactions,
        '',
        '승인된 House view (bullet):',
        input.houseViewBullets
      ].join('\n'),
      temperature: 0.3,
      ttlSeconds: 21600
    });
    return content;
  } catch {
    return null;
  }
}
