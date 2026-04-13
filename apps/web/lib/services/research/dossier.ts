import { AssetClass, SourceStatus, TaskStatus } from '@prisma/client';
import { getAssetClassPlaybook } from '@/lib/asset-class/playbook';
import {
  buildAssetEvidenceReviewSummary,
  extractReviewPacketSummary,
  getLatestReviewPacketRecord
} from '@/lib/services/review';
import { buildDocumentResearchSummary } from '@/lib/services/research/document-research';
import {
  deriveResearchFreshness,
  describeResearchFreshness
} from '@/lib/services/research/freshness';
import { buildMacroResearchSummary } from '@/lib/services/research/macro-research';
import { buildMarketResearchSummary } from '@/lib/services/research/market-research';
import { buildMicroResearchSummary } from '@/lib/services/research/micro-research';
import { selectValuationVariableFamilies } from '@/lib/services/valuation/variable-selection';

type SnapshotViewType = 'SOURCE' | 'HOUSE';
type SnapshotApprovalStatus = 'DRAFT' | 'APPROVED' | 'SUPERSEDED';

type ResearchSnapshotLike = {
  id?: string;
  snapshotType?: string;
  viewType?: SnapshotViewType | null;
  approvalStatus?: SnapshotApprovalStatus | null;
  title: string;
  summary?: string | null;
  sourceSystem?: string | null;
  freshnessStatus?: SourceStatus | null;
  freshnessLabel?: string | null;
  snapshotDate: Date;
  approvedAt?: Date | null;
  approvedById?: string | null;
  supersedesSnapshotId?: string | null;
  metrics?: unknown;
};

type CoverageTaskLike = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: string;
  notes?: string | null;
  freshnessLabel?: string | null;
};

function extractSnapshotHighlights(metrics: unknown) {
  if (!metrics || typeof metrics !== 'object') {
    return [] as Array<{ label: string; value: string }>;
  }

  const rawHighlights = (metrics as Record<string, unknown>).highlights;
  if (!Array.isArray(rawHighlights)) {
    return [] as Array<{ label: string; value: string }>;
  }

  return rawHighlights
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const candidate = item as Record<string, unknown>;
      return typeof candidate.label === 'string' && typeof candidate.value === 'string'
        ? {
            label: candidate.label,
            value: candidate.value
          }
        : null;
    })
    .filter((item): item is { label: string; value: string } => Boolean(item));
}

function inferSnapshotViewType(snapshot: ResearchSnapshotLike) {
  if (snapshot.viewType) return snapshot.viewType;
  if (snapshot.snapshotType === 'official-source' || snapshot.snapshotType === 'market-official-source') {
    return 'SOURCE';
  }
  return 'HOUSE';
}

function inferSnapshotApprovalStatus(snapshot: ResearchSnapshotLike) {
  if (snapshot.approvalStatus) return snapshot.approvalStatus;
  return inferSnapshotViewType(snapshot) === 'SOURCE' ? 'APPROVED' : 'DRAFT';
}

function approvalLabel(status: SnapshotApprovalStatus | null | undefined) {
  if (status === 'APPROVED') return 'approved house view';
  if (status === 'SUPERSEDED') return 'superseded house view';
  return 'draft house view';
}

