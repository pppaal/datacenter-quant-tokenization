import {
  AssetClass,
  ResearchSyncTriggerType,
  SourceStatus,
  TaskPriority,
  TaskStatus,
  type PrismaClient
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { buildPortfolioOptimizationWorkspaceItem } from '@/lib/services/portfolio-optimization';
import { listPortfolios } from '@/lib/services/portfolio';
import { assetBundleInclude } from '@/lib/services/assets';
import { buildAssetResearchDossier } from '@/lib/services/research/dossier';
import { listKoreaPublicDatasetDefinitions } from '@/lib/sources/adapters/korea-public';
import { getFreshnessTone } from '@/lib/services/research/freshness';
import {
  ensureResearchTopology,
  syncAssetAndMarketResearch,
  syncOfficialSourceResearch,
  type AssetResearchObservedInput
} from '@/lib/services/research/workspace-sync';

export type ResearchWorkspaceTab =
  | 'macro'
  | 'markets'
  | 'submarkets'
  | 'assets'
  | 'optimization'
  | 'coverage';
import {
  computeThesisAgeDays,
  countProvenance,
  extractSnapshotHighlights,
  flattenNumericMetrics,
  inferApprovalStatus,
  inferSnapshotViewType,
  pluralize,
  type SnapshotApprovalStatus,
  type SnapshotViewType
} from './workspace-formatting';

// Re-export the previously-public flattenNumericMetrics symbol so any caller
// still importing it from workspace.ts keeps working.
export { flattenNumericMetrics };

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
    houseView: {
      draftSnapshotId: string | null;
      title: string;
      summary: string | null;
      approvalStatus: SnapshotApprovalStatus;
      thesisAgeDays: number | null;
    } | null;
    sourceView: {
      title: string;
      summary: string | null;
      freshnessLabel: string | null;
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
    houseView: {
      draftSnapshotId: string | null;
      title: string;
      summary: string | null;
      approvalStatus: SnapshotApprovalStatus;
      thesisAgeDays: number | null;
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
    confidenceScore: number;
    confidenceLevel: 'high' | 'moderate' | 'low';
    conflictCount: number;
    houseViewLabel: string;
    thesisAgeDays: number | null;
    draftHouseViewSnapshotId: string | null;
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


type ResearchSnapshotSurface = {
  freshnessStatus?: SourceStatus | null;
  freshnessLabel?: string | null;
  title?: string | null;
  snapshotType?: string | null;
  viewType?: SnapshotViewType | null;
  approvalStatus?: SnapshotApprovalStatus | null;
  summary?: string | null;
  snapshotDate?: Date | null;
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


export function shouldRefreshResearchWorkspace(status: WorkspaceSyncSnapshot) {
  return (
    !status.latestOfficialSyncAt ||
    !status.latestAssetSyncAt ||
    status.staleOfficialSourceCount > 0 ||
    status.staleAssetDossierCount > 0
  );
}

async function getResearchWorkspaceSyncSnapshot(db: PrismaClient): Promise<WorkspaceSyncSnapshot> {
  const [
    latestOfficialSync,
    latestAssetSync,
    assetCount,
    freshAssetSnapshotCount,
    staleOfficialSourceCount
  ] = await Promise.all([
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

async function listRecentResearchSyncRuns(
  db: PrismaClient,
  limit = 6
): Promise<ResearchSyncRunSurface[]> {
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
  const dossier = buildAssetResearchDossier(
    asset as Parameters<typeof buildAssetResearchDossier>[0]
  );
  const taskCount = (asset.coverageTasks ?? []).filter(
    (task: { status?: TaskStatus | null }) => task.status !== TaskStatus.DONE
  ).length;
  const blockerCount = dossier.pendingBlockers.length;
  const freshnessStatus = dossier.freshness.status;

  const score =
    100 -
    blockerCount * 10 -
    taskCount * 8 -
    (freshnessStatus === SourceStatus.FRESH ? 0 : freshnessStatus === SourceStatus.STALE ? 10 : 18);

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
  const openTaskCount = (input.coverageTasks ?? []).filter(
    (task) => task.status !== TaskStatus.DONE
  ).length;
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

export async function getResearchWorkspaceData(
  db: PrismaClient = prisma
): Promise<ResearchWorkspaceData> {
  const initialStatus = await getResearchWorkspaceSyncSnapshot(db);
  const finalStatus = initialStatus;

  const [
    macroSnapshots,
    marketUniverses,
    submarkets,
    assets,
    portfolios,
    coverageTasks,
    recentRuns
  ] = await Promise.all([
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
            snapshotType: {
              in: ['submarket-thesis', 'market-official-source']
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
      orderBy: [{ city: 'asc' }, { label: 'asc' }]
    }),
    db.asset.findMany({
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
        const thesisSnapshot =
          marketUniverse.researchSnapshots.find(
            (item) =>
              item.snapshotType === 'market-thesis' &&
              inferSnapshotViewType(item) === 'HOUSE' &&
              inferApprovalStatus(item) === 'APPROVED'
          ) ??
          marketUniverse.researchSnapshots.find(
            (item) =>
              item.snapshotType === 'market-thesis' && inferSnapshotViewType(item) === 'HOUSE'
          ) ??
          null;
        const draftSnapshot =
          marketUniverse.researchSnapshots.find(
            (item) => item.snapshotType === 'market-thesis' && inferApprovalStatus(item) === 'DRAFT'
          ) ?? null;
        const sourceSnapshot =
          marketUniverse.researchSnapshots.find(
            (item) =>
              item.snapshotType === 'market-official-source' &&
              inferSnapshotViewType(item) === 'SOURCE'
          ) ?? null;

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
          houseView: thesisSnapshot
            ? {
                draftSnapshotId: draftSnapshot?.id ?? null,
                title: thesisSnapshot.title,
                summary: thesisSnapshot.summary,
                approvalStatus: inferApprovalStatus(thesisSnapshot),
                thesisAgeDays: computeThesisAgeDays(thesisSnapshot.snapshotDate)
              }
            : null,
          sourceView: sourceSnapshot
            ? {
                title: sourceSnapshot.title,
                summary: sourceSnapshot.summary,
                freshnessLabel: sourceSnapshot.freshnessLabel
              }
            : null,
          officialHighlights: marketUniverse.researchSnapshots
            .filter((item) => item.snapshotType === 'market-official-source')
            .flatMap((item) => extractSnapshotHighlights(item.metrics))
            .slice(0, 4),
          openCoverageTasks: marketUniverse.coverageTasks.length
        };
      }),
    submarkets: submarkets.map((submarket) => {
      const thesisSnapshot =
        submarket.researchSnapshots.find(
          (item) =>
            item.snapshotType === 'submarket-thesis' &&
            inferSnapshotViewType(item) === 'HOUSE' &&
            inferApprovalStatus(item) === 'APPROVED'
        ) ??
        submarket.researchSnapshots.find(
          (item) =>
            item.snapshotType === 'submarket-thesis' && inferSnapshotViewType(item) === 'HOUSE'
        ) ??
        null;
      const draftSnapshot =
        submarket.researchSnapshots.find(
          (item) =>
            item.snapshotType === 'submarket-thesis' && inferApprovalStatus(item) === 'DRAFT'
        ) ?? null;

      return {
        id: submarket.id,
        label: submarket.label,
        city: submarket.city,
        district: submarket.district,
        assetClass: submarket.assetClass,
        thesis: submarket.thesis,
        snapshot: thesisSnapshot
          ? {
              title: thesisSnapshot.title,
              summary: thesisSnapshot.summary,
              freshnessStatus: thesisSnapshot.freshnessStatus,
              freshnessLabel: thesisSnapshot.freshnessLabel,
              updatedAt: thesisSnapshot.snapshotDate
            }
          : null,
        houseView: thesisSnapshot
          ? {
              draftSnapshotId: draftSnapshot?.id ?? null,
              title: thesisSnapshot.title,
              summary: thesisSnapshot.summary,
              approvalStatus: inferApprovalStatus(thesisSnapshot),
              thesisAgeDays: computeThesisAgeDays(thesisSnapshot.snapshotDate)
            }
          : null,
        openCoverageTasks: submarket.coverageTasks.length
      };
    }),
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
        openCoverageTasks: dossier.coverage.openTaskCount,
        confidenceScore: dossier.confidence.score,
        confidenceLevel: dossier.confidence.level,
        conflictCount: dossier.confidence.conflicts.length,
        houseViewLabel: dossier.houseView.approvalLabel,
        thesisAgeDays: dossier.houseView.thesisAgeDays,
        draftHouseViewSnapshotId: dossier.houseView.draftSnapshotId
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
