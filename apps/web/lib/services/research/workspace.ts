import {
  AssetClass,
  type Prisma,
  ResearchSyncTriggerType,
  SourceStatus,
  TaskPriority,
  TaskStatus,
  type PrismaClient
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getAssetClassPlaybook } from '@/lib/asset-class/playbook';
import { buildPortfolioOptimizationWorkspaceItem } from '@/lib/services/portfolio-optimization';
import { listPortfolios } from '@/lib/services/portfolio';
import { assetBundleInclude } from '@/lib/services/assets';
import { buildAssetEvidenceReviewSummary } from '@/lib/services/review';
import { buildAssetResearchDossier } from '@/lib/services/research/dossier';
import {
  deriveResearchFreshness,
  getFreshnessTone
} from '@/lib/services/research/freshness';
import { createPrismaSourceCacheStore } from '@/lib/sources/cache';
import {
  createKoreaPublicDatasetAdapter,
  extractKoreaPublicDatasetMetrics,
  listKoreaPublicDatasetDefinitions,
  type KoreaPublicDatasetDefinition,
  type KoreaPublicNormalizedMetric
} from '@/lib/sources/adapters/korea-public';
import { slugify } from '@/lib/utils';

export type ResearchWorkspaceTab = 'macro' | 'markets' | 'submarkets' | 'assets' | 'optimization' | 'coverage';

export type ResearchWorkspaceData = {
  tabs: ResearchWorkspaceTab[];
  status: {
    didRefresh: boolean;
    latestOfficialSyncAt: Date | null;
    latestAssetSyncAt: Date | null;
    staleAssetDossierCount: number;
    staleOfficialSourceCount: number;
    headline: string;
    recentRuns: Array<{
      id: string;
      triggerType: ResearchSyncTriggerType;
      statusLabel: string;
      startedAt: Date;
      finishedAt: Date | null;
      officialSourceCount: number;
      assetDossierCount: number;
      staleOfficialSourceCount: number;
      staleAssetDossierCount: number;
      refreshedByActor: string | null;
      errorSummary: string | null;
    }>;
  };
  macro: {
    snapshots: Array<{
      id: string;
      title: string;
      sourceSystem: string | null;
      freshnessStatus: SourceStatus | null;
      freshnessLabel: string | null;
      summary: string | null;
      snapshotDate: Date;
      provenanceCount: number;
      coverage: string[];
      highlights: Array<{
        label: string;
        value: string;
      }>;
    }>;
  };
  markets: Array<{
    id: string;
    label: string;
    marketKey: string;
    assetClass: AssetClass | null;
    thesis: string | null;
    snapshot: {
      title: string;
      summary: string | null;
      freshnessStatus: SourceStatus | null;
      freshnessLabel: string | null;
      updatedAt: Date | null;
    } | null;
    officialHighlights: Array<{
      label: string;
      value: string;
    }>;
    openCoverageTasks: number;
  }>;
  submarkets: Array<{
    id: string;
    label: string;
    city: string | null;
    district: string | null;
    assetClass: AssetClass | null;
    thesis: string | null;
    snapshot: {
      title: string;
      summary: string | null;
      freshnessStatus: SourceStatus | null;
      freshnessLabel: string | null;
      updatedAt: Date | null;
    } | null;
    openCoverageTasks: number;
  }>;
  assetDossiers: Array<{
    assetId: string;
    assetCode: string;
    assetName: string;
    assetClass: AssetClass;
    marketThesis: string;
    approvedCoverageCount: number;
    pendingBlockerCount: number;
    latestValuationId: string | null;
    freshnessBadge: string;
    sourceFreshnessTone: 'good' | 'warn' | 'danger';
    openCoverageTasks: number;
  }>;
  optimization: Array<{
    portfolioId: string;
    portfolioCode: string;
    portfolioName: string;
    assetCount: number;
    methodologyLabel: string;
    objectiveScorePct: number;
    topMove: string;
    defensiveMove: string;
    addCount: number;
    trimCount: number;
    blockerCount: number;
    watchCount: number;
    fragileScenario: {
      label: string;
      weightedStressScore: number;
      weightedValueImpactPct: number;
      weightedDscrImpactPct: number;
      leadAssetName: string | null;
      commentary: string;
    } | null;
  }>;
  coverageQueue: Array<{
    id: string;
    title: string;
    taskType: string;
    status: TaskStatus;
    priority: TaskPriority;
    sourceSystem: string | null;
    freshnessLabel: string | null;
    scopeLabel: string;
    notes: string | null;
    dueDate: Date | null;
  }>;
};

type AssetResearchObservedInput = {
  marketIndicatorSeries?: Array<{ observationDate?: Date | null }>;
  transactionComps?: Array<{ transactionDate?: Date | null }>;
  rentComps?: Array<{ observationDate?: Date | null }>;
  macroFactors?: Array<{ observationDate?: Date | null }>;
  documents?: Array<{ updatedAt?: Date | null }>;
};

type ResearchSnapshotSurface = {
  freshnessStatus?: SourceStatus | null;
  freshnessLabel?: string | null;
  title?: string | null;
};

type CoverageTaskSurface = {
  status?: TaskStatus | null;
};

type WorkspaceSyncSnapshot = {
  latestOfficialSyncAt: Date | null;
  latestAssetSyncAt: Date | null;
  staleAssetDossierCount: number;
  staleOfficialSourceCount: number;
};

type ResearchSyncRunSurface = {
  id: string;
  triggerType: ResearchSyncTriggerType;
  statusLabel: string;
  startedAt: Date;
  finishedAt: Date | null;
  officialSourceCount: number;
  assetDossierCount: number;
  staleOfficialSourceCount: number;
  staleAssetDossierCount: number;
  refreshedByActor: string | null;
  errorSummary: string | null;
};

type ResearchScopeLink = {
  nationalMarketId: string;
  marketUniverseByKey: Map<string, { id: string; label: string }>;
  submarketByKey: Map<string, { id: string; label: string }>;
};

function pluralize(value: number, noun: string) {
  return `${value} ${noun}${value === 1 ? '' : 's'}`;
}

function summarizeDatasetEnvelope(
  definition: KoreaPublicDatasetDefinition,
  envelope: {
    status: SourceStatus;
    freshnessLabel: string;
    data: Record<string, unknown>;
  }
) {
  const coverageLabel = definition.coverage.join(', ');
  if (envelope.status === SourceStatus.FRESH) {
    return `${definition.label} is current for ${coverageLabel}.`;
  }
  if (envelope.status === SourceStatus.STALE) {
    return `${definition.label} is running on fallback coverage for ${coverageLabel}.`;
  }
  if (envelope.status === SourceStatus.MANUAL) {
    return `${definition.label} is manually staged for ${coverageLabel}.`;
  }
  return `${definition.label} needs operator attention for ${coverageLabel}.`;
}

