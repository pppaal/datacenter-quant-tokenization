import { AssetClass, type ReadinessStatus } from '@prisma/client';
import type { SupportedCurrency } from '@/lib/finance/currency';
import { getAssetById } from '@/lib/services/assets';
import type { AssetEvidenceReviewSummary } from '@/lib/services/review';
import type { ProFormaBaseCase } from '@/lib/services/valuation/types';
import type { ValuationQualitySummary } from '@/lib/services/valuation/quality';
import type { ProvenanceEntry } from '@/lib/sources/types';

export const reportKinds = ['teaser', 'ic-memo', 'dd-checklist', 'risk-memo'] as const;

export type ReportKind = (typeof reportKinds)[number];
export type ReportAudience = 'operator' | 'investor';
export type ReportTemplateStatus = 'production-ready' | 'partial';

export type AssetBundle = NonNullable<Awaited<ReturnType<typeof getAssetById>>>;
export type DocumentTopic = 'legal' | 'technical' | 'financial' | 'market' | 'general';

export type ReportFactTone = 'neutral' | 'good' | 'warn' | 'danger';
export type ChecklistStatus = 'complete' | 'partial' | 'open';

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
  researchDossier: {
    marketThesis: string;
    freshnessHeadline: string;
    freshnessLabel: string;
    openCoverageTaskCount: number;
    houseViewLabel: string;
    thesisAgeDays: number | null;
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
