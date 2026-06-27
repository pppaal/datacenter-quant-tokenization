import { formatCurrencyFromKrwAtRate } from '@/lib/finance/currency';
import { pickBaseScenario } from '@/lib/services/valuation/scenario-utils';
import {
  type AssetBundle,
  type ChecklistStatus,
  type DealReportBundle,
  type DocumentTopic,
  type ReportDocumentTrace,
  type ReportFactTone
} from './types';

export function getReportStatusLabel(status: 'production-ready' | 'partial') {
  return status === 'production-ready' ? 'Production Ready' : 'Partial';
}

export function shortHash(hash?: string | null, length = 12) {
  if (!hash) return 'N/A';
  return hash.slice(0, length);
}

export function takeSentences(value: string | null | undefined, count = 2) {
  if (!value) return '';
  const sentences = value
    .split(/(?<=[.!?])\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return sentences.slice(0, count).join(' ');
}

export function resolveBaseScenario(run: AssetBundle['valuations'][number] | undefined) {
  if (!run) return null;
  // Use the canonical picker (named "Base", else lowest scenarioOrder) so the
  // IC/risk memos read the SAME base scenario every other screen shows. The
  // previous positional `scenarios[1]` fallback silently read whichever
  // scenario happened to be second for runs not literally named "Base".
  return pickBaseScenario(run.scenarios) ?? null;
}

export function inferSeverityTone(risk: string): ReportFactTone {
  const lower = risk.toLowerCase();
  if (
    lower.includes('title') ||
    lower.includes('encumbr') ||
    lower.includes('permit') ||
    lower.includes('power approval') ||
    lower.includes('critical') ||
    lower.includes('liquidity') ||
    lower.includes('dscr')
  ) {
    return 'danger';
  }
  if (
    lower.includes('rollover') ||
    lower.includes('vacancy') ||
    lower.includes('comparable') ||
    lower.includes('debt')
  ) {
    return 'warn';
  }
  return 'neutral';
}

export function inferDocumentTopic(
  document: Pick<ReportDocumentTrace, 'title' | 'documentType' | 'summary'>
): DocumentTopic {
  const explicitType = document.documentType.toUpperCase().replace(/\s+/g, '_');
  if (['POWER_STUDY', 'PERMIT', 'GRID_NOTICE', 'SITE_PHOTO'].includes(explicitType))
    return 'technical';
  if (['LEASE', 'MODEL'].includes(explicitType)) return 'financial';
  if (explicitType === 'IM') return 'market';

  const label =
    `${document.documentType} ${document.title} ${document.summary ?? ''}`.toLowerCase();
  if (/(title|deed|mortgage|encumbr|ownership|register|legal|lien|release)/.test(label))
    return 'legal';
  if (
    /(permit|power|utility|survey|phase|engineering|environment|technical|condition|grid)/.test(
      label
    )
  )
    return 'technical';
  if (
    /(rent roll|lease|financial|operating|cash flow|budget|capex|debt|term sheet|model|underwriting)/.test(
      label
    )
  )
    return 'financial';
  if (/(market|valuation|appraisal|comparable|broker|teaser|im|investment memo)/.test(label))
    return 'market';
  return 'general';
}

export function buildChecklistStatus({
  ready,
  partial
}: {
  ready: boolean;
  partial?: boolean;
}): ChecklistStatus {
  if (ready) return 'complete';
  if (partial) return 'partial';
  return 'open';
}

export function formatSourceTag(document: ReportDocumentTrace) {
  return `${document.title} v${document.currentVersion}`;
}

export function pickSupportingDocuments(documents: ReportDocumentTrace[], text: string, limit = 2) {
  const lower = text.toLowerCase();
  const legalPatterns = [/(title|mortgage|encumbr|legal|lien|ownership|release)/];
  const technicalPatterns = [
    /(permit|power|utility|engineering|survey|environment|interconnection)/
  ];
  const financialPatterns = [
    /(lease|rent|revenue|occupancy|noi|cash flow|debt|dscr|term sheet|refi)/
  ];
  const marketPatterns = [/(market|comparable|pricing|broker|cap rate|yield)/];

  let requestedTopic: DocumentTopic = 'general';
  if (legalPatterns.some((pattern) => pattern.test(lower))) requestedTopic = 'legal';
  else if (technicalPatterns.some((pattern) => pattern.test(lower))) requestedTopic = 'technical';
  else if (financialPatterns.some((pattern) => pattern.test(lower))) requestedTopic = 'financial';
  else if (marketPatterns.some((pattern) => pattern.test(lower))) requestedTopic = 'market';

  const scored = documents
    .map((document) => {
      const topic = inferDocumentTopic(document);
      const textBlob =
        `${document.title} ${document.documentType} ${document.summary ?? ''}`.toLowerCase();
      let score = 0;

      if (topic === requestedTopic) score += 10;
      if (requestedTopic === 'general' && topic !== 'general') score += 2;
      if (textBlob.includes(lower)) score += 6;
      if (requestedTopic === 'legal' && document.anchoredTxHash) score += 2;
      if (document.sourceLink) score += 1;
      score += Math.max(
        0,
        5 - Math.floor((Date.now() - document.updatedAt.getTime()) / (1000 * 60 * 60 * 24 * 30))
      );

      return { document, score };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.document.updatedAt.getTime() - left.document.updatedAt.getTime()
    );

  return scored.slice(0, limit).map((entry) => formatSourceTag(entry.document));
}

export function formatKrw(bundle: DealReportBundle, amountKrw: number | null | undefined) {
  return formatCurrencyFromKrwAtRate(amountKrw, bundle.displayCurrency, bundle.fxRateToKrw);
}