function formatOfficialMetricValue(metric: Pick<KoreaPublicNormalizedMetric, 'value' | 'unit'>) {
  if (metric.unit === 'pct') return `${metric.value.toFixed(1)}%`;
  if (metric.unit === 'bps') return `${metric.value.toFixed(0)} bps`;
  if (metric.unit === 'sqm') return `${Math.round(metric.value).toLocaleString()} sqm`;
  if (metric.unit === 'krw_per_sqm') return `${Math.round(metric.value).toLocaleString()} KRW/sqm`;
  if (metric.unit === 'kwh_per_sqm') return `${metric.value.toFixed(1)} kWh/sqm`;
  return Number.isInteger(metric.value) ? metric.value.toLocaleString() : metric.value.toFixed(1);
}

function summarizeOfficialMetricHighlights(metrics: KoreaPublicNormalizedMetric[]) {
  return metrics.slice(0, 3).map((metric) => ({
    label: metric.label,
    value: formatOfficialMetricValue(metric)
  }));
}

function countProvenance(provenance: unknown) {
  return Array.isArray(provenance) ? provenance.length : 0;
}

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

export function flattenNumericMetrics(
  value: unknown,
  prefix = '',
  depth = 0,
  bucket: Array<{ key: string; value: number }> = []
) {
  if (depth > 2 || bucket.length >= 32) {
    return bucket;
  }

  if (typeof value === 'number' && Number.isFinite(value) && prefix) {
    bucket.push({ key: prefix, value });
    return bucket;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return bucket;
  }

  for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
    const nextKey = prefix ? `${prefix}.${entryKey}` : entryKey;
    if (typeof entryValue === 'number' && Number.isFinite(entryValue)) {
      bucket.push({ key: nextKey, value: entryValue });
      continue;
    }
    if (entryValue && typeof entryValue === 'object' && !Array.isArray(entryValue)) {
      flattenNumericMetrics(entryValue, nextKey, depth + 1, bucket);
    }
    if (bucket.length >= 32) {
      break;
    }
  }

  return bucket;
}

function inferObservationDateFromPayload(payload: Record<string, unknown>, fallbackDate: Date) {
  for (const field of ['observationDate', 'asOfDate', 'date', 'updatedAt']) {
    const raw = payload[field];
    if (typeof raw === 'string' || raw instanceof Date) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }
  return fallbackDate;
}

async function persistOfficialSourceNormalizedSeries(
  db: PrismaClient,
  definition: KoreaPublicDatasetDefinition,
  envelope: {
    data: Record<string, unknown>;
    fetchedAt: Date;
    status: SourceStatus;
  }
) {
  const observationDate = inferObservationDateFromPayload(envelope.data, envelope.fetchedAt);
  const mappedMetrics = extractKoreaPublicDatasetMetrics(definition, envelope.data);
  const metrics =
    mappedMetrics.length > 0
      ? mappedMetrics.slice(0, 16)
      : flattenNumericMetrics(envelope.data)
          .slice(0, 16)
          .map((metric) => ({
            normalizedKey: `${definition.key}.${metric.key}`,
            label: metric.key.replaceAll('.', ' ').replaceAll('_', ' '),
            value: metric.value,
            target: definition.key === 'kosis' || definition.key === 'bok_ecos' ? ('macro' as const) : ('market' as const),
            unit: null,
            assetClass: null
          }));

  if (metrics.length === 0) {
    return {
      macroSeriesCount: 0,
      marketIndicatorCount: 0,
      metrics
    };
  }

  let macroSeriesCount = 0;
  let marketIndicatorCount = 0;

  for (const metric of metrics) {
    if (metric.target === 'macro') {
      const existingSeries = await db.macroSeries.findFirst({
        where: {
          market: 'KR',
          seriesKey: metric.normalizedKey,
          observationDate,
          assetId: null
        },
        select: { id: true }
      });

      if (existingSeries) {
        await db.macroSeries.update({
          where: { id: existingSeries.id },
          data: {
            label: metric.label,
            value: metric.value,
            unit: metric.unit,
            sourceSystem: definition.sourceSystem,
            sourceStatus: envelope.status,
            sourceUpdatedAt: envelope.fetchedAt
          }
        });
      } else {
        await db.macroSeries.create({
          data: {
            market: 'KR',
            seriesKey: metric.normalizedKey,
            label: metric.label,
            frequency: 'daily',
            observationDate,
            value: metric.value,
            unit: metric.unit,
            sourceSystem: definition.sourceSystem,
            sourceStatus: envelope.status,
            sourceUpdatedAt: envelope.fetchedAt
          }
        });
      }
      macroSeriesCount += 1;
      continue;
    }

    const existingIndicator = await db.marketIndicatorSeries.findFirst({
      where: {
        market: 'KR',
        region: metric.assetClass?.toLowerCase() ?? null,
        indicatorKey: metric.normalizedKey,
        observationDate,
        assetId: null
      },
      select: { id: true }
    });

    if (existingIndicator) {
      await db.marketIndicatorSeries.update({
        where: { id: existingIndicator.id },
        data: {
          value: metric.value,
          unit: metric.unit,
          sourceSystem: definition.sourceSystem,
          sourceStatus: envelope.status
        }
      });
    } else {
      await db.marketIndicatorSeries.create({
        data: {
          market: 'KR',
          region: metric.assetClass?.toLowerCase() ?? null,
          indicatorKey: metric.normalizedKey,
          observationDate,
          value: metric.value,
          unit: metric.unit,
          sourceSystem: definition.sourceSystem,
          sourceStatus: envelope.status
        }
      });
    }
    marketIndicatorCount += 1;
  }

  return {
    macroSeriesCount,
    marketIndicatorCount,
    metrics
  };
}

function getAssetResearchObservedAt(asset: AssetResearchObservedInput) {
  const candidates: Array<Date | null | undefined> = [
    asset.marketIndicatorSeries?.[0]?.observationDate,
    asset.transactionComps?.[0]?.transactionDate,
    asset.rentComps?.[0]?.observationDate,
    asset.macroFactors?.[0]?.observationDate,
    asset.documents?.[0]?.updatedAt
  ];

  return candidates
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
}

