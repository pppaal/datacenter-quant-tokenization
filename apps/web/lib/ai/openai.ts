import OpenAI from 'openai';
import { openaiModel } from '@/lib/ai/models';
import type { ExtractedDocumentFactInput } from '@/lib/services/document-extraction';
import type { ForecastDecisionNarrative } from '@/lib/services/forecast/decision';
import type { ParsedFinancialStatement } from '@/lib/services/financial-statements';
import type { UnderwritingAnalysis } from '@/lib/services/valuation-engine';

const model = openaiModel();

function getClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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
    const response = await client.chat.completions.create({
      model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            `You write concise institutional investment memos for ${assetClassLabel} real-estate opportunities. Use terms like investment memo, analysis, scenario, return profile, downside, and diligence support. Avoid retail offering or return-guarantee language.`
        },
        {
          role: 'user',
          content: JSON.stringify({
            asset: analysis.asset,
            scenarios: analysis.scenarios,
            confidenceScore: analysis.confidenceScore,
            keyRisks: analysis.keyRisks,
            dueDiligenceChecklist: analysis.ddChecklist,
            forecastDecisionNarrative: forecastNarrative
          })
        }
      ]
    });

    return response.choices[0]?.message?.content?.trim() || fallback;
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
    const response = await client.chat.completions.create({
      model,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content:
            'Summarize diligence documents for an institutional asset-review platform. Keep it to 2 sentences. Avoid investment-advice language.'
        },
        {
          role: 'user',
          content: `Asset: ${input.assetName}\nDocument: ${input.title}\nExcerpt:\n${preview}`
        }
      ]
    });

    return response.choices[0]?.message?.content?.trim() || fallback;
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
    const response = await client.chat.completions.create({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Extract structured diligence facts for institutional real-estate underwriting. Return JSON with a top-level "facts" array. Each fact should include factType, factKey, optional factValueText, optional factValueNumber, optional factValueDate as ISO string, optional unit, and confidenceScore between 0 and 1.'
        },
        {
          role: 'user',
          content: `Asset: ${input.assetName}\nDocument: ${input.title}\nText:\n${preview}`
        }
      ]
    });

    const content = response.choices[0]?.message?.content?.trim() ?? '';
    const parsed = JSON.parse(content || '{}') as { facts?: unknown[] };

    const mapped = (parsed.facts ?? [])
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const candidate = item as Record<string, unknown>;
        const fact: ExtractedDocumentFactInput = {
          factType: typeof candidate.factType === 'string' ? candidate.factType : 'document_note',
          factKey: typeof candidate.factKey === 'string' ? candidate.factKey : 'note',
          factValueText: typeof candidate.factValueText === 'string' ? candidate.factValueText : null,
          factValueNumber:
            typeof candidate.factValueNumber === 'number' && Number.isFinite(candidate.factValueNumber)
              ? candidate.factValueNumber
              : null,
          factValueDate: typeof candidate.factValueDate === 'string' ? candidate.factValueDate : null,
          unit: typeof candidate.unit === 'string' ? candidate.unit : null,
          confidenceScore:
            typeof candidate.confidenceScore === 'number' && Number.isFinite(candidate.confidenceScore)
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
    const response = await client.chat.completions.create({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Extract a structured financial statement for real-estate underwriting. Return JSON with keys: counterpartyName, counterpartyRole, statementType, fiscalYear, fiscalPeriod, currency, revenueKrw, ebitdaKrw, cashKrw, operatingCashFlowKrw, capexKrw, totalDebtKrw, currentAssetsKrw, currentLiabilitiesKrw, currentDebtMaturitiesKrw, totalAssetsKrw, totalEquityKrw, interestExpenseKrw, and optional lineItems array. Use normalized absolute numeric values, not formatted strings. If unknown, return null.'
        },
        {
          role: 'user',
          content: `Asset: ${input.assetName}\nDocument: ${input.title}\nText:\n${preview}`
        }
      ]
    });

    const content = response.choices[0]?.message?.content?.trim() ?? '';
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
      counterpartyName: typeof parsed.counterpartyName === 'string' ? parsed.counterpartyName : undefined,
      counterpartyRole: typeof parsed.counterpartyRole === 'string' ? parsed.counterpartyRole : undefined,
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