type ResearchAssetLike = {
  id: string;
  name: string;
  assetClass: AssetClass | null | undefined;
  assetCode: string;
  address?: {
    parcelId?: string | null;
    city?: string | null;
    province?: string | null;
    country?: string | null;
  } | null;
  buildingSnapshot?: {
    zoning?: string | null;
    structureDescription?: string | null;
  } | null;
  siteProfile?: {
    siteNotes?: string | null;
  } | null;
  marketSnapshot?: {
    metroRegion?: string | null;
    capRatePct?: number | null;
    discountRatePct?: number | null;
    vacancyPct?: number | null;
    inflationPct?: number | null;
    debtCostPct?: number | null;
    marketNotes?: string | null;
  } | null;
  macroSeries?: Array<{
    seriesKey: string;
    label: string;
    value: number | null;
    observationDate: Date;
  }>;
  macroFactors?: Array<{
    factorKey: string;
    label: string;
    value: number | null;
    direction: string;
    observationDate: Date;
  }>;
  marketIndicatorSeries?: Array<{
    id: string;
    indicatorKey: string;
    label?: string | null;
    value: number | null;
    observationDate: Date;
  }>;
  transactionComps?: Array<{
    id: string;
    assetName?: string | null;
    transactionDate?: Date | null;
    pricePerSqmKrw?: number | null;
    capRatePct?: number | null;
  }>;
  rentComps?: Array<{
    id: string;
    assetName?: string | null;
    observationDate?: Date | null;
    monthlyRentPerSqmKrw?: number | null;
    occupancyPct?: number | null;
  }>;
  pipelineProjects?: Array<{
    id: string;
    projectName: string;
    stageLabel?: string | null;
    expectedDeliveryDate?: Date | null;
    expectedAreaSqm?: number | null;
    expectedPowerMw?: number | null;
  }>;
  ownershipRecords?: Array<{
    id: string;
    [key: string]: unknown;
  }>;
  encumbranceRecords?: Array<{
    id: string;
    [key: string]: unknown;
  }>;
  planningConstraints?: Array<{
    id: string;
    [key: string]: unknown;
  }>;
  leases?: Array<{
    id: string;
    [key: string]: unknown;
  }>;
  debtFacilities?: Array<{ id: string }>;
  taxAssumption?: { id: string } | null;
  valuations?: Array<{ id: string; runLabel: string; createdAt: Date }>;
  readinessProject?: {
    onchainRecords?: Array<{
      txHash?: string | null;
      recordType?: string | null;
      payload?: unknown;
      anchoredAt?: Date | null;
    }>;
  } | null;
  documents?: Array<{
    id: string;
    currentVersion: number;
    title: string;
    documentType: string;
    updatedAt: Date;
    documentHash: string | null;
    aiSummary?: string | null;
  }>;
  researchSnapshots?: ResearchSnapshotLike[];
  coverageTasks?: CoverageTaskLike[];
  [key: string]: unknown;
};

type ResearchConfidenceConflict = {
  label: string;
  detail: string;
  severity: 'warn' | 'danger';
};

function roundMetric(value: number) {
  return Number(value.toFixed(0));
}

function parseIndicatorFamily(indicatorKey: string) {
  const normalized = indicatorKey.toLowerCase();
  if (normalized.includes('vacancy')) return 'vacancy';
  if (normalized.includes('cap_rate')) return 'cap_rate';
  if (normalized.includes('discount_rate')) return 'discount_rate';
  if (normalized.includes('rent_growth')) return 'rent_growth';
  if (normalized.includes('land_price')) return 'land_price';
  return null;
}

function latestIndicatorValue(asset: ResearchAssetLike, family: string) {
  return (asset.marketIndicatorSeries ?? []).find((indicator) => parseIndicatorFamily(indicator.indicatorKey) === family)?.value ?? null;
}

function median(values: Array<number | null | undefined>) {
  const observed = values.filter((value): value is number => typeof value === 'number').sort((a, b) => a - b);
  if (observed.length === 0) return null;
  const middle = Math.floor(observed.length / 2);
  return observed.length % 2 === 0 ? (observed[middle - 1] + observed[middle]) / 2 : observed[middle];
}