export function shouldRefreshResearchWorkspace(status: WorkspaceSyncSnapshot) {
  return (
    !status.latestOfficialSyncAt ||
    !status.latestAssetSyncAt ||
    status.staleOfficialSourceCount > 0 ||
    status.staleAssetDossierCount > 0
  );
}

async function getResearchWorkspaceSyncSnapshot(db: PrismaClient): Promise<WorkspaceSyncSnapshot> {
  const [latestOfficialSync, latestAssetSync, assetCount, freshAssetSnapshotCount, staleOfficialSourceCount] =
    await Promise.all([
      db.researchSnapshot.findFirst({
        where: { snapshotType: 'official-source' },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true }
      }),
      db.researchSnapshot.findFirst({
        where: { snapshotType: 'asset-dossier' },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true }
      }),
      db.asset.count(),
      db.researchSnapshot.count({
        where: {
          snapshotType: 'asset-dossier',
          freshnessStatus: {
            in: [SourceStatus.FRESH, SourceStatus.STALE]
          }
        }
      }),
      db.coverageTask.count({
        where: {
          taskType: 'official-source-freshness',
          status: {
            not: TaskStatus.DONE
          }
        }
      })
    ]);

  return {
    latestOfficialSyncAt: latestOfficialSync?.updatedAt ?? null,
    latestAssetSyncAt: latestAssetSync?.updatedAt ?? null,
    staleAssetDossierCount: Math.max(0, assetCount - freshAssetSnapshotCount),
    staleOfficialSourceCount
  };
}

async function listRecentResearchSyncRuns(db: PrismaClient, limit = 6): Promise<ResearchSyncRunSurface[]> {
  return db.researchSyncRun.findMany({
    take: limit,
    orderBy: {
      startedAt: 'desc'
    },
    select: {
      id: true,
      triggerType: true,
      statusLabel: true,
      startedAt: true,
      finishedAt: true,
      officialSourceCount: true,
      assetDossierCount: true,
      staleOfficialSourceCount: true,
      staleAssetDossierCount: true,
      refreshedByActor: true,
      errorSummary: true
    }
  });
}

function buildResearchWorkspaceStatus(
  snapshot: WorkspaceSyncSnapshot,
  didRefresh: boolean,
  recentRuns: ResearchSyncRunSurface[]
): ResearchWorkspaceData['status'] {
  const headline =
    snapshot.staleOfficialSourceCount > 0
      ? `${pluralize(snapshot.staleOfficialSourceCount, 'official-source task')} still need refresh attention.`
      : snapshot.staleAssetDossierCount > 0
        ? `${pluralize(snapshot.staleAssetDossierCount, 'asset dossier')} still need research staging.`
        : didRefresh
          ? 'Research workspace was refreshed for this run.'
          : 'Research workspace is current and serving persisted coverage.';

  return {
    didRefresh,
    latestOfficialSyncAt: snapshot.latestOfficialSyncAt,
    latestAssetSyncAt: snapshot.latestAssetSyncAt,
    staleAssetDossierCount: snapshot.staleAssetDossierCount,
    staleOfficialSourceCount: snapshot.staleOfficialSourceCount,
    headline,
    recentRuns
  };
}

async function upsertCoverageTask(
  db: PrismaClient,
  input: {
    assetId?: string | null;
    marketUniverseId?: string | null;
    submarketId?: string | null;
    taskType: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    sourceSystem?: string | null;
    freshnessLabel?: string | null;
    notes?: string | null;
    dueDate?: Date | null;
  }
) {
  const existing = await db.coverageTask.findFirst({
    where: {
      assetId: input.assetId ?? null,
      marketUniverseId: input.marketUniverseId ?? null,
      submarketId: input.submarketId ?? null,
      taskType: input.taskType,
      title: input.title
    },
    select: { id: true }
  });

  if (existing) {
    return db.coverageTask.update({
      where: { id: existing.id },
      data: {
        status: input.status,
        priority: input.priority,
        sourceSystem: input.sourceSystem ?? null,
        freshnessLabel: input.freshnessLabel ?? null,
        notes: input.notes ?? null,
        dueDate: input.dueDate ?? null
      }
    });
  }

  return db.coverageTask.create({
    data: {
      assetId: input.assetId ?? null,
      marketUniverseId: input.marketUniverseId ?? null,
      submarketId: input.submarketId ?? null,
      taskType: input.taskType,
      title: input.title,
      status: input.status,
      priority: input.priority,
      sourceSystem: input.sourceSystem ?? null,
      freshnessLabel: input.freshnessLabel ?? null,
      notes: input.notes ?? null,
      dueDate: input.dueDate ?? null
    }
  });
}

async function upsertOfficialMarketSnapshots(
  db: PrismaClient,
  topology: ResearchScopeLink,
  definition: KoreaPublicDatasetDefinition,
  envelope: {
    fetchedAt: Date;
    freshnessLabel: string;
    status: SourceStatus;
    provenance: Array<Record<string, unknown>>;
  },
  metrics: KoreaPublicNormalizedMetric[]
) {
  const metricsByAssetClass = new Map<AssetClass, KoreaPublicNormalizedMetric[]>();

  for (const metric of metrics) {
    if (metric.target !== 'market' || !metric.assetClass) continue;
    const current = metricsByAssetClass.get(metric.assetClass) ?? [];
    current.push(metric);
    metricsByAssetClass.set(metric.assetClass, current);
  }

  for (const [assetClass, scopedMetrics] of metricsByAssetClass.entries()) {
    const marketKey = `kr-${assetClass.toLowerCase()}`;
    const marketUniverse = topology.marketUniverseByKey.get(marketKey);
    if (!marketUniverse) continue;

    const playbook = getAssetClassPlaybook(assetClass);
    const highlights = summarizeOfficialMetricHighlights(scopedMetrics);

    await db.researchSnapshot.upsert({
      where: {
        snapshotKey: `official:${definition.key}:${assetClass.toLowerCase()}`
      },
      update: {
        marketUniverseId: marketUniverse.id,
        snapshotType: 'market-official-source',
        title: `${definition.label} ${playbook.label} indicators`,
        summary:
          highlights.length > 0
            ? `${definition.label} is ${envelope.status === SourceStatus.FRESH ? 'current' : 'running on fallback'} for ${playbook.label.toLowerCase()} research. Highlights: ${highlights.map((item) => `${item.label} ${item.value}`).join(' / ')}.`
            : `${definition.label} is staged for ${playbook.label.toLowerCase()} research coverage.`,
        snapshotDate: envelope.fetchedAt,
        sourceSystem: definition.sourceSystem,
        freshnessStatus: envelope.status,
        freshnessLabel: envelope.freshnessLabel,
        metrics: {
          highlights,
          metricCount: scopedMetrics.length
        },
        provenance: {
          sources: [definition.sourceSystem],
          datasetKey: definition.key,
          coverage: definition.coverage,
          rawProvenanceCount: envelope.provenance.length
        }
      },
      create: {
        snapshotKey: `official:${definition.key}:${assetClass.toLowerCase()}`,
        marketUniverseId: marketUniverse.id,
        snapshotType: 'market-official-source',
        title: `${definition.label} ${playbook.label} indicators`,
        summary:
          highlights.length > 0
            ? `${definition.label} is ${envelope.status === SourceStatus.FRESH ? 'current' : 'running on fallback'} for ${playbook.label.toLowerCase()} research. Highlights: ${highlights.map((item) => `${item.label} ${item.value}`).join(' / ')}.`
            : `${definition.label} is staged for ${playbook.label.toLowerCase()} research coverage.`,
        snapshotDate: envelope.fetchedAt,
        sourceSystem: definition.sourceSystem,
        freshnessStatus: envelope.status,
        freshnessLabel: envelope.freshnessLabel,
        metrics: {
          highlights,
          metricCount: scopedMetrics.length
        },
        provenance: {
          sources: [definition.sourceSystem],
          datasetKey: definition.key,
          coverage: definition.coverage,
          rawProvenanceCount: envelope.provenance.length
        }
      }
    });

    await upsertCoverageTask(db, {
      marketUniverseId: marketUniverse.id,
      taskType: 'market-official-source',
      title: `${definition.label} ${playbook.label} coverage`,
      status: envelope.status === SourceStatus.FRESH ? TaskStatus.DONE : TaskStatus.OPEN,
      priority: envelope.status === SourceStatus.FRESH ? TaskPriority.LOW : TaskPriority.HIGH,
      sourceSystem: definition.sourceSystem,
      freshnessLabel: envelope.freshnessLabel,
      notes:
        highlights.length > 0
          ? highlights.map((item) => `${item.label} ${item.value}`).join(' / ')
          : definition.fallbackNote
    });
  }
}

