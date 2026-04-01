import crypto from 'node:crypto';
import { AssetClass, type ReadinessStatus } from '@prisma/client';
import { formatCurrencyFromKrwAtRate, resolveDisplayCurrency, type SupportedCurrency } from '@/lib/finance/currency';
import { getAssetById } from '@/lib/services/assets';
import { getFxRateMap } from '@/lib/services/fx';
import { readStoredBaseCaseProForma } from '@/lib/services/valuation/pro-forma';
import {
  buildAssetEvidenceReviewSummary,
  extractReviewPacketSummary,
  getLatestReviewPacketRecord,
  type AssetEvidenceReviewSummary
} from '@/lib/services/review';
import type { ProFormaBaseCase } from '@/lib/services/valuation/types';
import { formatDate, formatNumber, formatPercent, slugify, toSentenceCase } from '@/lib/utils';
import { buildValuationQualitySummary, type ValuationQualitySummary } from '@/lib/valuation-quality';

export const reportKinds = ['teaser', 'ic-memo', 'dd-checklist', 'risk-memo'] as const;

export type ReportKind = (typeof reportKinds)[number];
export type ReportAudience = 'operator' | 'investor';
export type ReportTemplateStatus = 'production-ready' | 'partial';

type AssetBundle = NonNullable<Awaited<ReturnType<typeof getAssetById>>>;
type DocumentTopic = 'legal' | 'technical' | 'financial' | 'market' | 'general';

type ProvenanceEntry = {
  field: string;
  sourceSystem: string;
  value: unknown;
  mode: string;
  freshnessLabel: string;
};

type ReportFactTone = 'neutral' | 'good' | 'warn' | 'danger';
type ChecklistStatus = 'complete' | 'partial' | 'open';

export type ReportFact = {
  label: string;
  value: string;
  detail?: string;
  tone?: ReportFactTone;
};

export type ReportChecklistItem = {
  label: string;
  detail: string;
  status: ChecklistStatus;
  sources?: string[];
};

export type ReportSection = {
  id: string;
  title: string;
  kicker?: string;
  body?: string[];
  facts?: ReportFact[];
  bullets?: string[];
  checklist?: ReportChecklistItem[];
};

export type ReportDocumentTrace = {
  id: string;
  title: string;
  documentType: string;
  currentVersion: number;
  updatedAt: Date;
  hash: string | null;
  summary: string | null;
  sourceLink: string | null;
  storagePath: string | null;
  anchoredTxHash: string | null;
  chainId: string | null;
  anchorStatus: ReadinessStatus | null;
};

export type ReportTemplateMeta = {
  kind: ReportKind;
  title: string;
  shortLabel: string;
  audience: ReportAudience;
  description: string;
  status: ReportTemplateStatus;
  notes: string;
};

export type DealReportBundle = {
  assetId: string;
  assetCode: string;
  assetSlug: string;
  assetName: string;
  assetDescription: string;
  assetClass: AssetClass;
  assetClassLabel: string;
  market: string;
  stage: string;
  status: string;
  ownerName: string | null;
  sponsorName: string | null;
  developmentSummary: string | null;
  locationLabel: string;
  sizeLabel: string;
  sizeValue: string;
  displayCurrency: SupportedCurrency;
  fxRateToKrw: number | null;
  counts: {
    documents: number;
    leases: number;
    comparables: number;
    capexLines: number;
    debtFacilities: number;
    ownershipRecords: number;
    encumbrances: number;
    planningConstraints: number;
    anchoredDocuments: number;
  };
  latestValuation: null | {
    id: string;
    runLabel: string;
    createdAt: Date;
    engineVersion: string;
    confidenceScore: number;
    baseCaseValueKrw: number;
    underwritingMemo: string;
    keyRisks: string[];
    ddChecklist: string[];
    assumptions: unknown;
    provenance: ProvenanceEntry[];
    baseScenario: {
      valuationKrw: number | null;
      impliedYieldPct: number | null;
      exitCapRatePct: number | null;
      debtServiceCoverage: number | null;
    } | null;
    bullScenarioValueKrw: number | null;
    bearScenarioValueKrw: number | null;
  };
  proForma: ProFormaBaseCase | null;
  valuationQuality: ValuationQualitySummary | null;
  reviewSummary: AssetEvidenceReviewSummary;
  documents: ReportDocumentTrace[];
  latestOnchainRecord: null | {
    txHash: string | null;
    chainId: string | null;
    anchoredAt: Date | null;
    status: ReadinessStatus;
    recordType: string;
  };
  latestReviewPacket: null | {
    fingerprint: string | null;
    stagedAt: Date | null;
    latestValuationId: string | null;
    latestDocumentHash: string | null;
    approvedEvidenceCount: number | null;
    pendingEvidenceCount: number | null;
    anchorReference: string | null;
  };
  reportFingerprint: string;
  generatedAt: Date;
};

export type DealReport = {
  kind: ReportKind;
  title: string;
  shortLabel: string;
  audience: ReportAudience;
  audienceLabel: string;
  status: ReportTemplateStatus;
  statusLabel: string;
  description: string;
  distributionNotice: string;
  footerNotice: string;
  generatedAt: Date;
  generatedAtLabel: string;
  versionLabel: string;
  exportFileBase: string;
  heroSummary: string;
  heroFacts: ReportFact[];
  sections: ReportSection[];
  documents: ReportDocumentTrace[];
  traceability: ReportFact[];
  controlSheet: ReportFact[];
  readinessNotes: string[];
};

export type ReportPacketAudience = 'investor' | 'operator';

export type DealReportPacket = {
  audience: ReportPacketAudience;
  title: string;
  description: string;
  generatedAt: Date;
  generatedAtLabel: string;
  exportFileBase: string;
  versionLabel: string;
  reports: DealReport[];
};

const reportTemplateMeta: Record<ReportKind, ReportTemplateMeta> = {
  teaser: {
    kind: 'teaser',
    title: 'One-Page Teaser',
    shortLabel: 'Teaser',
    audience: 'investor',
    description: 'A one-page external summary for a small private distressed real estate process.',
    status: 'production-ready',
    notes: 'Ready for operator-led outreach and PDF export; narrative stays deterministic and data-backed.'
  },
  'ic-memo': {
    kind: 'ic-memo',
    title: 'IC Memo',
    shortLabel: 'IC Memo',
    audience: 'operator',
    description: 'Internal investment committee package using the current valuation and diligence set.',
    status: 'production-ready',
    notes: 'Ready as an internal draft memo; final committee sign-off should still include human edits.'
  },
  'dd-checklist': {
    kind: 'dd-checklist',
    title: 'DD Checklist',
    shortLabel: 'DD Checklist',
    audience: 'operator',
    description: 'Operator-facing diligence coverage summary with open, partial, and complete items.',
    status: 'partial',
    notes: 'Checklist grouping is practical and exportable, but status inference is still heuristic.'
  },
  'risk-memo': {
    kind: 'risk-memo',
    title: 'Risk Memo',
    shortLabel: 'Risk Memo',
    audience: 'operator',
    description: 'Internal risk note focused on downside drivers, mitigants, and document support.',
    status: 'partial',
    notes: 'Useful for deal review; severity and mitigation language remains template-derived from current data.'
  }
};

