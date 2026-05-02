import {
  AssetClass,
  ResearchSyncTriggerType,
  SourceStatus,
  TaskPriority,
  TaskStatus,
  type PrismaClient
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  ensureResearchTopology,
  syncAssetAndMarketResearch,
  syncOfficialSourceResearch
} from '@/lib/services/research/workspace-sync';
import {
  flattenNumericMetrics,
  type SnapshotApprovalStatus
} from './workspace-formatting';
import {
  getResearchWorkspaceSyncSnapshot
} from './workspace-views';

export type ResearchWorkspaceTab =
  | 'macro'
  | 'markets'
  | 'submarkets'
  | 'assets'
  | 'optimization'
  | 'coverage';

// Re-export the previously-public flattenNumericMetrics symbol so any caller
// still importing it from workspace.ts keeps working.
export { flattenNumericMetrics };

// Re-export the view-builder functions and key types from the views module
// so consumers that imported them from this file stay source-compatible.
export {
  buildResearchCoverageSurface,
  buildResearchPrioritySignal,
  getResearchWorkspaceData,
  shouldRefreshResearchWorkspace
} from './workspace-views';

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




/**
 * Sync scope selector. Lets the cron layer pick which slice of the research
 * graph to refresh:
 *   'all'         — full sweep (default; backwards-compatible)
 *   'macro'       — KOSIS / BOK ECOS official sources only (weekly cadence)
 *   'market'      — REB / MOLIT / building / land sources only (daily cadence)
 *   'assets'      — per-asset dossier rebuild only (hourly cadence; cheap)
 */
export type ResearchSyncScope = 'all' | 'macro' | 'market' | 'assets';

export async function syncResearchWorkspace(
  db: PrismaClient = prisma,
  options: { scope?: ResearchSyncScope } = {}
) {
  const scope = options.scope ?? 'all';
  const topology = await ensureResearchTopology(db);
  const officialSync =
    scope === 'all' || scope === 'macro' || scope === 'market'
      ? await syncOfficialSourceResearch(db, topology, {
          cadence: scope === 'all' ? 'all' : scope
        })
      : { officialSourceCount: 0, macroSeriesCount: 0, marketIndicatorCount: 0 };
  const assetSync =
    scope === 'all' || scope === 'assets'
      ? await syncAssetAndMarketResearch(db, topology)
      : { assetDossierCount: 0, openCoverageTaskCount: 0 };
  return {
    scope,
    topology,
    officialSync,
    assetSync
  };
}

export async function runResearchWorkspaceSync(
  input: {
    triggerType?: ResearchSyncTriggerType;
    actorIdentifier?: string | null;
    scope?: ResearchSyncScope;
  } = {},
  db: PrismaClient = prisma
) {
  const triggerType = input.triggerType ?? ResearchSyncTriggerType.WORKSPACE_REFRESH;
  const scope = input.scope ?? 'all';
  const startedAt = new Date();
  const run = await db.researchSyncRun.create({
    data: {
      triggerType,
      statusLabel: 'RUNNING',
      refreshedByActor: input.actorIdentifier?.trim() || null
    }
  });

  try {
    const result = await syncResearchWorkspace(db, { scope });
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
          scope,
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