async function ensureResearchTopology(db: PrismaClient): Promise<ResearchScopeLink> {
  const assets = await db.asset.findMany({
    select: {
      id: true,
      assetClass: true,
      market: true,
      address: {
        select: {
          city: true,
          district: true
        }
      },
      marketSnapshot: {
        select: {
          metroRegion: true
        }
      }
    }
  });

  const nationalMarket = await db.marketUniverse.upsert({
    where: { marketKey: 'kr-national' },
    update: {
      label: 'Korea National Research',
      country: 'KR',
      thesis: 'National macro, capital markets, and property statistics coverage.',
      statusLabel: 'ACTIVE'
    },
    create: {
      marketKey: 'kr-national',
      label: 'Korea National Research',
      country: 'KR',
      thesis: 'National macro, capital markets, and property statistics coverage.',
      statusLabel: 'ACTIVE'
    },
    select: {
      id: true
    }
  });

  const universeMap = new Map<string, { id: string; label: string }>();
  const submarketMap = new Map<string, { id: string; label: string }>();
  const assetClasses = [...new Set(assets.map((asset) => asset.assetClass).filter(Boolean))] as AssetClass[];

  for (const assetClass of assetClasses) {
    const playbook = getAssetClassPlaybook(assetClass);
    const marketKey = `kr-${assetClass.toLowerCase()}`;
    const universe = await db.marketUniverse.upsert({
      where: { marketKey },
      update: {
        label: `Korea ${playbook.label}`,
        country: 'KR',
        assetClass,
        thesis: `${playbook.marketHeadline} for ${playbook.label.toLowerCase()} assets in Korea.`,
        statusLabel: 'ACTIVE'
      },
      create: {
        marketKey,
        label: `Korea ${playbook.label}`,
        country: 'KR',
        assetClass,
        thesis: `${playbook.marketHeadline} for ${playbook.label.toLowerCase()} assets in Korea.`,
        statusLabel: 'ACTIVE'
      },
      select: {
        id: true,
        label: true
      }
    });
    universeMap.set(marketKey, universe);

    const classAssets = assets.filter((asset) => asset.assetClass === assetClass);
    const rawSubmarkets = [
      ...new Set(
        classAssets
          .map((asset) => asset.marketSnapshot?.metroRegion ?? asset.address?.district ?? asset.address?.city)
          .filter(Boolean)
      )
    ] as string[];

    for (const label of rawSubmarkets) {
      const submarketKey = slugify(label);
      const sampleAsset = classAssets.find(
        (asset) => (asset.marketSnapshot?.metroRegion ?? asset.address?.district ?? asset.address?.city) === label
      );
      const submarket = await db.submarket.upsert({
        where: {
          marketUniverseId_submarketKey: {
            marketUniverseId: universe.id,
            submarketKey
          }
        },
        update: {
          label,
          city: sampleAsset?.address?.city ?? null,
          district: sampleAsset?.address?.district ?? null,
          assetClass,
          thesis: `${label} ${playbook.label.toLowerCase()} submarket coverage.`,
          statusLabel: 'ACTIVE'
        },
        create: {
          marketUniverseId: universe.id,
          submarketKey,
          label,
          city: sampleAsset?.address?.city ?? null,
          district: sampleAsset?.address?.district ?? null,
          assetClass,
          thesis: `${label} ${playbook.label.toLowerCase()} submarket coverage.`,
          statusLabel: 'ACTIVE'
        },
        select: {
          id: true,
          label: true
        }
      });
      submarketMap.set(`${marketKey}:${submarketKey}`, submarket);
    }
  }

  return {
    nationalMarketId: nationalMarket.id,
    marketUniverseByKey: universeMap,
    submarketByKey: submarketMap
  };
}

