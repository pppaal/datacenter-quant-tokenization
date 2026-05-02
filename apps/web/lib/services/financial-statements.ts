import type { Prisma } from '@prisma/client';
import { extractFinancialStatementWithAi } from '@/lib/ai/openai';
import { prisma } from '@/lib/db/prisma';

type FinancialStatementDb = {
  counterparty: {
    findFirst: typeof prisma.counterparty.findFirst;
    create: typeof prisma.counterparty.create;
    update: typeof prisma.counterparty.update;
  };
  financialStatement: {
    create: typeof prisma.financialStatement.create;
  };
  financialLineItem: {
    create: typeof prisma.financialLineItem.create;
  };
  creditAssessment: {
    create: typeof prisma.creditAssessment.create;
  };
};

type StatementLineItem = {
  lineKey: string;
  lineLabel: string;
  valueKrw: number;
};

type ParsedFinancialStatementCandidate = Partial<Omit<ParsedFinancialStatement, 'lineItems'>> & {
  lineItems?: StatementLineItem[];
};

export type ParsedFinancialStatement = {
  counterpartyName: string;
  counterpartyRole: string;
  statementType: string;
  fiscalYear: number | null;
  fiscalPeriod: string | null;
  currency: string;
  revenueKrw: number | null;
  ebitdaKrw: number | null;
  cashKrw: number | null;
  operatingCashFlowKrw: number | null;
  capexKrw: number | null;
  totalDebtKrw: number | null;
  currentAssetsKrw: number | null;
  currentLiabilitiesKrw: number | null;
  currentDebtMaturitiesKrw: number | null;
  totalAssetsKrw: number | null;
  totalEquityKrw: number | null;
  interestExpenseKrw: number | null;
  lineItems: StatementLineItem[];
};

type CreditMetrics = {
  leverageMultiple: number | null;
  debtToEquityRatio: number | null;
  interestCoverage: number | null;
  cashToDebtRatio: number | null;
  currentRatio: number | null;
  workingCapitalKrw: number | null;
  operatingCashFlowToDebtRatio: number | null;
  currentMaturityCoverage: number | null;
};

function parseNumericToken(raw?: string | null, multiplier = 1) {
  if (!raw) return null;
  const normalized = raw.replace(/[^\d().,\-]/g, '').trim();
  if (!normalized) return null;
  const negative = normalized.includes('(') && normalized.includes(')');
  const parsed = Number(normalized.replace(/[(),]/g, '').replace(/,/g, '').trim());
  if (!Number.isFinite(parsed)) return null;
  const signed = negative ? -parsed : parsed;
  const scaled = signed * multiplier;
  return Number.isFinite(scaled) ? scaled : null;
}

function detectUnitMultiplier(text: string) {
  const normalized = text.toLowerCase();
  if (/(krw|usd)?\s+in\s+billions?|\bbillion\b/.test(normalized)) return 1_000_000_000;
  if (/(krw|usd)?\s+in\s+millions?|\bmillion\b|\bmm\b/.test(normalized)) return 1_000_000;
  if (/(krw|usd)?\s+in\s+thousands?|\bthousand\b|\bk\b/.test(normalized)) return 1_000;
  if (/\uc5b5\uc6d0|\uc5b5 \uc6d0/u.test(text)) return 100_000_000;
  if (/\ubc31\ub9cc\uc6d0|\ubc31\ub9cc \uc6d0/u.test(text)) return 1_000_000;
  if (/\ucc9c\uc6d0|\ucc9c \uc6d0/u.test(text)) return 1_000;
  return 1;
}

