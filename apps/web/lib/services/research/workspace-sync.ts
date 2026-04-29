/**
 * Research workspace sync drivers.
 *
 * Extracted from workspace.ts to keep the orchestrator file focused on the
 * public API (syncResearchWorkspace, runResearchWorkspaceSync,
 * getResearchWorkspaceData, ...). Everything in this module is the
 * lower-level machinery that talks to adapters, persists curated rows, and
 * emits coverage tasks — i.e. the stuff that grows when we add a new
 * dataset and that the orchestrator should never have to know about.
 *
 * Public surface:
 *   - ensureResearchTopology      bootstraps MarketUniverse + Submarket
 *                                 rows for the demo asset graph and
 *                                 returns lookup maps used by both syncs.
 *   - syncOfficialSourceResearch  drains every Korea-public dataset
 *                                 definition into MacroSeries /
 *                                 MarketIndicatorSeries / ResearchSnapshot
 *                                 and updates the matching CoverageTask.
 *   - syncAssetAndMarketResearch  per-asset dossier rebuild that emits
 *                                 HOUSE-view ResearchSnapshots and
 *                                 asset-level CoverageTasks.
 *   - ResearchScopeLink           the topology shape the syncs share.
 */
import {
  AssetClass,
  type Prisma,
  type PrismaClient,
  SourceStatus,
  TaskPriority,
  TaskStatus
} from '@prisma/client';
import { getAssetClassPlaybook } from '@/lib/asset-class/playbook';
import { assetBundleInclude } from '@/lib/services/assets';
import { buildAssetResearchDossier } from '@/lib/services/research/dossier';
import { deriveResearchFreshness } from '@/lib/services/research/freshness';
import { buildAssetEvidenceReviewSummary } from '@/lib/services/review';
import {
  createKoreaPublicDatasetAdapter,
  extractKoreaPublicDatasetMetrics,
  listKoreaPublicDatasetDefinitions,
  type KoreaPublicDatasetDefinition,
  type KoreaPublicNormalizedMetric
} from '@/lib/sources/adapters/korea-public';
import { createPrismaSourceCacheStore } from '@/lib/sources/cache';
import { slugify } from '@/lib/utils';
import {
  flattenNumericMetrics,
  inferObservationDateFromPayload,
  pluralize,
  summarizeDatasetEnvelope,
  summarizeOfficialMetricHighlights
} from './workspace-formatting';

export type ResearchScopeLink = {
  nationalMarketId: string;
  marketUniverseByKey: Map<string, { id: string; label: string }>;
  submarketByKey: Map<string, { id: string; label: string }>;
};

export type AssetResearchObservedInput = {
  marketIndicatorSeries?: Array<{ observationDate?: Date | null }>;
  transactionComps?: Array<{ transactionDate?: Date | null }>;
  rentComps?: Array<{ observationDate?: Date | null }>;
  macroFactors?: Array<{ observationDate?: Date | null }>;
  documents?: Array<{ updatedAt?: Date | null }>;
};

/**
 * Pick the most recent date observed across the asset's curated research
 * inputs. Used by the per-asset sync to decide freshness, and re-used by
 * buildResearchPrioritySignal in workspace.ts for the same purpose.
 */