async function syncOfficialSourceResearch(db: PrismaClient, topology: ResearchScopeLink) {
  const adapter = createKoreaPublicDatasetAdapter(createPrismaSourceCacheStore(db));
  const definitions = listKoreaPublicDatasetDefinitions();
  let macroSeriesCount = 0;
  let marketIndicatorCount = 0;

  for (const definition of definitions) {
    const envelope = await adapter.fetch(definition.key, `research:${definition.key}:kr`, {
      country: 'KR'
    });
    const persistence = await persistOfficialSourceNormalizedSeries(db, definition, envelope);
    macroSeriesCount += persistence.macroSeriesCount;
    marketIndicatorCount += persistence.marketIndicatorCount;

    await db.researchSnapshot.upsert({
      where: {
        snapshotKey: `official:${definition.key}:kr`
      },
      update: {
        marketUniverseId: topology.nationalMarketId,
        snapshotType: 'official-source',
        title: definition.label,
        summary: summarizeDatasetEnvelope(definition, envelope),
        snapshotDate: envelope.fetchedAt,
        sourceSystem: definition.sourceSystem,
        freshnessStatus: envelope.status,
        freshnessLabel: envelope.freshnessLabel,
        metrics: {
          raw: envelope.data as Prisma.InputJsonValue,
          highlights: summarizeOfficialMetricHighlights(persistence.metrics),
          metricCount: persistence.metrics.length
        } as Prisma.InputJsonValue,
        provenance: envelope.provenance as Prisma.InputJsonValue
      },
      create: {
        snapshotKey: `official:${definition.key}:kr`,
        marketUniverseId: topology.nationalMarketId,
        snapshotType: 'official-source',
        title: definition.label,
        summary: summarizeDatasetEnvelope(definition, envelope),
        snapshotDate: envelope.fetchedAt,
        sourceSystem: definition.sourceSystem,
        freshnessStatus: envelope.status,
        freshnessLabel: envelope.freshnessLabel,
        metrics: {
          raw: envelope.data as Prisma.InputJsonValue,
          highlights: summarizeOfficialMetricHighlights(persistence.metrics),
          metricCount: persistence.metrics.length
        } as Prisma.InputJsonValue,
        provenance: envelope.provenance as Prisma.InputJsonValue
      }
    });

    await upsertOfficialMarketSnapshots(db, topology, definition, envelope, persistence.metrics);

    await upsertCoverageTask(db, {
      marketUniverseId: topology.nationalMarketId,
      taskType: 'official-source-freshness',
      title: `${definition.label} freshness and coverage`,
      status: envelope.status === SourceStatus.FRESH ? TaskStatus.DONE : TaskStatus.OPEN,
      priority: envelope.status === SourceStatus.FRESH ? TaskPriority.LOW : TaskPriority.HIGH,
      sourceSystem: definition.sourceSystem,
      freshnessLabel: envelope.freshnessLabel,
      notes:
        envelope.status === SourceStatus.FRESH
          ? `${definition.label} is current across ${definition.coverage.join(', ')}.`
          : definition.fallbackNote
    });
  }

  return {
    officialSourceCount: definitions.length,
    macroSeriesCount,
    marketIndicatorCount
  };
}