function getRecommendation(confidenceScore?: number | null) {
  if ((confidenceScore ?? 0) >= 75) return 'Proceed To Committee';
  if ((confidenceScore ?? 0) >= 55) return 'Proceed With Conditions';
  return 'Further Diligence Required';
}

function getReportStatusLabel(status: ReportTemplateStatus) {
  return status === 'production-ready' ? 'Production Ready' : 'Partial';
}

function shortHash(hash?: string | null, length = 12) {
  if (!hash) return 'N/A';
  return hash.slice(0, length);
}

function takeSentences(value: string | null | undefined, count = 2) {
  if (!value) return '';
  const sentences = value
    .split(/(?<=[.!?])\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return sentences.slice(0, count).join(' ');
}

function resolveBaseScenario(run: AssetBundle['valuations'][number] | undefined) {
  if (!run) return null;
  return run.scenarios.find((scenario) => scenario.name.toLowerCase() === 'base') ?? run.scenarios[1] ?? null;
}

function inferSeverityTone(risk: string): ReportFactTone {
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
  if (lower.includes('rollover') || lower.includes('vacancy') || lower.includes('comparable') || lower.includes('debt')) {
    return 'warn';
  }
  return 'neutral';
}

function inferDocumentTopic(document: Pick<ReportDocumentTrace, 'title' | 'documentType' | 'summary'>): DocumentTopic {
  const explicitType = document.documentType.toUpperCase().replace(/\s+/g, '_');
  if (['POWER_STUDY', 'PERMIT', 'GRID_NOTICE', 'SITE_PHOTO'].includes(explicitType)) return 'technical';
  if (['LEASE', 'MODEL'].includes(explicitType)) return 'financial';
  if (explicitType === 'IM') return 'market';

  const label = `${document.documentType} ${document.title} ${document.summary ?? ''}`.toLowerCase();
  if (/(title|deed|mortgage|encumbr|ownership|register|legal|lien|release)/.test(label)) return 'legal';
  if (/(permit|power|utility|survey|phase|engineering|environment|technical|condition|grid)/.test(label)) return 'technical';
  if (/(rent roll|lease|financial|operating|cash flow|budget|capex|debt|term sheet|model|underwriting)/.test(label)) return 'financial';
  if (/(market|valuation|appraisal|comparable|broker|teaser|im|investment memo)/.test(label)) return 'market';
  return 'general';
}

function buildChecklistStatus({ ready, partial }: { ready: boolean; partial?: boolean }): ChecklistStatus {
  if (ready) return 'complete';
  if (partial) return 'partial';
  return 'open';
}

function buildReportFingerprint(asset: AssetBundle) {
  const latestRun = asset.valuations[0];
  const fingerprintPayload = JSON.stringify({
    assetId: asset.id,
    updatedAt: asset.updatedAt.toISOString(),
    valuationId: latestRun?.id ?? null,
    valuationUpdatedAt: latestRun?.updatedAt.toISOString() ?? null,
    documents: asset.documents.map((document) => ({
      id: document.id,
      version: document.currentVersion,
      hash: document.documentHash
    })),
    review: {
      energy: asset.energySnapshot?.reviewStatus ?? null,
      permit: asset.permitSnapshot?.reviewStatus ?? null,
      ownership: asset.ownershipRecords.map((record) => ({ id: record.id, status: (record as { reviewStatus?: string | null }).reviewStatus ?? null })),
      encumbrance: asset.encumbranceRecords.map((record) => ({ id: record.id, status: (record as { reviewStatus?: string | null }).reviewStatus ?? null })),
      planning: asset.planningConstraints.map((record) => ({ id: record.id, status: (record as { reviewStatus?: string | null }).reviewStatus ?? null })),
      leases: asset.leases.map((lease) => ({ id: lease.id, status: (lease as { reviewStatus?: string | null }).reviewStatus ?? null }))
    },
    onchain: asset.readinessProject?.onchainRecords.map((record) => ({
      id: record.id,
      txHash: record.txHash,
      anchoredAt: record.anchoredAt?.toISOString() ?? null
    }))
  });
  return crypto.createHash('sha256').update(fingerprintPayload).digest('hex').slice(0, 10).toUpperCase();
}

function buildDocumentTrace(asset: AssetBundle): ReportDocumentTrace[] {
  const anchors = asset.readinessProject?.onchainRecords ?? [];
  const latestAnchorByDocumentId = new Map(
    anchors
      .filter((record) => record.documentId)
      .map((record) => [record.documentId as string, record])
  );

  return asset.documents.slice(0, 12).map((document) => {
    const latestVersion = document.versions[0];
    const anchor = latestAnchorByDocumentId.get(document.id);

    return {
      id: document.id,
      title: document.title,
      documentType: toSentenceCase(document.documentType),
      currentVersion: document.currentVersion,
      updatedAt: document.updatedAt,
      hash: latestVersion?.documentHash ?? document.documentHash ?? null,
      summary: latestVersion?.aiSummary ?? document.aiSummary ?? null,
      sourceLink: latestVersion?.sourceLink ?? document.sourceLink ?? null,
      storagePath: latestVersion?.storagePath ?? document.latestStoragePath ?? null,
      anchoredTxHash: anchor?.txHash ?? null,
      chainId: anchor?.chainId ?? null,
      anchorStatus: anchor?.status ?? null
    };
  });
}

function buildTraceabilityFacts(bundle: DealReportBundle, kind: ReportKind): ReportFact[] {
  const latestRun = bundle.latestValuation;
  const latestDoc = bundle.documents[0];
  return [
    {
      label: 'Report Version',
      value: `${kind.toUpperCase()}-${bundle.generatedAt.toISOString().slice(0, 10).replace(/-/g, '')}-${bundle.reportFingerprint}`,
      detail: 'Derived from the latest valuation, document versions, and anchor state.'
    },
    {
      label: 'Valuation Source',
      value: latestRun ? `${latestRun.runLabel} / ${formatDate(latestRun.createdAt)}` : 'No valuation run',
      detail: latestRun ? `Run ${latestRun.id} / Engine ${latestRun.engineVersion}` : 'Generate a valuation run to tighten the memo package.'
    },
    {
      label: 'Latest Document',
      value: latestDoc ? `${latestDoc.title} v${latestDoc.currentVersion}` : 'No documents uploaded',
      detail: latestDoc ? `Hash ${shortHash(latestDoc.hash)}` : 'Document schedule is empty.'
    },
    {
      label: 'Approved Evidence',
      value: String(bundle.reviewSummary.totals.approved),
      detail:
        bundle.reviewSummary.totals.pending > 0
          ? `${bundle.reviewSummary.totals.pending} pending / ${bundle.reviewSummary.totals.rejected} rejected`
          : 'No pending evidence blockers in the normalized review queue.'
    },
    {
      label: 'Review Packet',
      value: bundle.latestReviewPacket?.fingerprint ? shortHash(bundle.latestReviewPacket.fingerprint, 16) : 'Not staged',
      detail: bundle.latestReviewPacket?.stagedAt
        ? `Staged ${formatDate(bundle.latestReviewPacket.stagedAt)} / valuation ${bundle.latestReviewPacket.latestValuationId ?? 'none'}`
        : 'Stage readiness to lock the current approved evidence set into a deterministic packet.'
    },
    {
      label: 'On-Chain Integrity',
      value: bundle.latestOnchainRecord?.txHash ? shortHash(bundle.latestOnchainRecord.txHash) : 'Not anchored',
      detail: bundle.latestOnchainRecord?.txHash
        ? `${bundle.latestOnchainRecord.chainId ?? 'Unknown chain'} / ${formatDate(bundle.latestOnchainRecord.anchoredAt)}`
        : 'No blockchain anchor linked to the current document set.'
    }
  ];
}

function formatSourceTag(document: ReportDocumentTrace) {
  return `${document.title} v${document.currentVersion}`;
}

function pickSupportingDocuments(documents: ReportDocumentTrace[], text: string, limit = 2) {
  const lower = text.toLowerCase();
  const legalPatterns = [/(title|mortgage|encumbr|legal|lien|ownership|release)/];
  const technicalPatterns = [/(permit|power|utility|engineering|survey|environment|interconnection)/];
  const financialPatterns = [/(lease|rent|revenue|occupancy|noi|cash flow|debt|dscr|term sheet|refi)/];
  const marketPatterns = [/(market|comparable|pricing|broker|cap rate|yield)/];

  let requestedTopic: DocumentTopic = 'general';
  if (legalPatterns.some((pattern) => pattern.test(lower))) requestedTopic = 'legal';
  else if (technicalPatterns.some((pattern) => pattern.test(lower))) requestedTopic = 'technical';
  else if (financialPatterns.some((pattern) => pattern.test(lower))) requestedTopic = 'financial';
  else if (marketPatterns.some((pattern) => pattern.test(lower))) requestedTopic = 'market';

  const scored = documents
    .map((document) => {
      const topic = inferDocumentTopic(document);
      const textBlob = `${document.title} ${document.documentType} ${document.summary ?? ''}`.toLowerCase();
      let score = 0;

      if (topic === requestedTopic) score += 10;
      if (requestedTopic === 'general' && topic !== 'general') score += 2;
      if (textBlob.includes(lower)) score += 6;
      if (requestedTopic === 'legal' && document.anchoredTxHash) score += 2;
      if (document.sourceLink) score += 1;
      score += Math.max(0, 5 - Math.floor((Date.now() - document.updatedAt.getTime()) / (1000 * 60 * 60 * 24 * 30)));

      return { document, score };
    })
    .sort((left, right) => right.score - left.score || right.document.updatedAt.getTime() - left.document.updatedAt.getTime());

  return scored.slice(0, limit).map((entry) => formatSourceTag(entry.document));
}

function buildControlSheet(bundle: DealReportBundle, reportVersion: string): ReportFact[] {
  const latestRun = bundle.latestValuation;
  const latestDoc = bundle.documents[0];
  return [
    {
      label: 'Report Id',
      value: reportVersion
    },
    {
      label: 'Asset Code',
      value: bundle.assetCode
    },
    {
      label: 'Valuation Run Id',
      value: latestRun?.id ?? 'N/A',
      detail: latestRun ? `${latestRun.runLabel} / ${formatDate(latestRun.createdAt)}` : 'No valuation run linked'
    },
    {
      label: 'Approved / Pending Evidence',
      value: `${bundle.reviewSummary.totals.approved} / ${bundle.reviewSummary.totals.pending}`,
      detail: `${bundle.reviewSummary.totals.rejected} rejected evidence row(s)`
    },
    {
      label: 'Document Count',
      value: String(bundle.counts.documents)
    },
    {
      label: 'Latest Document Hash',
      value: latestDoc?.hash ? shortHash(latestDoc.hash, 16) : 'N/A',
      detail: latestDoc ? `${latestDoc.title} v${latestDoc.currentVersion}` : 'No document schedule'
    },
    {
      label: 'Anchor Reference',
      value: bundle.latestOnchainRecord?.txHash ? shortHash(bundle.latestOnchainRecord.txHash, 16) : 'Not anchored',
      detail: bundle.latestOnchainRecord?.chainId ?? 'No linked chain'
    },
    {
      label: 'Review Packet Fingerprint',
      value: bundle.latestReviewPacket?.fingerprint ? shortHash(bundle.latestReviewPacket.fingerprint, 16) : 'Not staged',
      detail: bundle.latestReviewPacket?.stagedAt
        ? `Staged ${formatDate(bundle.latestReviewPacket.stagedAt)}`
        : 'No deterministic review packet has been staged yet.'
    }
  ];
}

function formatKrw(bundle: DealReportBundle, amountKrw: number | null | undefined) {
  return formatCurrencyFromKrwAtRate(amountKrw, bundle.displayCurrency, bundle.fxRateToKrw);
}

function buildHeroFacts(bundle: DealReportBundle, kind: ReportKind): ReportFact[] {
  const latestRun = bundle.latestValuation;
  const baseScenario = latestRun?.baseScenario;
  const yearOne = bundle.proForma?.years[0];
  const recommendation = getRecommendation(latestRun?.confidenceScore);

  const facts: ReportFact[] = [
    {
      label: 'Recommendation',
      value: recommendation,
      tone:
        recommendation === 'Proceed To Committee'
          ? 'good'
          : recommendation === 'Proceed With Conditions'
            ? 'warn'
            : 'danger'
    },
    {
      label: 'Base Case Value',
      value: latestRun ? formatKrw(bundle, latestRun.baseCaseValueKrw) : 'N/A'
    },
    {
      label: 'Confidence',
      value: latestRun ? `${formatNumber(latestRun.confidenceScore, 1)} / 100` : 'N/A'
    },
    {
      label: 'Year 1 NOI',
      value: yearOne ? formatKrw(bundle, yearOne.noiKrw) : 'N/A'
    }
  ];

  if (kind !== 'teaser') {
    facts.push(
      {
        label: 'Base DSCR',
        value: baseScenario?.debtServiceCoverage ? `${formatNumber(baseScenario.debtServiceCoverage, 2)}x` : 'N/A',
        tone: (baseScenario?.debtServiceCoverage ?? 0) < 1.15 ? 'danger' : 'neutral'
      },
      {
        label: 'Anchored Docs',
        value: String(bundle.counts.anchoredDocuments)
      }
    );
  }

  return facts;
}

function buildHeroSummary(bundle: DealReportBundle, kind: ReportKind) {
  const latestRun = bundle.latestValuation;
  const underwritingLead = takeSentences(latestRun?.underwritingMemo, kind === 'teaser' ? 2 : 3);
  const baseText = takeSentences(bundle.assetDescription, 2);
  const qualityLead = bundle.valuationQuality
    ? `${bundle.valuationQuality.coverage.filter((item) => item.status === 'good').length} of ${
        bundle.valuationQuality.coverage.length
      } core diligence coverage lines are currently populated.`
    : 'Core diligence coverage has not been summarized yet.';
  return [underwritingLead, baseText, qualityLead].filter(Boolean).join(' ');
}

function buildDistributionNotice(kind: ReportKind) {
  switch (kind) {
    case 'teaser':
      return 'Confidential teaser for a limited private process. Subject to revision, withdrawal, and NDA-gated follow-up material.';
    case 'ic-memo':
      return 'Internal investment committee draft. Not for external circulation or reliance by third parties.';
    case 'dd-checklist':
      return 'Internal diligence working paper. Coverage status is derived from the current data room and underwriting bundle.';
    case 'risk-memo':
      return 'Internal downside note for deal team and committee use. Does not replace legal, tax, technical, or accounting advice.';
  }
}

function buildFooterNotice(kind: ReportKind) {
  switch (kind) {
    case 'teaser':
      return 'This teaser is indicative only and should not be treated as a binding offer, final memorandum, or complete diligence package.';
    case 'ic-memo':
      return 'Committee approval should remain conditional on final legal, technical, financing, and counterparty confirmation.';
    case 'dd-checklist':
      return 'Checklist completion reflects current system evidence only; operators should still confirm each item before sign-off.';
    case 'risk-memo':
      return 'Risk severity remains dynamic and should be refreshed whenever valuation, permit, legal, or debt inputs change.';
  }
}

function buildDistressContext(bundle: DealReportBundle) {
  const facts: string[] = [];
  const baseScenario = bundle.latestValuation?.baseScenario;
  const yearOne = bundle.proForma?.years[0];
  if ((baseScenario?.debtServiceCoverage ?? Infinity) < 1.15) {
    facts.push(
      `Base DSCR is ${formatNumber(baseScenario?.debtServiceCoverage, 2)}x, which puts financing resilience under pressure.`
    );
  }
  if ((yearOne?.activeRenewalLeaseCount ?? 0) > 0) {
    facts.push(
      `${yearOne?.activeRenewalLeaseCount} lease rollover event(s) are already modeled in the opening year cash flow.`
    );
  }
  if (bundle.counts.encumbrances > 0) {
    facts.push(`${bundle.counts.encumbrances} recorded encumbrance item(s) are attached to the asset legal pack.`);
  }
  if ((bundle.counts.debtFacilities ?? 0) > 0) {
    facts.push(`${bundle.counts.debtFacilities} debt facility record(s) are loaded into the current capital stack.`);
  }
  return facts;
}

function buildTeaserSections(bundle: DealReportBundle): ReportSection[] {
  const latestRun = bundle.latestValuation;
  const yearOne = bundle.proForma?.years[0];
  const proFormaSummary = bundle.proForma?.summary;
  const distressContext = buildDistressContext(bundle);

  return [
    {
      id: 'situation',
      kicker: 'Situation',
      title: 'Opportunity Frame',
      body: [
        takeSentences(bundle.assetDescription, 2) || 'Asset overview is still being captured.',
        bundle.developmentSummary
          ? takeSentences(bundle.developmentSummary, 2)
          : 'The current package is being positioned as a small private distressed real estate process rather than a broad marketed sale.'
      ].filter(Boolean),
      bullets: distressContext.length
        ? distressContext
        : ['Current leverage, legal, and permit data do not yet point to a single critical distress trigger.']
    },
    {
      id: 'snapshot',
      kicker: 'Snapshot',
      title: 'Asset And Pricing Snapshot',
      facts: [
        { label: 'Location', value: bundle.locationLabel },
        { label: bundle.sizeLabel, value: bundle.sizeValue },
        { label: 'Current Value', value: latestRun ? formatKrw(bundle, latestRun.baseCaseValueKrw) : 'N/A' },
        { label: 'Bull / Bear', value: `${formatKrw(bundle, latestRun?.bullScenarioValueKrw)} / ${formatKrw(bundle, latestRun?.bearScenarioValueKrw)}` },
        {
          label: 'Year 1 Revenue',
          value: yearOne ? formatKrw(bundle, yearOne.totalOperatingRevenueKrw) : 'N/A'
        },
        {
          label: 'Gross Exit Value',
          value: proFormaSummary ? formatKrw(bundle, proFormaSummary.grossExitValueKrw) : 'N/A'
        }
      ]
    },
    {
      id: 'materials',
      kicker: 'Materials',
      title: 'Data Room Excerpt',
      bullets:
        bundle.documents.slice(0, 5).map((document) => {
          const anchor = document.anchoredTxHash ? ` / anchored ${shortHash(document.anchoredTxHash)}` : '';
          return `${document.title} (${document.documentType}, v${document.currentVersion}, ${formatDate(document.updatedAt)}${anchor})`;
        }) || []
    },
    {
      id: 'process',
      kicker: 'Process',
      title: 'Current Process Position',
      bullets: [
        `Current stage is ${bundle.stage} with ${bundle.counts.documents} document(s) in the exported support pack.`,
        latestRun
          ? `Latest valuation draft is ${latestRun.runLabel} dated ${formatDate(latestRun.createdAt)}.`
          : 'No valuation draft is currently linked to this opportunity.',
        bundle.counts.anchoredDocuments > 0
          ? `${bundle.counts.anchoredDocuments} document(s) have an integrity anchor reference.`
          : 'No document integrity anchor is linked at this time.'
      ]
    },
    {
      id: 'risks',
      kicker: 'Key Flags',
      title: 'Primary Risks',
      bullets:
        latestRun?.keyRisks.slice(0, 5) ?? [
          'No risk memo has been generated yet. Run valuation and upload core diligence documents first.'
        ]
    }
  ];
}

function buildIcMemoSections(bundle: DealReportBundle): ReportSection[] {
  const latestRun = bundle.latestValuation;
  const yearOne = bundle.proForma?.years[0];
  const summary = bundle.proForma?.summary;
  const quality = bundle.valuationQuality;

  return [
    {
      id: 'transaction',
      kicker: 'Transaction Context',
      title: 'Why This Deal Is On The Table',
      body: [
        takeSentences(latestRun?.underwritingMemo, 3) || 'No current underwriting memo is available.',
        bundle.ownerName || bundle.sponsorName
          ? `Current counterparties in the package are ${[bundle.ownerName, bundle.sponsorName].filter(Boolean).join(' / ')}.`
          : 'Named owner and sponsor parties are still sparse in the current package.'
      ].filter(Boolean),
      bullets: buildDistressContext(bundle)
    },
    {
      id: 'valuation',
      kicker: 'Valuation',
      title: 'Underwriting And Downside Frame',
      facts: [
        { label: 'Base Case', value: latestRun ? formatKrw(bundle, latestRun.baseCaseValueKrw) : 'N/A' },
        { label: 'Bull Case', value: formatKrw(bundle, latestRun?.bullScenarioValueKrw) },
        { label: 'Bear Case', value: formatKrw(bundle, latestRun?.bearScenarioValueKrw) },
        {
          label: 'Implied Yield',
          value: latestRun?.baseScenario?.impliedYieldPct ? formatPercent(latestRun.baseScenario.impliedYieldPct) : 'N/A'
        },
        {
          label: 'Exit Cap',
          value: latestRun?.baseScenario?.exitCapRatePct ? formatPercent(latestRun.baseScenario.exitCapRatePct) : 'N/A'
        },
        {
          label: 'Levered Equity Value',
          value: summary ? formatKrw(bundle, summary.leveredEquityValueKrw) : 'N/A'
        }
      ]
    },
    {
      id: 'cashflow',
      kicker: 'Cash Flow',
      title: 'Opening-Year Cash Flow And Capital Stack',
      facts: [
        { label: 'Year 1 Total Op. Rev.', value: yearOne ? formatKrw(bundle, yearOne.totalOperatingRevenueKrw) : 'N/A' },
        { label: 'Year 1 NOI', value: yearOne ? formatKrw(bundle, yearOne.noiKrw) : 'N/A' },
        {
          label: 'Year 1 Debt Service',
          value: yearOne ? formatKrw(bundle, yearOne.debtServiceKrw) : 'N/A'
        },
        { label: 'Year 1 DSCR', value: yearOne?.dscr ? `${formatNumber(yearOne.dscr, 2)}x` : 'N/A' },
        {
          label: 'Reserve Requirement',
          value: summary ? formatKrw(bundle, summary.reserveRequirementKrw) : 'N/A'
        },
        {
          label: 'Ending Debt Balance',
          value: summary ? formatKrw(bundle, summary.endingDebtBalanceKrw) : 'N/A'
        }
      ],
      bullets: yearOne
        ? [
            `${formatCurrencyFromKrwAtRate(yearOne.tenantCapitalCostKrw, bundle.displayCurrency, bundle.fxRateToKrw)} of TI / LC is currently modeled in Year 1.`,
            `${formatCurrencyFromKrwAtRate(yearOne.nonRecoverableOperatingExpenseKrw, bundle.displayCurrency, bundle.fxRateToKrw)} sits below recoveries as non-recoverable OpEx.`,
            `${yearOne.activeRenewalLeaseCount} active renewal event(s) are reflected in the opening-year lease schedule.`
          ]
        : undefined
    },
    {
      id: 'diligence',
      kicker: 'Diligence',
      title: 'Coverage And Gating Items',
      facts:
        quality?.coverage.map((item) => ({
          label: item.label,
          value: item.status === 'good' ? 'Covered' : 'Thin',
          detail: item.detail,
          tone: item.status === 'good' ? 'good' : 'warn'
        })) ?? [],
      bullets: latestRun?.ddChecklist ?? []
    },
    {
      id: 'decision-request',
      kicker: 'Decision Request',
      title: 'Proposed Committee Posture',
      body: [
        `${getRecommendation(latestRun?.confidenceScore)} is the current recommended posture based on valuation confidence, downside coverage, and document support.`,
        latestRun?.keyRisks.length
          ? `Approval, if granted, should stay conditional on the following: ${latestRun.keyRisks.slice(0, 2).join(' ')}`
          : 'No formal conditions are available yet because the current valuation risk list is empty.'
      ]
    }
  ];
}

function buildDdChecklistSections(bundle: DealReportBundle): ReportSection[] {
  const docsByDiscipline = {
    legal: bundle.documents.filter((document) => inferDocumentTopic(document) === 'legal').length,
    technical: bundle.documents.filter((document) => inferDocumentTopic(document) === 'technical').length
  };
  const yearOne = bundle.proForma?.years[0];
  const powerPermitReview = bundle.reviewSummary.disciplines.find((discipline) => discipline.key === 'power_permit');
  const legalReview = bundle.reviewSummary.disciplines.find((discipline) => discipline.key === 'legal_title');
  const leaseReview = bundle.reviewSummary.disciplines.find((discipline) => discipline.key === 'lease_revenue');

  return [
    {
      id: 'commercial',
      kicker: 'Commercial',
      title: 'Revenue And Market',
      checklist: [
        {
          label: 'Approved lease evidence',
          detail:
            (leaseReview?.approvedCount ?? 0) > 0
              ? `${leaseReview?.approvedCount ?? 0} approved lease row(s) are valuation-ready${(leaseReview?.pendingCount ?? 0) > 0 ? `, with ${leaseReview?.pendingCount} pending review` : ''}.`
              : (leaseReview?.pendingCount ?? 0) > 0
                ? `${leaseReview?.pendingCount ?? 0} lease row(s) are pending review; revenue still falls back to raw snapshots.`
                : 'No approved lease rows are loaded; the current DCF still leans on residual lease-up.',
          status: buildChecklistStatus({
            ready: (leaseReview?.approvedCount ?? 0) > 0,
            partial: (leaseReview?.pendingCount ?? 0) > 0
          }),
          sources: pickSupportingDocuments(bundle.documents, 'lease revenue occupancy rent roll')
        },
        {
          label: 'Comparable evidence',
          detail:
            bundle.counts.comparables >= 3
              ? `${bundle.counts.comparables} comparable entries are available for pricing calibration.`
              : `${bundle.counts.comparables} comparable entries are loaded; add more for a robust IC pack.`,
          status: buildChecklistStatus({
            ready: bundle.counts.comparables >= 3,
            partial: bundle.counts.comparables > 0
          }),
          sources: pickSupportingDocuments(bundle.documents, 'market comparable pricing broker')
        },
        {
          label: 'Year 1 revenue bridge',
          detail: yearOne
            ? `Opening-year total operating revenue is ${formatKrw(bundle, yearOne.totalOperatingRevenueKrw)}.`
            : 'No opening-year pro forma is stored yet.',
          status: buildChecklistStatus({ ready: Boolean(yearOne), partial: Boolean(bundle.latestValuation) }),
          sources: pickSupportingDocuments(bundle.documents, 'revenue noi cash flow lease')
        },
        {
          label: 'Pending commercial blockers',
          detail:
            (leaseReview?.pendingCount ?? 0) > 0
              ? bundle.reviewSummary.pendingBlockers
                  .filter((blocker) => blocker.startsWith('Lease / Revenue'))
                  .slice(0, 2)
                  .join(' / ')
              : 'No commercial evidence is currently waiting on approval.',
          status: buildChecklistStatus({
            ready: (leaseReview?.pendingCount ?? 0) === 0,
            partial: (leaseReview?.approvedCount ?? 0) > 0
          }),
          sources: pickSupportingDocuments(bundle.documents, 'lease revenue diligence pending')
        }
      ]
    },
    {
      id: 'technical',
      kicker: 'Technical',
      title: 'Power, Permit, And Site',
      checklist: [
        {
          label: 'Technical documents in room',
          detail:
            docsByDiscipline.technical > 0
              ? `${docsByDiscipline.technical} technical / permit document(s) are in the current schedule.`
              : 'No permit, engineering, or power document is visible in the current schedule.',
          status: buildChecklistStatus({
            ready: docsByDiscipline.technical >= 2,
            partial: docsByDiscipline.technical > 0
          }),
          sources: pickSupportingDocuments(bundle.documents, 'permit power utility engineering')
        },
        {
          label: 'Power micro coverage',
          detail:
            bundle.valuationQuality?.coverage.find((item) => item.key === 'power')?.detail ??
            'Power micro coverage has not been evaluated.',
          status: buildChecklistStatus({
            ready: bundle.valuationQuality?.coverage.find((item) => item.key === 'power')?.status === 'good'
          }),
          sources: pickSupportingDocuments(bundle.documents, 'power utility interconnection')
        },
        {
          label: 'Permit visibility',
          detail:
            bundle.valuationQuality?.coverage.find((item) => item.key === 'permit')?.detail ??
            'Permit visibility has not been evaluated.',
          status: buildChecklistStatus({
            ready: bundle.valuationQuality?.coverage.find((item) => item.key === 'permit')?.status === 'good'
          }),
          sources: pickSupportingDocuments(bundle.documents, 'permit zoning environmental')
        },
        {
          label: 'Pending technical blockers',
          detail:
            (powerPermitReview?.pendingCount ?? 0) > 0
              ? bundle.reviewSummary.pendingBlockers
                  .filter((blocker) => blocker.startsWith('Power / Permit'))
                  .slice(0, 2)
                  .join(' / ')
              : 'No pending power or permit records are blocking the review packet.',
          status: buildChecklistStatus({
            ready: (powerPermitReview?.pendingCount ?? 0) === 0,
            partial: (powerPermitReview?.approvedCount ?? 0) > 0
          }),
          sources: pickSupportingDocuments(bundle.documents, 'permit power pending diligence')
        }
      ]
    },
    {
      id: 'legal',
      kicker: 'Legal',
      title: 'Title, Encumbrance, And Planning',
      checklist: [
        {
          label: 'Legal document support',
          detail:
            docsByDiscipline.legal > 0
              ? `${docsByDiscipline.legal} legal / title document(s) are present.`
              : 'No title, deed, mortgage, or legal pack document is present.',
          status: buildChecklistStatus({ ready: docsByDiscipline.legal >= 2, partial: docsByDiscipline.legal > 0 }),
          sources: pickSupportingDocuments(bundle.documents, 'title mortgage legal ownership')
        },
        {
          label: 'Approved legal evidence',
          detail:
            (legalReview?.approvedCount ?? 0) > 0
              ? `${legalReview?.approvedCount ?? 0} approved legal record(s) are staged${(legalReview?.pendingCount ?? 0) > 0 ? `, with ${legalReview?.pendingCount} pending review` : ''}.`
              : (legalReview?.pendingCount ?? 0) > 0
                ? `${legalReview?.pendingCount ?? 0} legal record(s) are pending review before the committee packet is complete.`
                : 'Ownership chain, encumbrance, or planning evidence is not yet recorded in approved form.',
          status: buildChecklistStatus({
            ready: (legalReview?.approvedCount ?? 0) > 0,
            partial: (legalReview?.pendingCount ?? 0) > 0
          }),
          sources: pickSupportingDocuments(bundle.documents, 'ownership title register')
        },
        {
          label: 'Debt stack loaded',
          detail:
            bundle.counts.debtFacilities > 0
              ? `${bundle.counts.debtFacilities} debt facility record(s) are in the capital stack.`
              : 'Debt stack is still synthetic or absent in the model.',
          status: buildChecklistStatus({ ready: bundle.counts.debtFacilities > 0 }),
          sources: pickSupportingDocuments(bundle.documents, 'debt term sheet financing dscr')
        },
        {
          label: 'Pending legal blockers',
          detail:
            (legalReview?.pendingCount ?? 0) > 0
              ? bundle.reviewSummary.pendingBlockers
                  .filter((blocker) => blocker.startsWith('Legal / Title'))
                  .slice(0, 2)
                  .join(' / ')
              : 'No pending title or legal evidence blockers.',
          status: buildChecklistStatus({
            ready: (legalReview?.pendingCount ?? 0) === 0,
            partial: (legalReview?.approvedCount ?? 0) > 0
          }),
          sources: pickSupportingDocuments(bundle.documents, 'title mortgage legal diligence pending')
        }
      ]
    }
  ];
}

function buildRiskMemoSections(bundle: DealReportBundle): ReportSection[] {
  const latestRun = bundle.latestValuation;
  const quality = bundle.valuationQuality;
  const reviewSummary = bundle.reviewSummary;
  const riskChecklist =
    latestRun?.keyRisks.length
      ? latestRun.keyRisks.map((risk) => ({
          label: `${toSentenceCase(inferSeverityTone(risk))} risk`,
          detail: risk,
          status: inferSeverityTone(risk) === 'danger' ? ('open' as const) : ('partial' as const),
          sources: pickSupportingDocuments(bundle.documents, risk)
        }))
      : [
          {
            label: 'Risk list missing',
            detail: 'No valuation risk list is available yet.',
            status: 'open' as const,
            sources: pickSupportingDocuments(bundle.documents, 'general risk')
          }
        ];

  const mitigationChecklist = [
    ...(latestRun?.ddChecklist.slice(0, 4).map((item) => ({
      label: item,
      detail: 'Current DD action carried from the latest valuation run.',
      status: 'open' as const,
      sources: pickSupportingDocuments(bundle.documents, item)
    })) ?? []),
    ...(quality?.missingInputs.slice(0, 3).map((item) => ({
      label: item,
      detail: 'Coverage gap inferred from current valuation quality summary.',
      status: 'partial' as const,
      sources: pickSupportingDocuments(bundle.documents, item)
    })) ?? [])
  ];

  return [
    {
      id: 'risk-posture',
      kicker: 'Risk Posture',
      title: 'Current Downside View',
      facts: [
        {
          label: 'Confidence',
          value: latestRun ? `${formatNumber(latestRun.confidenceScore, 1)} / 100` : 'N/A',
          tone: (latestRun?.confidenceScore ?? 0) < 55 ? 'danger' : 'warn'
        },
        {
          label: 'Base DSCR',
          value: latestRun?.baseScenario?.debtServiceCoverage
            ? `${formatNumber(latestRun.baseScenario.debtServiceCoverage, 2)}x`
            : 'N/A',
          tone: (latestRun?.baseScenario?.debtServiceCoverage ?? 0) < 1.15 ? 'danger' : 'neutral'
        },
        {
          label: 'Legal / Title Coverage',
          value:
            bundle.valuationQuality?.coverage.find((item) => item.key === 'legal')?.status === 'good' ? 'Covered' : 'Thin',
          tone:
            bundle.valuationQuality?.coverage.find((item) => item.key === 'legal')?.status === 'good' ? 'good' : 'warn'
        },
        {
          label: 'Anchored Docs',
          value: String(bundle.counts.anchoredDocuments)
        },
        {
          label: 'Approved / Pending Evidence',
          value: `${reviewSummary.totals.approved} / ${reviewSummary.totals.pending}`,
          tone: reviewSummary.totals.pending > 0 ? 'warn' : 'good'
        }
      ],
      body: [
        'This note is intended to isolate the current downside drivers before a small private distressed process moves further toward committee or external outreach.',
        takeSentences(bundle.latestValuation?.underwritingMemo, 2) || 'No current underwriting memo is available.',
        reviewSummary.pendingBlockers.length > 0
          ? `Open approval blockers: ${reviewSummary.pendingBlockers.slice(0, 3).join('; ')}.`
          : 'No normalized evidence rows are currently pending review.'
      ]
    },
    {
      id: 'primary-risks',
      kicker: 'Primary Risks',
      title: 'Issues Requiring Management Attention',
      checklist: riskChecklist
    },
    {
      id: 'mitigation',
      kicker: 'Mitigation',
      title: 'Near-Term Mitigants And Open Items',
      checklist:
        mitigationChecklist.length > 0
          ? mitigationChecklist
          : [
              {
                label: 'Mitigation list missing',
                detail: 'No mitigation list is available yet.',
                status: 'open',
                sources: pickSupportingDocuments(bundle.documents, 'mitigation')
              }
            ]
    },
    {
      id: 'evidence',
      kicker: 'Evidence',
      title: 'Document Support',
      facts: bundle.documents.slice(0, 6).map((document) => ({
        label: document.title,
        value: `${document.documentType} / v${document.currentVersion}`,
        detail: `${formatDate(document.updatedAt)} / ${shortHash(document.hash)}`
      }))
    }
  ];
}

function buildReportSections(bundle: DealReportBundle, kind: ReportKind): ReportSection[] {
  switch (kind) {
    case 'teaser':
      return buildTeaserSections(bundle);
    case 'ic-memo':
      return buildIcMemoSections(bundle);
    case 'dd-checklist':
      return buildDdChecklistSections(bundle);
    case 'risk-memo':
      return buildRiskMemoSections(bundle);
  }
}

export function getReportTemplateMeta(kind: ReportKind) {
  return reportTemplateMeta[kind];
}

export function listReportTemplates() {
  return reportKinds.map((kind) => reportTemplateMeta[kind]);
}

export function isReportKind(value: string): value is ReportKind {
  return reportKinds.includes(value as ReportKind);
}

export function isReportPacketAudience(value: string): value is ReportPacketAudience {
  return value === 'investor' || value === 'operator';
}

export async function buildReportBundleFromAsset(
  asset: AssetBundle,
  options?: {
    fxRateToKrw?: number | null;
    generatedAt?: Date;
  }
): Promise<DealReportBundle> {
  const latestValuation = asset.valuations[0];
  const displayCurrency = resolveDisplayCurrency(asset.address?.country ?? asset.market);
  const fxRateToKrw =
    (options?.fxRateToKrw ?? null) ??
    (await getFxRateMap([displayCurrency]).then((rates) => rates[displayCurrency] ?? null));
  const provenance = Array.isArray(latestValuation?.provenance) ? (latestValuation.provenance as ProvenanceEntry[]) : [];
  const quality = latestValuation ? buildValuationQualitySummary(asset, latestValuation.assumptions, provenance) : null;
  const reviewSummary = buildAssetEvidenceReviewSummary(asset as unknown as Parameters<typeof buildAssetEvidenceReviewSummary>[0]);
  const baseScenario = resolveBaseScenario(latestValuation);
  const proForma = latestValuation ? readStoredBaseCaseProForma(latestValuation.assumptions) : null;
  const documents = buildDocumentTrace(asset);
  const latestReviewPacketRecord = getLatestReviewPacketRecord(asset.readinessProject?.onchainRecords);
  const latestAnchoredRecord =
    asset.readinessProject?.onchainRecords.find((record) => Boolean(record.txHash)) ?? null;
  const latestOnchainRecord = latestAnchoredRecord
    ? {
        txHash: latestAnchoredRecord.txHash,
        chainId: latestAnchoredRecord.chainId,
        anchoredAt: latestAnchoredRecord.anchoredAt,
        status: latestAnchoredRecord.status,
        recordType: latestAnchoredRecord.recordType
      }
    : null;
  const latestReviewPacket = extractReviewPacketSummary(latestReviewPacketRecord);
  const locationLabel = [asset.address?.city, asset.address?.province, asset.address?.country].filter(Boolean).join(', ') || asset.market;
  const sizeLabel = asset.assetClass === AssetClass.DATA_CENTER ? 'Power Capacity' : 'Rentable Area';
  const sizeValue =
    asset.assetClass === AssetClass.DATA_CENTER
      ? `${formatNumber(asset.powerCapacityMw)} MW`
      : `${formatNumber(asset.rentableAreaSqm ?? asset.grossFloorAreaSqm)} sqm`;

  return {
    assetId: asset.id,
    assetCode: asset.assetCode,
    assetSlug: asset.slug,
    assetName: asset.name,
    assetDescription: asset.description,
    assetClass: asset.assetClass,
    assetClassLabel: toSentenceCase(asset.assetClass),
    market: asset.market,
    stage: toSentenceCase(asset.stage),
    status: toSentenceCase(asset.status),
    ownerName: asset.ownerName,
    sponsorName: asset.sponsorName,
    developmentSummary: asset.developmentSummary,
    locationLabel,
    sizeLabel,
    sizeValue,
    displayCurrency,
    fxRateToKrw,
    counts: {
      documents: asset.documents.length,
      leases: asset.leases.length,
      comparables: asset.comparableSet?.entries.length ?? 0,
      capexLines: asset.capexLineItems.length,
      debtFacilities: asset.debtFacilities.length,
      ownershipRecords: asset.ownershipRecords.length,
      encumbrances: asset.encumbranceRecords.length,
      planningConstraints: asset.planningConstraints.length,
      anchoredDocuments: asset.readinessProject?.onchainRecords.filter((record) => Boolean(record.documentId)).length ?? 0
    },
    latestValuation: latestValuation
      ? {
          id: latestValuation.id,
          runLabel: latestValuation.runLabel,
          createdAt: latestValuation.createdAt,
          engineVersion: latestValuation.engineVersion,
          confidenceScore: latestValuation.confidenceScore,
          baseCaseValueKrw: latestValuation.baseCaseValueKrw,
          underwritingMemo: latestValuation.underwritingMemo,
          keyRisks: latestValuation.keyRisks,
          ddChecklist: latestValuation.ddChecklist,
          assumptions: latestValuation.assumptions,
          provenance,
          baseScenario: baseScenario
            ? {
                valuationKrw: baseScenario.valuationKrw,
                impliedYieldPct: baseScenario.impliedYieldPct,
                exitCapRatePct: baseScenario.exitCapRatePct,
                debtServiceCoverage: baseScenario.debtServiceCoverage
              }
            : null,
          bullScenarioValueKrw: latestValuation.scenarios[0]?.valuationKrw ?? null,
          bearScenarioValueKrw: latestValuation.scenarios.at(-1)?.valuationKrw ?? null
        }
      : null,
    proForma,
    valuationQuality: quality,
    reviewSummary,
    documents,
    latestOnchainRecord,
    latestReviewPacket,
    reportFingerprint: buildReportFingerprint(asset),
    generatedAt: options?.generatedAt ?? new Date()
  };
}

export async function getAssetReportBundle(assetId: string) {
  const asset = await getAssetById(assetId);
  if (!asset) return null;
  return buildReportBundleFromAsset(asset);
}

export function buildDealReport(bundle: DealReportBundle, kind: ReportKind): DealReport {
  const meta = getReportTemplateMeta(kind);
  const versionLabel = `${kind.toUpperCase()}-${bundle.generatedAt.toISOString().slice(0, 10).replace(/-/g, '')}-${bundle.reportFingerprint}`;
  return {
    kind,
    title: meta.title,
    shortLabel: meta.shortLabel,
    audience: meta.audience,
    audienceLabel: meta.audience === 'investor' ? 'Investor-Facing' : 'Operator / IC',
    status: meta.status,
    statusLabel: getReportStatusLabel(meta.status),
    description: meta.description,
    distributionNotice: buildDistributionNotice(kind),
    footerNotice: buildFooterNotice(kind),
    generatedAt: bundle.generatedAt,
    generatedAtLabel: formatDate(bundle.generatedAt),
    versionLabel,
    exportFileBase: `${slugify(bundle.assetCode)}-${slugify(meta.shortLabel)}-${versionLabel.toLowerCase()}`,
    heroSummary: buildHeroSummary(bundle, kind),
    heroFacts: buildHeroFacts(bundle, kind),
    sections: buildReportSections(bundle, kind),
    documents: bundle.documents,
    traceability: buildTraceabilityFacts(bundle, kind),
    controlSheet: buildControlSheet(bundle, versionLabel),
    readinessNotes: [meta.notes]
  };
}

export function buildDealReportPacket(bundle: DealReportBundle, audience: ReportPacketAudience): DealReportPacket {
  const kinds: ReportKind[] =
    audience === 'investor' ? ['teaser'] : ['ic-memo', 'dd-checklist', 'risk-memo'];
  const reports = kinds.map((kind) => buildDealReport(bundle, kind));
  const versionLabel = `${audience.toUpperCase()}-PACK-${bundle.generatedAt
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '')}-${bundle.reportFingerprint}`;

  return {
    audience,
    title: audience === 'investor' ? 'Investor Packet' : 'IC Packet',
    description:
      audience === 'investor'
        ? 'Teaser-led external packet for limited private circulation.'
        : 'Internal committee packet bundling IC memo, diligence checklist, and risk memo.',
    generatedAt: bundle.generatedAt,
    generatedAtLabel: formatDate(bundle.generatedAt),
    exportFileBase: `${slugify(bundle.assetCode)}-${audience}-packet-${versionLabel.toLowerCase()}`,
    versionLabel,
    reports
  };
}

export function serializeReportToMarkdown(report: DealReport) {
  const lines: string[] = [];
  lines.push(`# ${report.title}`);
  lines.push('');
  lines.push(`- Audience: ${report.audienceLabel}`);
  lines.push(`- Template status: ${report.statusLabel}`);
  lines.push(`- Generated: ${report.generatedAtLabel}`);
  lines.push(`- Version: ${report.versionLabel}`);
  lines.push('');
  lines.push(report.heroSummary);
  lines.push('');

  if (report.heroFacts.length) {
    lines.push('## Summary');
    lines.push('');
    report.heroFacts.forEach((fact) => {
      lines.push(`- ${fact.label}: ${fact.value}${fact.detail ? ` (${fact.detail})` : ''}`);
    });
    lines.push('');
  }

  report.sections.forEach((section) => {
    lines.push(`## ${section.title}`);
    lines.push('');
    if (section.kicker) {
      lines.push(`_${section.kicker}_`);
      lines.push('');
    }
    section.body?.forEach((paragraph) => {
      lines.push(paragraph);
      lines.push('');
    });
    section.facts?.forEach((fact) => {
      lines.push(`- ${fact.label}: ${fact.value}${fact.detail ? ` (${fact.detail})` : ''}`);
    });
    if (section.facts?.length) lines.push('');
    section.bullets?.forEach((bullet) => {
      lines.push(`- ${bullet}`);
    });
    if (section.bullets?.length) lines.push('');
    section.checklist?.forEach((item) => {
      lines.push(`- [${item.status.toUpperCase()}] ${item.label}: ${item.detail}`);
      if (item.sources?.length) {
        lines.push(`  - Sources: ${item.sources.join(', ')}`);
      }
    });
    if (section.checklist?.length) lines.push('');
  });

  if (report.documents.length) {
    lines.push('## Document Schedule');
    lines.push('');
    report.documents.forEach((document) => {
      const anchor = document.anchoredTxHash ? ` / anchor ${shortHash(document.anchoredTxHash)}` : '';
      lines.push(
        `- ${document.title} (${document.documentType}, v${document.currentVersion}, ${formatDate(document.updatedAt)}, hash ${shortHash(document.hash)}${anchor})`
      );
    });
    lines.push('');
  }

  if (report.traceability.length) {
    lines.push('## Traceability');
    lines.push('');
    report.traceability.forEach((fact) => {
      lines.push(`- ${fact.label}: ${fact.value}${fact.detail ? ` (${fact.detail})` : ''}`);
    });
    lines.push('');
  }

  if (report.controlSheet.length) {
    lines.push('## Control Sheet');
    lines.push('');
    report.controlSheet.forEach((fact) => {
      lines.push(`- ${fact.label}: ${fact.value}${fact.detail ? ` (${fact.detail})` : ''}`);
    });
    lines.push('');
  }

  if (report.readinessNotes.length) {
    lines.push('## Template Notes');
    lines.push('');
    report.readinessNotes.forEach((note) => {
      lines.push(`- ${note}`);
    });
    lines.push('');
  }

  return lines.join('\n').trim();
}

export function serializeReportPacketToMarkdown(packet: DealReportPacket) {
  const lines: string[] = [];
  lines.push(`# ${packet.title}`);
  lines.push('');
  lines.push(`- Audience: ${packet.audience}`);
  lines.push(`- Generated: ${packet.generatedAtLabel}`);
  lines.push(`- Version: ${packet.versionLabel}`);
  lines.push('');
  lines.push(packet.description);
  lines.push('');

  packet.reports.forEach((report, index) => {
    if (index > 0) {
      lines.push('---');
      lines.push('');
    }
    lines.push(serializeReportToMarkdown(report));
    lines.push('');
  });

  return lines.join('\n').trim();
}
