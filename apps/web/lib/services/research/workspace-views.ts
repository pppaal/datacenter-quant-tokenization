/**
 * Read-only view builders for the research workspace.
 *
 * Extracted from workspace.ts so the orchestrator file holds only the
 * sync entry points (syncResearchWorkspace / runResearchWorkspaceSync /
 * shouldRefreshResearchWorkspace) and the sync-cron type plumbing.
 *
 * Public surface here:
 *   - ResearchSnapshotSurface / CoverageTaskSurface
 *   - WorkspaceSyncSnapshot / ResearchSyncRunSurface — types used by both
 *     the views below and the runResearchWorkspaceSync caller back in
 *     workspace.ts.
 *   - getResearchWorkspaceSyncSnapshot / listRecentResearchSyncRuns —
 *     status fetchers that runResearchWorkspaceSync re-uses.
 *   - buildResearchWorkspaceStatus — pure formatter for the status block.
 *   - buildResearchPrioritySignal / buildResearchCoverageSurface — pure
 *     view-shape builders used by the workspace data orchestrator.
 *   - getResearchWorkspaceData — top-level orchestrator the admin
 *     research page reads.
 */
import {
  AssetClass,
  ResearchSyncTriggerType,
  SourceStatus,
  TaskStatus,
  type PrismaClient
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assetBundleInclude } from '@/lib/services/assets';
import { listPortfolios } from '@/lib/services/portfolio';
import { buildPortfolioOptimizationWorkspaceItem } from '@/lib/services/portfolio-optimization';
import { buildAssetResearchDossier } from '@/lib/services/research/dossier';
import { getFreshnessTone } from '@/lib/services/research/freshness';
import {
  type AssetResearchObservedInput
} from '@/lib/services/research/workspace-sync';
import { listKoreaPublicDatasetDefinitions } from '@/lib/sources/adapters/korea-public';
import {
  computeThesisAgeDays,
  countProvenance,
  extractSnapshotHighlights,
  inferApprovalStatus,
  inferSnapshotViewType,
  pluralize,
  type SnapshotApprovalStatus,
  type SnapshotViewType
} from './workspace-formatting';
import type { ResearchWorkspaceData } from './workspace';

export type ResearchSnapshotSurface = {
  freshnessStatus?: SourceStatus | null;
  freshnessLabel?: string | null;
  title?: string | null;
  snapshotType?: string | null;
  viewType?: SnapshotViewType | null;
  approvalStatus?: SnapshotApprovalStatus | null;
  summary?: string | null;
  snapshotDate?: Date | null;
};

export type CoverageTaskSurface = {
  status?: TaskStatus | null;
};

export type WorkspaceSyncSnapshot = {
  latestOfficialSyncAt: Date | null;
  latestAssetSyncAt: Date | null;
  staleAssetDossierCount: number;
  staleOfficialSourceCount: number;
};

export type ResearchSyncRunSurface = {
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

export async function getResearchWorkspaceSyncSnapshot(
  db: PrismaClient
): Promise<WorkspaceSyncSnapshot> {
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