async function syncAssetAndMarketResearch(db: PrismaClient, topology: ResearchScopeLink) {
  const assets = await db.asset.findMany({
    include: {
      ...assetBundleInclude,
      researchSnapshots: {
        orderBy: {
          snapshotDate: 'desc'
        },
        take: 6
      },
      coverageTasks: {
        orderBy: {
          updatedAt: 'desc'
        },
        take: 12
      }
    }
  });

  const marketAccumulator = new Map<
    string,
    {
      marketUniverseId: string;
      assetClass: AssetClass;
      assetCount: number;
      approvedEvidence: number;
      pendingBlockers: number;
      transactionComps: number;
      rentComps: number;
      lastObservedAt: Date | null;
      latestThesis: string | null;
    }
  >();
  const submarketAccumulator = new Map<
    string,
    {
      submarketId: string;
      assetClass: AssetClass;
      assetCount: number;
      approvedEvidence: number;
      pendingBlockers: number;
      lastObservedAt: Date | null;
      latestThesis: string | null;
    }
  >();

  for (const asset of assets) {
    const dossier = buildAssetResearchDossier(asset);
    const reviewSummary = buildAssetEvidenceReviewSummary(asset);
    const playbook = getAssetClassPlaybook(asset.assetClass);
    const marketKey = `kr-${asset.assetClass.toLowerCase()}`;
    const marketUniverse = topology.marketUniverseByKey.get(marketKey);
    const rawSubmarket = asset.marketSnapshot?.metroRegion ?? asset.address?.district ?? asset.address?.city ?? null;
    const submarketKey = rawSubmarket ? `${marketKey}:${slugify(rawSubmarket)}` : null;
    const submarket = submarketKey ? topology.submarketByKey.get(submarketKey) : null;
    const observedAt = getAssetResearchObservedAt(asset);
    const freshness = deriveResearchFreshness(observedAt);

    await db.researchSnapshot.upsert({
      where: {
        snapshotKey: `asset-dossier:${asset.id}`
      },
      update: {
        assetId: asset.id,
        marketUniverseId: marketUniverse?.id ?? null,
        submarketId: submarket?.id ?? null,
        snapshotType: 'asset-dossier',
        title: `${asset.assetCode} research dossier`,
        summary: dossier.marketThesis,
        snapshotDate: observedAt ?? asset.updatedAt,
        sourceSystem: 'research-dossier',
        freshnessStatus: freshness.status,
        freshnessLabel: freshness.label,
        metrics: {
          approvedCoverageCount: dossier.micro.approvedCoverageCount,
          pendingBlockerCount: dossier.micro.pendingBlockers.length,
          transactionCompCount: asset.transactionComps.length,
          rentCompCount: asset.rentComps.length,
          latestValuationId: dossier.latestValuationId,
          reviewPacketFingerprint: dossier.reviewPacketFingerprint
        },
        provenance: {
          sources: [
            ...new Set([
              'macroFactors',
              'marketIndicatorSeries',
              'transactionComps',
              'rentComps',
              'documents',
              reviewSummary.totals.approved > 0 ? 'approvedEvidence' : null
            ].filter(Boolean))
          ],
          latestDocumentHash: dossier.documents.latestDocumentHash,
          chainAnchorReference: dossier.chainAnchorReference
        }
      },
      create: {
        snapshotKey: `asset-dossier:${asset.id}`,
        assetId: asset.id,
        marketUniverseId: marketUniverse?.id ?? null,
        submarketId: submarket?.id ?? null,
        snapshotType: 'asset-dossier',
        title: `${asset.assetCode} research dossier`,
        summary: dossier.marketThesis,
        snapshotDate: observedAt ?? asset.updatedAt,
        sourceSystem: 'research-dossier',
        freshnessStatus: freshness.status,
        freshnessLabel: freshness.label,
        metrics: {
          approvedCoverageCount: dossier.micro.approvedCoverageCount,
          pendingBlockerCount: dossier.micro.pendingBlockers.length,
          transactionCompCount: asset.transactionComps.length,
          rentCompCount: asset.rentComps.length,
          latestValuationId: dossier.latestValuationId,
          reviewPacketFingerprint: dossier.reviewPacketFingerprint
        },
        provenance: {
          sources: [
            ...new Set([
              'macroFactors',
              'marketIndicatorSeries',
              'transactionComps',
              'rentComps',
              'documents',
              reviewSummary.totals.approved > 0 ? 'approvedEvidence' : null
            ].filter(Boolean))
          ],
          latestDocumentHash: dossier.documents.latestDocumentHash,
          chainAnchorReference: dossier.chainAnchorReference
        }
      }
    });

    await upsertCoverageTask(db, {
      assetId: asset.id,
      marketUniverseId: marketUniverse?.id ?? null,
      submarketId: submarket?.id ?? null,
      taskType: 'asset-research-coverage',
      title: `${asset.assetCode} coverage queue`,
      status:
        dossier.micro.pendingBlockers.length > 0 ||
        asset.transactionComps.length === 0 ||
        asset.rentComps.length === 0
          ? TaskStatus.OPEN
          : TaskStatus.DONE,
      priority:
        dossier.micro.pendingBlockers.length > 0
          ? TaskPriority.HIGH
          : asset.transactionComps.length === 0 || asset.rentComps.length === 0
            ? TaskPriority.MEDIUM
            : TaskPriority.LOW,
      freshnessLabel: freshness.label,
      notes:
        dossier.micro.pendingBlockers.length > 0
          ? dossier.micro.pendingBlockers.slice(0, 3).join(' / ')
          : asset.transactionComps.length === 0 || asset.rentComps.length === 0
            ? `Comp coverage is thin for ${playbook.label.toLowerCase()} underwriting.`
            : 'Research dossier is currently covered.'
    });

    if (marketUniverse) {
      const current = marketAccumulator.get(marketKey) ?? {
        marketUniverseId: marketUniverse.id,
        assetClass: asset.assetClass,
        assetCount: 0,
        approvedEvidence: 0,
        pendingBlockers: 0,
        transactionComps: 0,
        rentComps: 0,
        lastObservedAt: null,
        latestThesis: null
      };
      current.assetCount += 1;
      current.approvedEvidence += reviewSummary.totals.approved;
      current.pendingBlockers += dossier.micro.pendingBlockers.length;
      current.transactionComps += asset.transactionComps.length;
      current.rentComps += asset.rentComps.length;
      current.lastObservedAt =
        current.lastObservedAt && observedAt
          ? current.lastObservedAt.getTime() >= observedAt.getTime()
            ? current.lastObservedAt
            : observedAt
          : current.lastObservedAt ?? observedAt;
      current.latestThesis = dossier.marketThesis;
      marketAccumulator.set(marketKey, current);
    }

    if (submarket && submarketKey) {
      const current = submarketAccumulator.get(submarketKey) ?? {
        submarketId: submarket.id,
        assetClass: asset.assetClass,
        assetCount: 0,
        approvedEvidence: 0,
        pendingBlockers: 0,
        lastObservedAt: null,
        latestThesis: null
      };
      current.assetCount += 1;
      current.approvedEvidence += reviewSummary.totals.approved;
      current.pendingBlockers += dossier.micro.pendingBlockers.length;
      current.lastObservedAt =
        current.lastObservedAt && observedAt
          ? current.lastObservedAt.getTime() >= observedAt.getTime()
            ? current.lastObservedAt
            : observedAt
          : current.lastObservedAt ?? observedAt;
      current.latestThesis = dossier.marketThesis;
      submarketAccumulator.set(submarketKey, current);
    }
  }

  for (const [marketKey, item] of marketAccumulator.entries()) {
    const playbook = getAssetClassPlaybook(item.assetClass);
    const freshness = deriveResearchFreshness(item.lastObservedAt);
    await db.researchSnapshot.upsert({
      where: {
        snapshotKey: `market:${marketKey}`
      },
      update: {
        marketUniverseId: item.marketUniverseId,
        snapshotType: 'market-thesis',
        title: `Korea ${playbook.label} market thesis`,
        summary: `${pluralize(item.assetCount, 'asset')} mapped with ${pluralize(item.transactionComps, 'transaction comp')} and ${pluralize(item.rentComps, 'rent comp')}. ${item.pendingBlockers > 0 ? `${pluralize(item.pendingBlockers, 'pending blocker')} remain in the approved evidence queue.` : 'Approved micro evidence is broadly in place.'}`,
        snapshotDate: item.lastObservedAt ?? new Date(),
        sourceSystem: 'research-market-aggregate',
        freshnessStatus: freshness.status,
        freshnessLabel: freshness.label,
        metrics: {
          assetCount: item.assetCount,
          approvedEvidence: item.approvedEvidence,
          pendingBlockers: item.pendingBlockers,
          transactionCompCount: item.transactionComps,
          rentCompCount: item.rentComps
        },
        provenance: {
          sources: ['transactionComps', 'rentComps', 'marketIndicatorSeries', 'approvedEvidence'],
          thesis: item.latestThesis
        }
      },
      create: {
        snapshotKey: `market:${marketKey}`,
        marketUniverseId: item.marketUniverseId,
        snapshotType: 'market-thesis',
        title: `Korea ${playbook.label} market thesis`,
        summary: `${pluralize(item.assetCount, 'asset')} mapped with ${pluralize(item.transactionComps, 'transaction comp')} and ${pluralize(item.rentComps, 'rent comp')}. ${item.pendingBlockers > 0 ? `${pluralize(item.pendingBlockers, 'pending blocker')} remain in the approved evidence queue.` : 'Approved micro evidence is broadly in place.'}`,
        snapshotDate: item.lastObservedAt ?? new Date(),
        sourceSystem: 'research-market-aggregate',
        freshnessStatus: freshness.status,
        freshnessLabel: freshness.label,
        metrics: {
          assetCount: item.assetCount,
          approvedEvidence: item.approvedEvidence,
          pendingBlockers: item.pendingBlockers,
          transactionCompCount: item.transactionComps,
          rentCompCount: item.rentComps
        },
        provenance: {
          sources: ['transactionComps', 'rentComps', 'marketIndicatorSeries', 'approvedEvidence'],
          thesis: item.latestThesis
        }
      }
    });
  }

  for (const [submarketKey, item] of submarketAccumulator.entries()) {
    const playbook = getAssetClassPlaybook(item.assetClass);
    const freshness = deriveResearchFreshness(item.lastObservedAt);
    await db.researchSnapshot.upsert({
      where: {
        snapshotKey: `submarket:${submarketKey}`
      },
      update: {
        submarketId: item.submarketId,
        snapshotType: 'submarket-thesis',
        title: `${playbook.label} submarket thesis`,
        summary: `${pluralize(item.assetCount, 'asset')} tracked in this submarket with ${item.pendingBlockers > 0 ? `${pluralize(item.pendingBlockers, 'pending blocker')} still open.` : 'approved evidence coverage broadly in place.'}`,
        snapshotDate: item.lastObservedAt ?? new Date(),
        sourceSystem: 'research-submarket-aggregate',
        freshnessStatus: freshness.status,
        freshnessLabel: freshness.label,
        metrics: {
          assetCount: item.assetCount,
          approvedEvidence: item.approvedEvidence,
          pendingBlockers: item.pendingBlockers
        },
        provenance: {
          sources: ['approvedEvidence', 'marketIndicatorSeries', 'transactionComps', 'rentComps'],
          thesis: item.latestThesis
        }
      },
      create: {
        snapshotKey: `submarket:${submarketKey}`,
        submarketId: item.submarketId,
        snapshotType: 'submarket-thesis',
        title: `${playbook.label} submarket thesis`,
        summary: `${pluralize(item.assetCount, 'asset')} tracked in this submarket with ${item.pendingBlockers > 0 ? `${pluralize(item.pendingBlockers, 'pending blocker')} still open.` : 'approved evidence coverage broadly in place.'}`,
        snapshotDate: item.lastObservedAt ?? new Date(),
        sourceSystem: 'research-submarket-aggregate',
        freshnessStatus: freshness.status,
        freshnessLabel: freshness.label,
        metrics: {
          assetCount: item.assetCount,
          approvedEvidence: item.approvedEvidence,
          pendingBlockers: item.pendingBlockers
        },
        provenance: {
          sources: ['approvedEvidence', 'marketIndicatorSeries', 'transactionComps', 'rentComps'],
          thesis: item.latestThesis
        }
      }
    });
  }

  const openCoverageTaskCount = await db.coverageTask.count({
    where: {
      status: {
        not: TaskStatus.DONE
      }
    }
  });

  return {
    assetDossierCount: assets.length,
    openCoverageTaskCount
  };
}