function normalizeStatementLines(text: string) {
  return text
    .split(/\r?\n|(?<=\.)\s+(?=[A-Z\p{Script=Hangul}])/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function extractLineItemValue(line: string, multiplier: number) {
  const match = line.match(/(\(?-?\d[\d,]*(?:\.\d+)?\)?)(?!.*\d)/);
  return match ? parseNumericToken(match[1], multiplier) : null;
}

function toCanonicalLineDefinition(lineLabel: string) {
  const normalized = lineLabel.toLowerCase();
  if (/(revenue|sales|rental revenue)/.test(normalized))
    return { lineKey: 'revenueKrw', lineLabel: 'Revenue' };
  if (/ebitda/.test(normalized)) return { lineKey: 'ebitdaKrw', lineLabel: 'EBITDA' };
  if (
    /(operating cash flow|cash flow from operations|net cash from operating activities)/.test(
      normalized
    )
  ) {
    return { lineKey: 'operatingCashFlowKrw', lineLabel: 'Operating Cash Flow' };
  }
  if (/(capital expenditures|capital expenditure|capex)/.test(normalized)) {
    return { lineKey: 'capexKrw', lineLabel: 'Capex' };
  }
  if (/(cash and cash equivalents|cash balance|cash)/.test(normalized))
    return { lineKey: 'cashKrw', lineLabel: 'Cash' };
  if (
    /(current maturities|debt due within one year|short-term debt|short term debt)/.test(normalized)
  ) {
    return { lineKey: 'currentDebtMaturitiesKrw', lineLabel: 'Current Debt Maturities' };
  }
  if (/(total debt|borrowings|net debt|debt)/.test(normalized) && !/cash/.test(normalized)) {
    return { lineKey: 'totalDebtKrw', lineLabel: 'Total Debt' };
  }
  if (/current assets/.test(normalized))
    return { lineKey: 'currentAssetsKrw', lineLabel: 'Current Assets' };
  if (/current liabilities/.test(normalized)) {
    return { lineKey: 'currentLiabilitiesKrw', lineLabel: 'Current Liabilities' };
  }
  if (/total assets|assets/.test(normalized))
    return { lineKey: 'totalAssetsKrw', lineLabel: 'Total Assets' };
  if (/(total equity|shareholders' equity|equity)/.test(normalized)) {
    return { lineKey: 'totalEquityKrw', lineLabel: 'Total Equity' };
  }
  if (/(interest expense|finance cost|interest)/.test(normalized)) {
    return { lineKey: 'interestExpenseKrw', lineLabel: 'Interest Expense' };
  }

  const lineKey = normalized
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return lineKey ? { lineKey, lineLabel } : null;
}

function collectCandidateLineItems(text: string) {
  const multiplier = detectUnitMultiplier(text);
  const lines = normalizeStatementLines(text);

  return lines
    .map((line) => {
      const valueKrw = extractLineItemValue(line, multiplier);
      if (valueKrw === null) return null;
      const lineLabel = line.replace(/[:.\-]*\s*\(?-?\d[\d,]*(?:\.\d+)?\)?\s*$/u, '').trim();
      if (lineLabel.length < 2) return null;
      const canonical = toCanonicalLineDefinition(lineLabel);
      if (!canonical) return null;
      return { lineKey: canonical.lineKey, lineLabel: canonical.lineLabel, valueKrw };
    })
    .filter((item): item is StatementLineItem => item !== null);
}

function findLineItemValue(
  lineItems: StatementLineItem[],
  aliases: string[],
  excludedAliases: string[] = []
) {
  const lowerAliases = aliases.map((alias) => alias.toLowerCase());
  const lowerExcludes = excludedAliases.map((alias) => alias.toLowerCase());

  for (const lineItem of lineItems) {
    const label = lineItem.lineLabel.toLowerCase();
    if (
      lowerAliases.some((alias) => label.includes(alias)) &&
      !lowerExcludes.some((alias) => label.includes(alias))
    ) {
      return lineItem.valueKrw;
    }
  }

  return null;
}

function dedupeLineItems(lineItems: StatementLineItem[]) {
  const seen = new Set<string>();
  const deduped: StatementLineItem[] = [];

  for (const item of lineItems) {
    const key = item.lineKey;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function countPopulatedMetrics(statement: ParsedFinancialStatementCandidate) {
  return [
    statement.revenueKrw,
    statement.ebitdaKrw,
    statement.cashKrw,
    statement.operatingCashFlowKrw,
    statement.capexKrw,
    statement.totalDebtKrw,
    statement.currentAssetsKrw,
    statement.currentLiabilitiesKrw,
    statement.currentDebtMaturitiesKrw,
    statement.totalAssetsKrw,
    statement.totalEquityKrw,
    statement.interestExpenseKrw
  ].filter((value) => value !== null && value !== undefined).length;
}

function mergeStatementCandidates(
  primary: ParsedFinancialStatementCandidate | null,
  fallback: ParsedFinancialStatementCandidate | null
) {
  if (!primary && !fallback) return null;

  const mergedLineItems = dedupeLineItems([
    ...(primary?.lineItems ?? []),
    ...(fallback?.lineItems ?? [])
  ]);
  const merged: ParsedFinancialStatementCandidate = {
    counterpartyName: primary?.counterpartyName ?? fallback?.counterpartyName,
    counterpartyRole: primary?.counterpartyRole ?? fallback?.counterpartyRole,
    statementType: primary?.statementType ?? fallback?.statementType,
    fiscalYear: primary?.fiscalYear ?? fallback?.fiscalYear ?? null,
    fiscalPeriod: primary?.fiscalPeriod ?? fallback?.fiscalPeriod ?? null,
    currency: primary?.currency ?? fallback?.currency ?? 'KRW',
    revenueKrw: primary?.revenueKrw ?? fallback?.revenueKrw ?? null,
    ebitdaKrw: primary?.ebitdaKrw ?? fallback?.ebitdaKrw ?? null,
    cashKrw: primary?.cashKrw ?? fallback?.cashKrw ?? null,
    operatingCashFlowKrw: primary?.operatingCashFlowKrw ?? fallback?.operatingCashFlowKrw ?? null,
    capexKrw: primary?.capexKrw ?? fallback?.capexKrw ?? null,
    totalDebtKrw: primary?.totalDebtKrw ?? fallback?.totalDebtKrw ?? null,
    currentAssetsKrw: primary?.currentAssetsKrw ?? fallback?.currentAssetsKrw ?? null,
    currentLiabilitiesKrw:
      primary?.currentLiabilitiesKrw ?? fallback?.currentLiabilitiesKrw ?? null,
    currentDebtMaturitiesKrw:
      primary?.currentDebtMaturitiesKrw ?? fallback?.currentDebtMaturitiesKrw ?? null,
    totalAssetsKrw: primary?.totalAssetsKrw ?? fallback?.totalAssetsKrw ?? null,
    totalEquityKrw: primary?.totalEquityKrw ?? fallback?.totalEquityKrw ?? null,
    interestExpenseKrw: primary?.interestExpenseKrw ?? fallback?.interestExpenseKrw ?? null,
    lineItems: mergedLineItems
  };

  return countPopulatedMetrics(merged) >= 3 ? merged : null;
}

function finalizeParsedStatement(
  input: {
    title: string;
    extractedText: string;
    assetName: string;
  },
  candidate: ParsedFinancialStatementCandidate | null
): ParsedFinancialStatement | null {
  if (!candidate || countPopulatedMetrics(candidate) < 3) return null;

  const normalized = input.extractedText.replace(/\s+/g, ' ').trim();
  const statementBase = {
    counterpartyName:
      candidate.counterpartyName?.trim() ||
      inferCounterpartyName(input.title, normalized, input.assetName),
    counterpartyRole:
      candidate.counterpartyRole?.trim() || inferCounterpartyRole(`${input.title} ${normalized}`),
    statementType: candidate.statementType?.trim() || 'ANNUAL',
    fiscalYear: candidate.fiscalYear ?? extractFiscalYear(normalized, input.title),
    fiscalPeriod: candidate.fiscalPeriod?.trim() || 'FY',
    currency: candidate.currency?.trim() || (/usd/i.test(normalized) ? 'USD' : 'KRW'),
    revenueKrw: candidate.revenueKrw ?? null,
    ebitdaKrw: candidate.ebitdaKrw ?? null,
    cashKrw: candidate.cashKrw ?? null,
    operatingCashFlowKrw: candidate.operatingCashFlowKrw ?? null,
    capexKrw: candidate.capexKrw ?? null,
    totalDebtKrw: candidate.totalDebtKrw ?? null,
    currentAssetsKrw: candidate.currentAssetsKrw ?? null,
    currentLiabilitiesKrw: candidate.currentLiabilitiesKrw ?? null,
    currentDebtMaturitiesKrw: candidate.currentDebtMaturitiesKrw ?? null,
    totalAssetsKrw: candidate.totalAssetsKrw ?? null,
    totalEquityKrw: candidate.totalEquityKrw ?? null,
    interestExpenseKrw: candidate.interestExpenseKrw ?? null
  };

  const lineItems = dedupeLineItems([
    ...(candidate.lineItems ?? []).filter(
      (lineItem) => lineItem.valueKrw !== null && Number.isFinite(lineItem.valueKrw)
    ),
    ...buildLineItems(statementBase)
  ]);

  return {
    ...statementBase,
    lineItems
  };
}

function extractFinancialValue(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1] ? parseNumericToken(match[1]) : null;
    if (value !== null) return value;
  }

  return null;
}

function inferCounterpartyRole(text: string) {
  if (/tenant/i.test(text)) return 'TENANT';
  if (/lender|bank|facility/i.test(text)) return 'LENDER';
  if (/operator/i.test(text)) return 'OPERATOR';
  if (/sponsor|owner|developer/i.test(text)) return 'SPONSOR';
  return 'COUNTERPARTY';
}

function inferCounterpartyName(title: string, extractedText: string, assetName: string) {
  const explicitMatch =
    extractedText.match(
      /(?:company|issuer|sponsor|borrower|tenant|operator)\s*:\s*([A-Za-z0-9&(),'`\-\s]{3,80}?)(?:[.;]|$)/i
    ) ?? title.match(/^(.+?)\s+(?:fy\d{4}|financial|statements|accounts)/i);

  const candidate = explicitMatch?.[1]?.trim();
  if (candidate && candidate.toLowerCase() !== assetName.toLowerCase()) {
    return candidate;
  }

  return title.replace(/\s+(fy\d{4}|financial.*|accounts.*)$/i, '').trim();
}

function extractFiscalYear(text: string, title: string) {
  const yearMatch =
    text.match(/\b(?:fy|fiscal year|year ended)\s*(20\d{2})\b/i) ?? title.match(/\b(20\d{2})\b/);
  return yearMatch?.[1] ? Number(yearMatch[1]) : null;
}

function buildLineItems(
  statement: Omit<ParsedFinancialStatement, 'lineItems'>
): StatementLineItem[] {
  const items: StatementLineItem[] = [];
  const definitions: Array<[StatementLineItem['lineKey'], string, number | null]> = [
    ['revenueKrw', 'Revenue', statement.revenueKrw],
    ['ebitdaKrw', 'EBITDA', statement.ebitdaKrw],
    ['cashKrw', 'Cash', statement.cashKrw],
    ['operatingCashFlowKrw', 'Operating Cash Flow', statement.operatingCashFlowKrw],
    ['capexKrw', 'Capex', statement.capexKrw],
    ['totalDebtKrw', 'Total Debt', statement.totalDebtKrw],
    ['currentAssetsKrw', 'Current Assets', statement.currentAssetsKrw],
    ['currentLiabilitiesKrw', 'Current Liabilities', statement.currentLiabilitiesKrw],
    ['currentDebtMaturitiesKrw', 'Current Debt Maturities', statement.currentDebtMaturitiesKrw],
    ['totalAssetsKrw', 'Total Assets', statement.totalAssetsKrw],
    ['totalEquityKrw', 'Total Equity', statement.totalEquityKrw],
    ['interestExpenseKrw', 'Interest Expense', statement.interestExpenseKrw]
  ];

  for (const [lineKey, lineLabel, value] of definitions) {
    if (value === null || value === undefined) continue;
    items.push({
      lineKey,
      lineLabel,
      valueKrw: value
    });
  }

  return items;
}

function buildHeuristicCandidate(input: {
  title: string;
  extractedText: string;
  assetName: string;
}): ParsedFinancialStatementCandidate | null {
  const normalized = input.extractedText.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;

  const candidateLineItems = collectCandidateLineItems(input.extractedText);
  const revenueKrw =
    findLineItemValue(candidateLineItems, ['revenue', 'sales', 'rental revenue']) ??
    extractFinancialValue(
      normalized,
      [/(?:revenue|sales)[^\d]{0,24}(?:krw|usd)?\s*([\d,]+(?:\.\d+)?)/i].map(
        (pattern) => new RegExp(pattern.source, pattern.flags)
      )
    );
  const ebitdaKrw =
    findLineItemValue(candidateLineItems, ['ebitda']) ??
    extractFinancialValue(normalized, [/ebitda[^\d]{0,24}(?:krw|usd)?\s*([\d,]+(?:\.\d+)?)/i]);
  const cashKrw =
    findLineItemValue(candidateLineItems, ['cash and cash equivalents', 'cash balance', 'cash']) ??
    extractFinancialValue(normalized, [
      /(?:cash(?: and equivalents)?|cash balance)[^\d]{0,24}(?:krw|usd)?\s*([\d,]+(?:\.\d+)?)/i
    ]);
  const operatingCashFlowKrw =
    findLineItemValue(candidateLineItems, [
      'operating cash flow',
      'cash flow from operations',
      'net cash from operating activities'
    ]) ??
    extractFinancialValue(normalized, [
      /(?:operating cash flow|cash flow from operations|net cash from operating activities)[^\d]{0,24}(?:krw|usd)?\s*([\d,]+(?:\.\d+)?)/i
    ]);
  const capexKrw =
    findLineItemValue(candidateLineItems, [
      'capital expenditures',
      'capital expenditure',
      'capex'
    ]) ??
    extractFinancialValue(normalized, [
      /(?:capital expenditures|capital expenditure|capex)[^\d]{0,24}(?:krw|usd)?\s*([\d,]+(?:\.\d+)?)/i
    ]);
  const totalDebtKrw =
    findLineItemValue(candidateLineItems, ['total debt', 'borrowings', 'debt'], ['cash']) ??
    extractFinancialValue(normalized, [
      /(?:total debt|net debt|borrowings)[^\d]{0,24}(?:krw|usd)?\s*([\d,]+(?:\.\d+)?)/i
    ]);
  const currentAssetsKrw =
    findLineItemValue(candidateLineItems, ['current assets']) ??
    extractFinancialValue(normalized, [
      /(?:current assets)[^\d]{0,24}(?:krw|usd)?\s*([\d,]+(?:\.\d+)?)/i
    ]);
  const currentLiabilitiesKrw =
    findLineItemValue(candidateLineItems, ['current liabilities']) ??
    extractFinancialValue(normalized, [
      /(?:current liabilities)[^\d]{0,24}(?:krw|usd)?\s*([\d,]+(?:\.\d+)?)/i
    ]);
  const currentDebtMaturitiesKrw =
    findLineItemValue(candidateLineItems, [
      'current debt maturities',
      'current maturities',
      'debt due within one year',
      'short-term debt',
      'short term debt'
    ]) ??
    extractFinancialValue(normalized, [
      /(?:current maturities|debt due within one year|short[- ]term debt)[^\d]{0,24}(?:krw|usd)?\s*([\d,]+(?:\.\d+)?)/i
    ]);
  const totalAssetsKrw =
    findLineItemValue(candidateLineItems, ['total assets', 'assets']) ??
    extractFinancialValue(normalized, [
      /(?:total assets|assets)[^\d]{0,24}(?:krw|usd)?\s*([\d,]+(?:\.\d+)?)/i
    ]);
  const totalEquityKrw =
    findLineItemValue(candidateLineItems, ['total equity', "shareholders' equity", 'equity']) ??
    extractFinancialValue(normalized, [
      /(?:total equity|shareholders'? equity|equity)[^\d]{0,24}(?:krw|usd)?\s*([\d,]+(?:\.\d+)?)/i
    ]);
  const interestExpenseKrw =
    findLineItemValue(candidateLineItems, ['interest expense', 'finance cost', 'interest']) ??
    extractFinancialValue(normalized, [
      /(?:interest expense|finance cost)[^\d]{0,24}(?:krw|usd)?\s*([\d,]+(?:\.\d+)?)/i
    ]);

  const candidate: ParsedFinancialStatementCandidate = {
    counterpartyName: inferCounterpartyName(input.title, normalized, input.assetName),
    counterpartyRole: inferCounterpartyRole(`${input.title} ${normalized}`),
    statementType: 'ANNUAL',
    fiscalYear: extractFiscalYear(normalized, input.title),
    fiscalPeriod: 'FY',
    currency: /usd/i.test(normalized) ? 'USD' : 'KRW',
    revenueKrw,
    ebitdaKrw,
    cashKrw,
    operatingCashFlowKrw,
    capexKrw,
    totalDebtKrw,
    currentAssetsKrw,
    currentLiabilitiesKrw,
    currentDebtMaturitiesKrw,
    totalAssetsKrw,
    totalEquityKrw,
    interestExpenseKrw,
    lineItems: candidateLineItems
  };

  return countPopulatedMetrics(candidate) >= 3 ? candidate : null;
}

export function parseFinancialStatementFromText(input: {
  title: string;
  extractedText: string;
  assetName: string;
}): ParsedFinancialStatement | null {
  return finalizeParsedStatement(input, buildHeuristicCandidate(input));
}

export async function parseFinancialStatement(
  input: {
    title: string;
    extractedText: string;
    assetName: string;
  },
  deps?: { aiExtractor?: typeof extractFinancialStatementWithAi }
) {
  const heuristic = buildHeuristicCandidate(input);
  const aiExtractor = deps?.aiExtractor ?? extractFinancialStatementWithAi;
  const aiCandidate = await aiExtractor(input);
  return finalizeParsedStatement(input, mergeStatementCandidates(heuristic, aiCandidate));
}

export function buildCreditAssessmentFromStatement(statement: ParsedFinancialStatement) {
  const leverageMultiple =
    statement.totalDebtKrw !== null && statement.ebitdaKrw && statement.ebitdaKrw > 0
      ? Number((statement.totalDebtKrw / statement.ebitdaKrw).toFixed(2))
      : null;
  const debtToEquityRatio =
    statement.totalDebtKrw !== null && statement.totalEquityKrw && statement.totalEquityKrw > 0
      ? Number((statement.totalDebtKrw / statement.totalEquityKrw).toFixed(2))
      : null;
  const interestCoverage =
    statement.ebitdaKrw !== null && statement.interestExpenseKrw && statement.interestExpenseKrw > 0
      ? Number((statement.ebitdaKrw / statement.interestExpenseKrw).toFixed(2))
      : null;
  const cashToDebtRatio =
    statement.cashKrw !== null && statement.totalDebtKrw && statement.totalDebtKrw > 0
      ? Number((statement.cashKrw / statement.totalDebtKrw).toFixed(2))
      : null;
  const currentRatio =
    statement.currentAssetsKrw !== null &&
    statement.currentLiabilitiesKrw &&
    statement.currentLiabilitiesKrw > 0
      ? Number((statement.currentAssetsKrw / statement.currentLiabilitiesKrw).toFixed(2))
      : null;
  const workingCapitalKrw =
    statement.currentAssetsKrw !== null && statement.currentLiabilitiesKrw !== null
      ? statement.currentAssetsKrw - statement.currentLiabilitiesKrw
      : null;
  const operatingCashFlowToDebtRatio =
    statement.operatingCashFlowKrw !== null && statement.totalDebtKrw && statement.totalDebtKrw > 0
      ? Number((statement.operatingCashFlowKrw / statement.totalDebtKrw).toFixed(2))
      : null;
  const currentMaturityCoverage =
    statement.currentDebtMaturitiesKrw !== null &&
    statement.currentDebtMaturitiesKrw > 0 &&
    (statement.cashKrw !== null || statement.operatingCashFlowKrw !== null)
      ? Number(
          (
            ((statement.cashKrw ?? 0) + Math.max(statement.operatingCashFlowKrw ?? 0, 0)) /
            statement.currentDebtMaturitiesKrw
          ).toFixed(2)
        )
      : null;

  const metrics: CreditMetrics = {
    leverageMultiple,
    debtToEquityRatio,
    interestCoverage,
    cashToDebtRatio,
    currentRatio,
    workingCapitalKrw,
    operatingCashFlowToDebtRatio,
    currentMaturityCoverage
  };

  let score = 70;
  if (leverageMultiple !== null) {
    if (leverageMultiple > 6) score -= 24;
    else if (leverageMultiple > 4.5) score -= 14;
    else if (leverageMultiple < 3) score += 6;
  }
  if (interestCoverage !== null) {
    if (interestCoverage < 1.5) score -= 22;
    else if (interestCoverage < 2.5) score -= 10;
    else if (interestCoverage > 4) score += 7;
  }
  if (cashToDebtRatio !== null) {
    if (cashToDebtRatio < 0.1) score -= 10;
    else if (cashToDebtRatio > 0.3) score += 5;
  }
  if (debtToEquityRatio !== null) {
    if (debtToEquityRatio > 2.5) score -= 12;
    else if (debtToEquityRatio < 1.2) score += 4;
  }
  if (currentRatio !== null) {
    if (currentRatio < 1) score -= 12;
    else if (currentRatio < 1.25) score -= 6;
    else if (currentRatio > 1.6) score += 4;
  }
  if (operatingCashFlowToDebtRatio !== null) {
    if (operatingCashFlowToDebtRatio < 0.08) score -= 12;
    else if (operatingCashFlowToDebtRatio > 0.2) score += 5;
  }
  if (currentMaturityCoverage !== null) {
    if (currentMaturityCoverage < 1) score -= 14;
    else if (currentMaturityCoverage > 1.5) score += 5;
  }
  if (workingCapitalKrw !== null && workingCapitalKrw < 0) {
    score -= 8;
  }
  if (statement.totalEquityKrw !== null && statement.totalEquityKrw <= 0) {
    score -= 18;
  }

  score = Math.max(25, Math.min(92, score));
  const riskLevel = score >= 76 ? 'LOW' : score >= 58 ? 'MODERATE' : 'HIGH';
  const summaryParts = [
    `${statement.counterpartyName} ${statement.counterpartyRole.toLowerCase()} credit screens ${riskLevel.toLowerCase()}.`,
    leverageMultiple !== null ? `Leverage ${leverageMultiple}x.` : null,
    interestCoverage !== null ? `Interest coverage ${interestCoverage}x.` : null,
    cashToDebtRatio !== null ? `Cash to debt ${cashToDebtRatio}x.` : null,
    currentRatio !== null ? `Current ratio ${currentRatio}x.` : null,
    currentMaturityCoverage !== null
      ? `Near-term maturity coverage ${currentMaturityCoverage}x.`
      : null
  ].filter(Boolean);

  return {
    score,
    riskLevel,
    summary: summaryParts.join(' '),
    metrics
  };
}

export async function ingestFinancialStatement(
  input: {
    assetId: string;
    documentVersionId?: string | null;
    title: string;
    extractedText: string;
    assetName: string;
  },
  deps?: {
    db?: FinancialStatementDb;
    aiExtractor?: typeof extractFinancialStatementWithAi;
  }
) {
  const db = (deps?.db ?? prisma) as FinancialStatementDb;
  const parsed = await parseFinancialStatement(input, {
    aiExtractor: deps?.aiExtractor ?? extractFinancialStatementWithAi
  });
  if (!parsed) return null;

  const existingCounterparty = await db.counterparty.findFirst({
    where: {
      assetId: input.assetId,
      name: parsed.counterpartyName,
      role: parsed.counterpartyRole
    }
  });

  const counterparty = existingCounterparty
    ? await db.counterparty.update({
        where: { id: existingCounterparty.id },
        data: {
          shortName: parsed.counterpartyName.slice(0, 48)
        }
      })
    : await db.counterparty.create({
        data: {
          assetId: input.assetId,
          name: parsed.counterpartyName,
          role: parsed.counterpartyRole,
          shortName: parsed.counterpartyName.slice(0, 48)
        }
      });

  // Provenance: ingestion through this path is always from a document we
  // extracted (UPLOAD) or a manual entry (no documentVersionId).
  // sourceCurrency is captured separately from the display `currency`
  // column so a USD-filed statement keeps its filing currency on record
  // even after we convert into KRW for storage. fxRateToKrw / fxAsOf
  // remain null until the AI parser exposes the rate it used; the columns
  // exist so future parser improvements can pin the snapshot without
  // another schema change.
  const sourceCurrency = parsed.currency && parsed.currency !== 'KRW' ? parsed.currency : null;
  const statement = await db.financialStatement.create({
    data: {
      assetId: input.assetId,
      counterpartyId: counterparty.id,
      documentVersionId: input.documentVersionId ?? null,
      statementType: parsed.statementType,
      fiscalYear: parsed.fiscalYear,
      fiscalPeriod: parsed.fiscalPeriod,
      currency: parsed.currency,
      sourceCurrency,
      provenanceSystem: input.documentVersionId ? 'UPLOAD' : 'MANUAL',
      revenueKrw: parsed.revenueKrw,
      ebitdaKrw: parsed.ebitdaKrw,
      cashKrw: parsed.cashKrw,
      totalDebtKrw: parsed.totalDebtKrw,
      totalAssetsKrw: parsed.totalAssetsKrw,
      totalEquityKrw: parsed.totalEquityKrw,
      interestExpenseKrw: parsed.interestExpenseKrw
    }
  });

  for (const lineItem of parsed.lineItems) {
    await db.financialLineItem.create({
      data: {
        financialStatementId: statement.id,
        lineKey: lineItem.lineKey,
        lineLabel: lineItem.lineLabel,
        valueKrw: lineItem.valueKrw
      }
    });
  }

  const assessment = buildCreditAssessmentFromStatement(parsed);

  const creditAssessment = await db.creditAssessment.create({
    data: {
      assetId: input.assetId,
      counterpartyId: counterparty.id,
      financialStatementId: statement.id,
      documentVersionId: input.documentVersionId ?? null,
      assessmentType: `${parsed.counterpartyRole}_CREDIT`,
      score: assessment.score,
      riskLevel: assessment.riskLevel,
      summary: assessment.summary,
      metrics: assessment.metrics as Prisma.InputJsonValue
    }
  });

  return {
    counterpartyId: counterparty.id,
    financialStatementId: statement.id,
    creditAssessmentId: creditAssessment.id,
    score: assessment.score,
    riskLevel: assessment.riskLevel
  };
}