function deriveResearchConflicts(asset: ResearchAssetLike) {
  const conflicts: ResearchConfidenceConflict[] = [];
  const officialVacancy = latestIndicatorValue(asset, 'vacancy');
  const officialCapRate = latestIndicatorValue(asset, 'cap_rate');
  const officialDiscountRate = latestIndicatorValue(asset, 'discount_rate');
  const snapshotVacancy = asset.marketSnapshot?.vacancyPct ?? null;
  const snapshotCapRate = asset.marketSnapshot?.capRatePct ?? null;
  const snapshotDiscountRate = asset.marketSnapshot?.discountRatePct ?? null;
  const transactionCapRateMedian = median((asset.transactionComps ?? []).map((item) => item.capRatePct));

  if (snapshotVacancy != null && officialVacancy != null && Math.abs(snapshotVacancy - officialVacancy) >= 2.5) {
    conflicts.push({
      label: 'Vacancy disagreement',
      detail: `Market snapshot vacancy ${snapshotVacancy.toFixed(1)}% differs from official coverage at ${officialVacancy.toFixed(1)}%.`,
      severity: Math.abs(snapshotVacancy - officialVacancy) >= 4 ? 'danger' : 'warn'
    });
  }

  if (snapshotCapRate != null && officialCapRate != null && Math.abs(snapshotCapRate - officialCapRate) >= 0.5) {
    conflicts.push({
      label: 'Cap-rate disagreement',
      detail: `Market snapshot cap rate ${snapshotCapRate.toFixed(1)}% differs from official coverage at ${officialCapRate.toFixed(1)}%.`,
      severity: Math.abs(snapshotCapRate - officialCapRate) >= 0.9 ? 'danger' : 'warn'
    });
  }

  if (snapshotCapRate != null && transactionCapRateMedian != null && Math.abs(snapshotCapRate - transactionCapRateMedian) >= 0.6) {
    conflicts.push({
      label: 'Comp calibration drift',
      detail: `Market snapshot cap rate ${snapshotCapRate.toFixed(1)}% is off the median transaction-comp cap rate of ${transactionCapRateMedian.toFixed(1)}%.`,
      severity: Math.abs(snapshotCapRate - transactionCapRateMedian) >= 1 ? 'danger' : 'warn'
    });
  }

  if (
    snapshotDiscountRate != null &&
    officialDiscountRate != null &&
    Math.abs(snapshotDiscountRate - officialDiscountRate) >= 0.75
  ) {
    conflicts.push({
      label: 'Discount-rate disagreement',
      detail: `Market snapshot discount rate ${snapshotDiscountRate.toFixed(1)}% differs from official coverage at ${officialDiscountRate.toFixed(1)}%.`,
      severity: Math.abs(snapshotDiscountRate - officialDiscountRate) >= 1.25 ? 'danger' : 'warn'
    });
  }

  return conflicts.slice(0, 4);
}