export async function syncResearchWorkspace(db: PrismaClient = prisma) {
  const topology = await ensureResearchTopology(db);
  const officialSync = await syncOfficialSourceResearch(db, topology);
  const assetSync = await syncAssetAndMarketResearch(db, topology);
  return {
    topology,
    officialSync,
    assetSync
  };
}

export async function runResearchWorkspaceSync(
  input: {
    triggerType?: ResearchSyncTriggerType;
    actorIdentifier?: string | null;
  } = {},
  db: PrismaClient = prisma
) {
  const triggerType = input.triggerType ?? ResearchSyncTriggerType.WORKSPACE_REFRESH;
  const startedAt = new Date();
  const run = await db.researchSyncRun.create({
    data: {
      triggerType,
      statusLabel: 'RUNNING',
      refreshedByActor: input.actorIdentifier?.trim() || null
    }
  });

  try {
    const result = await syncResearchWorkspace(db);
    const snapshot = await getResearchWorkspaceSyncSnapshot(db);
    const finishedAt = new Date();

    return await db.researchSyncRun.update({
      where: { id: run.id },
      data: {
        statusLabel: 'SUCCESS',
        startedAt,
        finishedAt,
        latestOfficialSyncAt: snapshot.latestOfficialSyncAt,
        latestAssetSyncAt: snapshot.latestAssetSyncAt,
        officialSourceCount: result.officialSync.officialSourceCount,
        assetDossierCount: result.assetSync.assetDossierCount,
        staleOfficialSourceCount: snapshot.staleOfficialSourceCount,
        staleAssetDossierCount: snapshot.staleAssetDossierCount,
        coverageTaskCount: result.assetSync.openCoverageTaskCount,
        metadata: {
          macroSeriesCount: result.officialSync.macroSeriesCount,
          marketIndicatorCount: result.officialSync.marketIndicatorCount
        }
      }
    });
  } catch (error) {
    const failedAt = new Date();
    const message = error instanceof Error ? error.message : 'research sync failed';
    await db.researchSyncRun.update({
      where: { id: run.id },
      data: {
        statusLabel: 'FAILED',
        finishedAt: failedAt,
        errorSummary: message
      }
    });
    throw error;
  }
}

export function buildResearchPrioritySignal(
  asset: AssetResearchObservedInput & {
    id: string;
    name: string;
    assetCode: string;
    assetClass: AssetClass;
    coverageTasks?: CoverageTaskSurface[];
    [key: string]: unknown;
  }
) {
  const dossier = buildAssetResearchDossier(asset as Parameters<typeof buildAssetResearchDossier>[0]);
  const taskCount = (asset.coverageTasks ?? []).filter((task: { status?: TaskStatus | null }) => task.status !== TaskStatus.DONE).length;
  const blockerCount = dossier.pendingBlockers.length;
  const freshnessStatus = dossier.freshness.status;

  const score =
    100 -
    blockerCount * 10 -
    taskCount * 8 -
    (freshnessStatus === SourceStatus.FRESH
      ? 0
      : freshnessStatus === SourceStatus.STALE
        ? 10
        : 18);

  return {
    scorePct: Math.max(15, Math.min(95, score)),
    blockerCount,
    taskCount,
    freshnessStatus,
    summary:
      blockerCount > 0
        ? `${pluralize(blockerCount, 'review blocker')} still need attention before research can support prioritization.`
        : taskCount > 0
          ? `${pluralize(taskCount, 'coverage task')} remain open in the research queue.`
          : `Research fabric is current for ${asset.assetCode}.`
  };
}

export function buildResearchCoverageSurface(input: {
  assetCode: string;
  researchSnapshots?: ResearchSnapshotSurface[] | null;
  coverageTasks?: CoverageTaskSurface[] | null;
}) {
  const latestSnapshot = input.researchSnapshots?.[0] ?? null;
  const openTaskCount = (input.coverageTasks ?? []).filter((task) => task.status !== TaskStatus.DONE).length;
  const freshnessStatus = latestSnapshot?.freshnessStatus ?? SourceStatus.FAILED;
  const freshnessLabel = latestSnapshot?.freshnessLabel ?? 'missing coverage';

  return {
    freshnessStatus,
    freshnessLabel,
    openTaskCount,
    headline:
      openTaskCount > 0
        ? `${input.assetCode} still has ${pluralize(openTaskCount, 'open research task')}.`
        : `${input.assetCode} research coverage is ${freshnessLabel}.`
  };
}