export function getAssetResearchObservedAt(asset: AssetResearchObservedInput) {
  const candidates: Array<Date | null | undefined> = [
    asset.marketIndicatorSeries?.[0]?.observationDate,
    asset.transactionComps?.[0]?.transactionDate,
    asset.rentComps?.[0]?.observationDate,
    asset.macroFactors?.[0]?.observationDate,
    asset.documents?.[0]?.updatedAt
  ];

  return (
    candidates
      .filter((value): value is Date => value instanceof Date)
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null
  );
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
            target:
              definition.key === 'kosis' || definition.key === 'bok_ecos'
                ? ('macro' as const)
                : ('market' as const),
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
        viewType: 'SOURCE',
        approvalStatus: 'APPROVED',
        title: `${definition.label} ${playbook.label} indicators`,
        summary:
          highlights.length > 0
            ? `${definition.label} is ${envelope.status === SourceStatus.FRESH ? 'current' : 'running on fallback'} for ${playbook.label.toLowerCase()} research. Highlights: ${highlights.map((item) => `${item.label} ${item.value}`).join(' / ')}.`
            : `${definition.label} is staged for ${playbook.label.toLowerCase()} research coverage.`,
        snapshotDate: envelope.fetchedAt,
        sourceSystem: definition.sourceSystem,
        freshnessStatus: envelope.status,
        freshnessLabel: envelope.freshnessLabel,
        approvedAt: envelope.fetchedAt,
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
        viewType: 'SOURCE',
        approvalStatus: 'APPROVED',
        title: `${definition.label} ${playbook.label} indicators`,
        summary:
          highlights.length > 0
            ? `${definition.label} is ${envelope.status === SourceStatus.FRESH ? 'current' : 'running on fallback'} for ${playbook.label.toLowerCase()} research. Highlights: ${highlights.map((item) => `${item.label} ${item.value}`).join(' / ')}.`
            : `${definition.label} is staged for ${playbook.label.toLowerCase()} research coverage.`,
        snapshotDate: envelope.fetchedAt,
        sourceSystem: definition.sourceSystem,
        freshnessStatus: envelope.status,
        freshnessLabel: envelope.freshnessLabel,
        approvedAt: envelope.fetchedAt,
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
export async function ensureResearchTopology(db: PrismaClient): Promise<ResearchScopeLink> {
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
  const assetClasses = [
    ...new Set(assets.map((asset) => asset.assetClass).filter(Boolean))
  ] as AssetClass[];

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
          .map(
            (asset) =>
              asset.marketSnapshot?.metroRegion ?? asset.address?.district ?? asset.address?.city
          )
          .filter(Boolean)
      )
    ] as string[];

    for (const label of rawSubmarkets) {
      const submarketKey = slugify(label);
      const sampleAsset = classAssets.find(
        (asset) =>
          (asset.marketSnapshot?.metroRegion ?? asset.address?.district ?? asset.address?.city) ===
          label
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

export async function syncOfficialSourceResearch(db: PrismaClient, topology: ResearchScopeLink) {
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
        viewType: 'SOURCE',
        approvalStatus: 'APPROVED',
        title: definition.label,
        summary: summarizeDatasetEnvelope(definition, envelope),
        snapshotDate: envelope.fetchedAt,
        sourceSystem: definition.sourceSystem,
        freshnessStatus: envelope.status,
        freshnessLabel: envelope.freshnessLabel,
        approvedAt: envelope.fetchedAt,
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
        viewType: 'SOURCE',
        approvalStatus: 'APPROVED',
        title: definition.label,
        summary: summarizeDatasetEnvelope(definition, envelope),
        snapshotDate: envelope.fetchedAt,
        sourceSystem: definition.sourceSystem,
        freshnessStatus: envelope.status,
        freshnessLabel: envelope.freshnessLabel,
        approvedAt: envelope.fetchedAt,
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

export async function syncAssetAndMarketResearch(db: PrismaClient, topology: ResearchScopeLink) {
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
    const rawSubmarket =
      asset.marketSnapshot?.metroRegion ?? asset.address?.district ?? asset.address?.city ?? null;
    const submarketKey = rawSubmarket ? `${marketKey}:${slugify(rawSubmarket)}` : null;
    const submarket = submarketKey ? topology.submarketByKey.get(submarketKey) : null;
    const observedAt = getAssetResearchObservedAt(asset);
    const freshness = deriveResearchFreshness(observedAt);
    const assetHouseViewStatus = 'DRAFT';

    await db.researchSnapshot.upsert({
      where: {
        snapshotKey: `asset-dossier:${asset.id}`
      },
      update: {
        assetId: asset.id,
        marketUniverseId: marketUniverse?.id ?? null,
        submarketId: submarket?.id ?? null,
        snapshotType: 'asset-dossier',
        viewType: 'HOUSE',
        approvalStatus: assetHouseViewStatus,
        title: `${asset.assetCode} research dossier`,
        summary: dossier.marketThesis,
        snapshotDate: observedAt ?? asset.updatedAt,
        sourceSystem: 'research-dossier',
        freshnessStatus: freshness.status,
        freshnessLabel: freshness.label,
        approvedAt: null,
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
            ...new Set(
              [
                'macroFactors',
                'marketIndicatorSeries',
                'transactionComps',
                'rentComps',
                'documents',
                reviewSummary.totals.approved > 0 ? 'approvedEvidence' : null
              ].filter(Boolean)
            )
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
        viewType: 'HOUSE',
        approvalStatus: assetHouseViewStatus,
        title: `${asset.assetCode} research dossier`,
        summary: dossier.marketThesis,
        snapshotDate: observedAt ?? asset.updatedAt,
        sourceSystem: 'research-dossier',
        freshnessStatus: freshness.status,
        freshnessLabel: freshness.label,
        approvedAt: null,
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
            ...new Set(
              [
                'macroFactors',
                'marketIndicatorSeries',
                'transactionComps',
                'rentComps',
                'documents',
                reviewSummary.totals.approved > 0 ? 'approvedEvidence' : null
              ].filter(Boolean)
            )
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
          : (current.lastObservedAt ?? observedAt);
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
          : (current.lastObservedAt ?? observedAt);
      current.latestThesis = dossier.marketThesis;
      submarketAccumulator.set(submarketKey, current);
    }
  }

  for (const [marketKey, item] of marketAccumulator.entries()) {
    const playbook = getAssetClassPlaybook(item.assetClass);
    const freshness = deriveResearchFreshness(item.lastObservedAt);
    const marketHouseViewStatus = 'DRAFT';
    await db.researchSnapshot.upsert({
      where: {
        snapshotKey: `market:${marketKey}`
      },
      update: {
        marketUniverseId: item.marketUniverseId,
        snapshotType: 'market-thesis',
        viewType: 'HOUSE',
        approvalStatus: marketHouseViewStatus,
        title: `Korea ${playbook.label} market thesis`,
        summary: `${pluralize(item.assetCount, 'asset')} mapped with ${pluralize(item.transactionComps, 'transaction comp')} and ${pluralize(item.rentComps, 'rent comp')}. ${item.pendingBlockers > 0 ? `${pluralize(item.pendingBlockers, 'pending blocker')} remain in the approved evidence queue.` : 'Approved micro evidence is broadly in place.'}`,
        snapshotDate: item.lastObservedAt ?? new Date(),
        sourceSystem: 'research-market-aggregate',
        freshnessStatus: freshness.status,
        freshnessLabel: freshness.label,
        approvedAt: null,
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
        viewType: 'HOUSE',
        approvalStatus: marketHouseViewStatus,
        title: `Korea ${playbook.label} market thesis`,
        summary: `${pluralize(item.assetCount, 'asset')} mapped with ${pluralize(item.transactionComps, 'transaction comp')} and ${pluralize(item.rentComps, 'rent comp')}. ${item.pendingBlockers > 0 ? `${pluralize(item.pendingBlockers, 'pending blocker')} remain in the approved evidence queue.` : 'Approved micro evidence is broadly in place.'}`,
        snapshotDate: item.lastObservedAt ?? new Date(),
        sourceSystem: 'research-market-aggregate',
        freshnessStatus: freshness.status,
        freshnessLabel: freshness.label,
        approvedAt: null,
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
    const submarketHouseViewStatus = 'DRAFT';
    await db.researchSnapshot.upsert({
      where: {
        snapshotKey: `submarket:${submarketKey}`
      },
      update: {
        submarketId: item.submarketId,
        snapshotType: 'submarket-thesis',
        viewType: 'HOUSE',
        approvalStatus: submarketHouseViewStatus,
        title: `${playbook.label} submarket thesis`,
        summary: `${pluralize(item.assetCount, 'asset')} tracked in this submarket with ${item.pendingBlockers > 0 ? `${pluralize(item.pendingBlockers, 'pending blocker')} still open.` : 'approved evidence coverage broadly in place.'}`,
        snapshotDate: item.lastObservedAt ?? new Date(),
        sourceSystem: 'research-submarket-aggregate',
        freshnessStatus: freshness.status,
        freshnessLabel: freshness.label,
        approvedAt: null,
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
        viewType: 'HOUSE',
        approvalStatus: submarketHouseViewStatus,
        title: `${playbook.label} submarket thesis`,
        summary: `${pluralize(item.assetCount, 'asset')} tracked in this submarket with ${item.pendingBlockers > 0 ? `${pluralize(item.pendingBlockers, 'pending blocker')} still open.` : 'approved evidence coverage broadly in place.'}`,
        snapshotDate: item.lastObservedAt ?? new Date(),
        sourceSystem: 'research-submarket-aggregate',
        freshnessStatus: freshness.status,
        freshnessLabel: freshness.label,
        approvedAt: null,
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

