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

type ResearchSnapshotLike = {
  id?: string;
  snapshotType?: string;
  title: string;
  sourceSystem?: string | null;
  freshnessStatus?: SourceStatus | null;
  freshnessLabel?: string | null;
  snapshotDate: Date;
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
  const fallbackFreshness = deriveFallbackFreshness(asset);
  const freshestSnapshot = researchSnapshots[0] ?? null;
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

  return {
    playbook: {
      ...playbook,
      valuationVariableFamilies: selectValuationVariableFamilies(asset.assetClass)
    },
    marketThesis: `${macro.thesis} ${market.thesis}`.trim(),
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
    officialSources: {
      highlights: researchSnapshots
        .filter((snapshot) => snapshot.snapshotType === 'market-official-source' || snapshot.snapshotType === 'official-source')
        .flatMap((snapshot) =>
          extractSnapshotHighlights(snapshot.metrics).map((item) => ({
            ...item,
            sourceSystem: snapshot.sourceSystem ?? 'research',
            freshnessLabel: snapshot.freshnessLabel ?? 'unknown'
          }))
        )
        .slice(0, 6)
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