export async function getResearchWorkspaceData(db: PrismaClient = prisma): Promise<ResearchWorkspaceData> {
  const initialStatus = await getResearchWorkspaceSyncSnapshot(db);
  const finalStatus = initialStatus;

  const [macroSnapshots, marketUniverses, submarkets, assets, portfolios, coverageTasks, recentRuns] = await Promise.all([
    db.researchSnapshot.findMany({
      where: {
        snapshotType: 'official-source'
      },
      orderBy: {
        snapshotDate: 'desc'
      }
    }),
    db.marketUniverse.findMany({
      include: {
        researchSnapshots: {
          where: {
            snapshotType: {
              in: ['market-thesis', 'market-official-source']
            }
          },
          orderBy: {
            snapshotDate: 'desc'
          },
          take: 4
        },
        coverageTasks: {
          where: {
            status: {
              not: TaskStatus.DONE
            }
          }
        }
      },
      orderBy: {
        label: 'asc'
      }
    }),
    db.submarket.findMany({
      include: {
        researchSnapshots: {
          where: {
            snapshotType: 'submarket-thesis'
          },
          orderBy: {
            snapshotDate: 'desc'
          },
          take: 1
        },
        coverageTasks: {
          where: {
            status: {
              not: TaskStatus.DONE
            }
          }
        }
      },
      orderBy: [{ city: 'asc' }, { label: 'asc' }]
    }),
    db.asset.findMany({
      include: {
        ...assetBundleInclude,
        researchSnapshots: {
          orderBy: {
            snapshotDate: 'desc'
          },
          take: 2
        },
        coverageTasks: {
          orderBy: {
            updatedAt: 'desc'
          },
          take: 12
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    }),
    listPortfolios(db),
    db.coverageTask.findMany({
      where: {
        status: {
          not: TaskStatus.DONE
        }
      },
      include: {
        asset: {
          select: {
            assetCode: true,
            name: true
          }
        },
        marketUniverse: {
          select: {
            label: true
          }
        },
        submarket: {
          select: {
            label: true
          }
        }
      },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { updatedAt: 'desc' }]
    }),
    listRecentResearchSyncRuns(db)
  ]);

  return {
    tabs: ['macro', 'markets', 'submarkets', 'assets', 'optimization', 'coverage'],
    status: buildResearchWorkspaceStatus(finalStatus, false, recentRuns),
    macro: {
      snapshots: macroSnapshots.map((snapshot) => {
        const datasetDefinition = listKoreaPublicDatasetDefinitions().find(
          (item) => item.sourceSystem === snapshot.sourceSystem
        );
        return {
          id: snapshot.id,
          title: snapshot.title,
          sourceSystem: snapshot.sourceSystem,
          freshnessStatus: snapshot.freshnessStatus,
          freshnessLabel: snapshot.freshnessLabel,
          summary: snapshot.summary,
          snapshotDate: snapshot.snapshotDate,
          provenanceCount: countProvenance(snapshot.provenance),
          coverage: datasetDefinition?.coverage ?? [],
          highlights: extractSnapshotHighlights(snapshot.metrics)
        };
      })
    },
    markets: marketUniverses
      .filter((item) => item.marketKey !== 'kr-national')
      .map((marketUniverse) => {
        const thesisSnapshot = marketUniverse.researchSnapshots.find((item) => item.snapshotType === 'market-thesis');

        return {
          id: marketUniverse.id,
          label: marketUniverse.label,
          marketKey: marketUniverse.marketKey,
          assetClass: marketUniverse.assetClass,
          thesis: marketUniverse.thesis,
          snapshot: thesisSnapshot
            ? {
                title: thesisSnapshot.title,
                summary: thesisSnapshot.summary,
                freshnessStatus: thesisSnapshot.freshnessStatus,
                freshnessLabel: thesisSnapshot.freshnessLabel,
                updatedAt: thesisSnapshot.snapshotDate
              }
            : null,
          officialHighlights: marketUniverse.researchSnapshots
            .filter((item) => item.snapshotType === 'market-official-source')
            .flatMap((item) => extractSnapshotHighlights(item.metrics))
            .slice(0, 4),
          openCoverageTasks: marketUniverse.coverageTasks.length
        };
      }),
    submarkets: submarkets.map((submarket) => ({
      id: submarket.id,
      label: submarket.label,
      city: submarket.city,
      district: submarket.district,
      assetClass: submarket.assetClass,
      thesis: submarket.thesis,
      snapshot: submarket.researchSnapshots[0]
        ? {
            title: submarket.researchSnapshots[0].title,
            summary: submarket.researchSnapshots[0].summary,
            freshnessStatus: submarket.researchSnapshots[0].freshnessStatus,
            freshnessLabel: submarket.researchSnapshots[0].freshnessLabel,
            updatedAt: submarket.researchSnapshots[0].snapshotDate
          }
        : null,
      openCoverageTasks: submarket.coverageTasks.length
    })),
    assetDossiers: assets.map((asset) => {
      const dossier = buildAssetResearchDossier(asset);
      return {
        assetId: asset.id,
        assetCode: asset.assetCode,
        assetName: asset.name,
        assetClass: asset.assetClass,
        marketThesis: dossier.marketThesis,
        approvedCoverageCount: dossier.micro.approvedCoverageCount,
        pendingBlockerCount: dossier.pendingBlockers.length,
        latestValuationId: dossier.latestValuationId,
        freshnessBadge: dossier.freshness.headline,
        sourceFreshnessTone: getFreshnessTone(dossier.freshness.status),
        openCoverageTasks: dossier.coverage.openTaskCount
      };
    }),
    optimization: portfolios.map((portfolio) => {
      const item = buildPortfolioOptimizationWorkspaceItem(portfolio);
      return {
        ...item,
        fragileScenario: item.fragileScenario
          ? {
              label: item.fragileScenario.label,
              weightedStressScore: item.fragileScenario.weightedStressScore,
              weightedValueImpactPct: item.fragileScenario.weightedValueImpactPct,
              weightedDscrImpactPct: item.fragileScenario.weightedDscrImpactPct,
              leadAssetName: item.fragileScenario.leadAssetName,
              commentary: item.fragileScenario.commentary
            }
          : null
      };
    }),
    coverageQueue: coverageTasks.map((task) => ({
      id: task.id,
      title: task.title,
      taskType: task.taskType,
      status: task.status,
      priority: task.priority,
      sourceSystem: task.sourceSystem,
      freshnessLabel: task.freshnessLabel,
      scopeLabel:
        task.asset?.assetCode ??
        task.submarket?.label ??
        task.marketUniverse?.label ??
        'Research workspace',
      notes: task.notes,
      dueDate: task.dueDate
    }))
  };
}
