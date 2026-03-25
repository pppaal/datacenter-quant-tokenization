import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { extractDocumentFactsWithAi } from '@/lib/ai/openai';

const DEFAULT_CHUNK_SIZE = 900;
const DEFAULT_CHUNK_OVERLAP = 120;

type ExtractionDb = Pick<PrismaClient, 'documentExtractionRun' | 'documentChunk' | 'documentFact'>;

export type ExtractedDocumentFactInput = {
  factType: string;
  factKey: string;
  factValueText?: string | null;
  factValueNumber?: number | null;
  factValueDate?: string | null;
  unit?: string | null;
  confidenceScore?: number | null;
};

export type DocumentExtractionInput = {
  assetId?: string | null;
  documentVersionId: string;
  assetName: string;
  title: string;
  extractedText: string;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function chunkText(text: string, chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_CHUNK_OVERLAP) {
  const normalized = text.trim();
  if (!normalized) return [];

  const chunks: Array<{ chunkIndex: number; text: string; pageNumber: number | null }> = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < normalized.length) {
    let end = Math.min(normalized.length, start + chunkSize);
    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf(' ', end);
      if (boundary > start + Math.floor(chunkSize * 0.6)) {
        end = boundary;
      }
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk) {
      chunks.push({
        chunkIndex,
        text: chunk,
        pageNumber: null
      });
      chunkIndex += 1;
    }

    if (end >= normalized.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

function parseNumericToken(raw: string) {
  const parsed = Number(raw.replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(raw?: string | null) {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter(Boolean);
}

function findSentence(sentences: string[], pattern: RegExp) {
  return sentences.find((sentence) => pattern.test(sentence)) ?? null;
}

export function inferFactsFromText(text: string): ExtractedDocumentFactInput[] {
  const normalized = normalizeWhitespace(text);
  const sentences = splitSentences(text);
  const facts: ExtractedDocumentFactInput[] = [];

  for (const match of normalized.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(MW|kW)\b/gi)) {
    const numericValue = parseNumericToken(match[1]);
    if (numericValue === null) continue;
    facts.push({
      factType: 'capacity',
      factKey: 'contracted_kw',
      factValueNumber: match[2].toUpperCase() === 'MW' ? numericValue * 1000 : numericValue,
      unit: 'kW',
      confidenceScore: 0.72
    });
  }

  const percentPatterns = [
    { regex: /occupancy(?: assumption)?[^.\d]{0,12}(\d[\d,]*(?:\.\d+)?)\s*%/i, factKey: 'occupancy_pct' },
    { regex: /cap\s*rate[^.\d]{0,12}(\d[\d,]*(?:\.\d+)?)\s*%/i, factKey: 'cap_rate_pct' },
    { regex: /discount\s*rate[^.\d]{0,12}(\d[\d,]*(?:\.\d+)?)\s*%/i, factKey: 'discount_rate_pct' }
  ];

  for (const pattern of percentPatterns) {
    const match = normalized.match(pattern.regex);
    const value = match?.[1] ? parseNumericToken(match[1]) : null;
    if (value !== null) {
      facts.push({
        factType: 'metric',
        factKey: pattern.factKey,
        factValueNumber: value,
        unit: 'pct',
        confidenceScore: 0.76
      });
    }
  }

  const moneyPatterns = [
    { regex: /capex[^.\d]{0,20}krw\s*([\d,]+(?:\.\d+)?)/i, factType: 'cost', factKey: 'capex_krw' },
    { regex: /budget[^.\d]{0,20}krw\s*([\d,]+(?:\.\d+)?)/i, factType: 'cost', factKey: 'budget_krw' },
    { regex: /monthly\s+rate[^.\d]{0,20}krw\s*([\d,]+(?:\.\d+)?)/i, factType: 'lease', factKey: 'monthly_rate_per_kw_krw' }
  ];

  for (const pattern of moneyPatterns) {
    const match = normalized.match(pattern.regex);
    const value = match?.[1] ? parseNumericToken(match[1]) : null;
    if (value !== null) {
      facts.push({
        factType: pattern.factType,
        factKey: pattern.factKey,
        factValueNumber: value,
        unit: 'KRW',
        confidenceScore: 0.74
      });
    }
  }

  const permitSentence =
    findSentence(sentences, /permit stage|power approval status|zoning approval status|environmental review status/i) ??
    findSentence(sentences, /power allocation|permit/i);
  if (permitSentence) {
    facts.push({
      factType: 'permit',
      factKey: 'permit_status_note',
      factValueText: permitSentence,
      confidenceScore: 0.68
    });
  }

  const counterpartySentence = findSentence(sentences, /tenant|lender|utility|counterparty/i);
  if (counterpartySentence) {
    facts.push({
      factType: 'counterparty',
      factKey: 'counterparty_note',
      factValueText: counterpartySentence,
      confidenceScore: 0.6
    });
  }

  return facts;
}

function dedupeFacts(facts: ExtractedDocumentFactInput[]) {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = [
      fact.factType,
      fact.factKey,
      fact.factValueText ?? '',
      fact.factValueNumber ?? '',
      fact.factValueDate ?? ''
    ].join('|');

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function ingestDocumentExtraction(
  input: DocumentExtractionInput,
  deps?: {
    db?: ExtractionDb;
    aiExtractor?: typeof extractDocumentFactsWithAi;
  }
) {
  const db = deps?.db ?? prisma;
  const aiExtractor = deps?.aiExtractor ?? extractDocumentFactsWithAi;
  const normalizedText = input.extractedText.trim();

  if (!normalizedText) return null;

  const chunks = chunkText(normalizedText);
  const heuristicFacts = inferFactsFromText(normalizedText);
  const aiFacts = await aiExtractor({
    assetName: input.assetName,
    title: input.title,
    extractedText: normalizedText
  });
  const facts = dedupeFacts([
    ...heuristicFacts,
    ...aiFacts.map((fact) => ({
      ...fact,
      factValueDate: normalizeDate(fact.factValueDate ?? null)
    }))
  ]);

  const run = await db.documentExtractionRun.create({
    data: {
      documentVersionId: input.documentVersionId,
      modelName: process.env.OPENAI_API_KEY ? process.env.OPENAI_MODEL || 'gpt-4o-mini' : 'heuristic-fallback',
      taskType: 'document_extract',
      status: 'COMPLETED',
      rawOutput: {
        heuristicFacts,
        aiFacts
      },
      structuredOutput: {
        chunkCount: chunks.length,
        factCount: facts.length
      }
    }
  });

  for (const chunk of chunks) {
    await db.documentChunk.create({
      data: {
        documentVersionId: input.documentVersionId,
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
        pageNumber: chunk.pageNumber
      }
    });
  }

  for (const fact of facts) {
    await db.documentFact.create({
      data: {
        assetId: input.assetId ?? null,
        documentVersionId: input.documentVersionId,
        factType: fact.factType,
        factKey: fact.factKey,
        factValueText: fact.factValueText ?? null,
        factValueNumber: fact.factValueNumber ?? null,
        factValueDate: fact.factValueDate ? new Date(fact.factValueDate) : null,
        unit: fact.unit ?? null,
        confidenceScore: fact.confidenceScore ?? null,
        extractionRunId: run.id
      }
    });
  }

  return {
    runId: run.id,
    chunkCount: chunks.length,
    factCount: facts.length
  };
}