function deriveResearchConfidence(args: {
  asset: ResearchAssetLike;
  reviewSummary: ReturnType<typeof buildAssetEvidenceReviewSummary>;
  freshestSnapshot: ResearchSnapshotLike | null;
  houseViewSnapshot: ResearchSnapshotLike | null;
  provenanceSources: string[];
  openCoverageTaskCount: number;
  officialHighlightCount: number;
}) {
  const {
    asset,
    reviewSummary,
    freshestSnapshot,
    houseViewSnapshot,
    provenanceSources,
    openCoverageTaskCount,
    officialHighlightCount
  } = args;
  let score = 72;

  if (freshestSnapshot?.freshnessStatus === SourceStatus.STALE) score -= 12;
  if (freshestSnapshot?.freshnessStatus === SourceStatus.FAILED) score -= 24;
  if (!freshestSnapshot) score -= 14;
  score -= Math.min(reviewSummary.pendingBlockers.length * 8, 24);
  score -= Math.min(openCoverageTaskCount * 4, 16);
  score += Math.min(provenanceSources.length * 2, 8);
  score += Math.min(reviewSummary.approvedCoverageCount * 2, 10);
  if (houseViewSnapshot && inferSnapshotApprovalStatus(houseViewSnapshot) === 'APPROVED') {
    score += 4;
  }
  if ((asset.transactionComps?.length ?? 0) === 0) score -= 8;
  if ((asset.rentComps?.length ?? 0) === 0) score -= 6;
  if (officialHighlightCount === 0) score -= 6;

  const conflicts = deriveResearchConflicts(asset);
  score -= conflicts.reduce((total, item) => total + (item.severity === 'danger' ? 8 : 4), 0);

  const boundedScore = Math.max(18, Math.min(95, roundMetric(score)));
  const level: 'high' | 'moderate' | 'low' =
    boundedScore >= 78 ? 'high' : boundedScore >= 58 ? 'moderate' : 'low';
  const thesisAgeDays = freshestSnapshot
    ? Math.max(0, Math.round((Date.now() - freshestSnapshot.snapshotDate.getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  return {
    score: boundedScore,
    level,
    thesisAgeDays,
    headline:
      level === 'high'
        ? houseViewSnapshot && inferSnapshotApprovalStatus(houseViewSnapshot) === 'APPROVED'
          ? 'Approved house view is strong enough for committee circulation.'
          : 'Research confidence is strong enough for committee circulation.'
        : level === 'moderate'
          ? houseViewSnapshot
            ? `${approvalLabel(inferSnapshotApprovalStatus(houseViewSnapshot))} is usable, but gaps should be cleared before heavy reliance.`
            : 'Research confidence is usable, but gaps should be cleared before heavy reliance.'
          : 'Research confidence is below committee-ready threshold and needs more coverage.',
    conflicts
  };
}

function deriveFallbackFreshness(asset: ResearchAssetLike) {
  const candidates: Array<Date | null | undefined> = [
    asset.marketIndicatorSeries?.[0]?.observationDate,
    asset.transactionComps?.[0]?.transactionDate,
    asset.rentComps?.[0]?.observationDate,
    asset.macroFactors?.[0]?.observationDate,
    asset.documents?.[0]?.updatedAt
  ];

  const observedAt =
    candidates
      .filter((value): value is Date => value instanceof Date)
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;

  const freshness = deriveResearchFreshness(observedAt);
  return freshness.observedAt
    ? freshness
    : {
        ...freshness,
        label: 'missing research coverage'
      };
}

export function buildAssetResearchDossier(asset: ResearchAssetLike) {
  const playbook = getAssetClassPlaybook(asset.assetClass);
  const reviewSummary = buildAssetEvidenceReviewSummary(asset);
  const macro = buildMacroResearchSummary(asset);
  const market = buildMarketResearchSummary(asset);
  const micro = buildMicroResearchSummary(asset, reviewSummary);
  const documents = buildDocumentResearchSummary(asset);
  const latestReviewPacket = extractReviewPacketSummary(getLatestReviewPacketRecord(asset.readinessProject?.onchainRecords));
  const researchSnapshots = [...(asset.researchSnapshots ?? [])];
  const houseViewSnapshot =
    researchSnapshots.find(
      (snapshot) =>
        inferSnapshotViewType(snapshot) === 'HOUSE' &&
        inferSnapshotApprovalStatus(snapshot) === 'APPROVED'
    ) ??
    researchSnapshots.find((snapshot) => inferSnapshotViewType(snapshot) === 'HOUSE') ??
    null;
  const draftHouseViewSnapshot =
    researchSnapshots.find(
      (snapshot) => inferSnapshotViewType(snapshot) === 'HOUSE' && inferSnapshotApprovalStatus(snapshot) === 'DRAFT'
    ) ?? null;
  const sourceViewSnapshot =
    researchSnapshots.find((snapshot) => inferSnapshotViewType(snapshot) === 'SOURCE') ?? null;
  const fallbackFreshness = deriveFallbackFreshness(asset);
  const freshestSnapshot = houseViewSnapshot ?? researchSnapshots[0] ?? null;
  const freshnessStatus = freshestSnapshot?.freshnessStatus ?? fallbackFreshness.status;
  const freshnessLabel = freshestSnapshot?.freshnessLabel ?? fallbackFreshness.label;
  const openCoverageTasks = (asset.coverageTasks ?? []).filter((task) => task.status !== TaskStatus.DONE);
  const provenanceSources = [
    ...new Set(
      researchSnapshots
        .map((snapshot) => snapshot.sourceSystem)
        .filter((value): value is string => Boolean(value))
      )
  ];
  const officialSourceHighlights = researchSnapshots
    .filter((snapshot) => snapshot.snapshotType === 'market-official-source' || snapshot.snapshotType === 'official-source')
    .flatMap((snapshot) =>
      extractSnapshotHighlights(snapshot.metrics).map((item) => ({
        ...item,
        sourceSystem: snapshot.sourceSystem ?? 'research',
        freshnessLabel: snapshot.freshnessLabel ?? 'unknown'
      }))
    )
    .slice(0, 6);
  const confidence = deriveResearchConfidence({
    asset,
    reviewSummary,
    freshestSnapshot,
    houseViewSnapshot,
    provenanceSources,
    openCoverageTaskCount: openCoverageTasks.length,
    officialHighlightCount: officialSourceHighlights.length
  });
  const combinedMarketThesis = `${macro.thesis} ${market.thesis}`.trim();
  const houseViewSummary = houseViewSnapshot?.summary?.trim() || combinedMarketThesis;
  const houseViewApprovalStatus = houseViewSnapshot ? inferSnapshotApprovalStatus(houseViewSnapshot) : null;

  return {
    playbook: {
      ...playbook,
      valuationVariableFamilies: selectValuationVariableFamilies(asset.assetClass)
    },
    marketThesis: houseViewSummary,
    macro,
    market,
    micro,
    documents,
    pendingBlockers: reviewSummary.pendingBlockers,
    latestValuationId: asset.valuations?.[0]?.id ?? null,
    reviewPacketFingerprint: latestReviewPacket?.fingerprint ?? null,
    chainAnchorReference: asset.readinessProject?.onchainRecords?.find((record) => record.txHash)?.txHash ?? null,
    freshness: {
      status: freshnessStatus,
      label: freshnessLabel,
      headline: describeResearchFreshness(freshnessStatus, freshnessLabel),
      items:
        researchSnapshots.length > 0
          ? researchSnapshots.slice(0, 4).map((snapshot) => ({
              title: snapshot.title,
              sourceSystem: snapshot.sourceSystem ?? 'research',
              freshnessStatus: snapshot.freshnessStatus ?? SourceStatus.FAILED,
              freshnessLabel: snapshot.freshnessLabel ?? 'unknown',
              observedAt: snapshot.snapshotDate
            }))
          : [
              {
                title: 'Asset dossier coverage',
                sourceSystem: 'research-dossier',
                freshnessStatus,
                freshnessLabel,
                observedAt: fallbackFreshness.observedAt
              }
            ]
    },
    provenance: {
      sourceCount: provenanceSources.length,
      sources: provenanceSources,
      latestSnapshotTitle: freshestSnapshot?.title ?? 'Asset dossier coverage',
      latestSnapshotDate: freshestSnapshot?.snapshotDate ?? fallbackFreshness.observedAt
    },
    houseView: {
      draftSnapshotId: draftHouseViewSnapshot?.id ?? null,
      title: houseViewSnapshot?.title ?? 'No persisted house view',
      summary: houseViewSummary,
      approvalStatus: houseViewApprovalStatus,
      approvalLabel: approvalLabel(houseViewApprovalStatus),
      approvedAt: houseViewSnapshot?.approvedAt ?? null,
      approvedById: houseViewSnapshot?.approvedById ?? null,
      snapshotDate: houseViewSnapshot?.snapshotDate ?? null,
      thesisAgeDays: confidence.thesisAgeDays,
      lineage:
        houseViewSnapshot?.supersedesSnapshotId
          ? 'Current thesis supersedes an earlier house view.'
          : 'Current thesis is derived from approved evidence, market comps, and official-source coverage.'
    },
    sourceView: {
      title: sourceViewSnapshot?.title ?? 'No persisted source view',
      sourceSystem: sourceViewSnapshot?.sourceSystem ?? null,
      freshnessLabel: sourceViewSnapshot?.freshnessLabel ?? null,
      snapshotDate: sourceViewSnapshot?.snapshotDate ?? null,
      summary: sourceViewSnapshot?.summary ?? null
    },
    confidence,
    officialSources: {
      highlights: officialSourceHighlights
    },
    coverage: {
      openTaskCount: openCoverageTasks.length,
      tasks: openCoverageTasks.slice(0, 5).map((task) => ({
        id: task.id,
        title: task.title,
        priority: task.priority,
        notes: task.notes ?? null,
        freshnessLabel: task.freshnessLabel ?? null
      }))
    }
  };
}
