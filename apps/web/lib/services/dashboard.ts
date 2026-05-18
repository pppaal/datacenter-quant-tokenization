import {
  DealStage,
  InvestorReportReleaseStatus,
  RiskSeverity,
  TaskPriority,
  TaskStatus,
  type PrismaClient
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { dealStageOrder } from '@/lib/validations/deal';
import { buildForecastModelStack } from '@/lib/services/forecast/model-stack';
import { buildForecastEnsemblePolicy } from '@/lib/services/forecast/ensemble';
import { buildGradientBoostingRealizedBacktest } from '@/lib/services/forecast/realized-backtest';
import { getAssetBySlug } from '@/lib/services/assets';
import {
  buildDealCloseProbability,
  buildDealClosingReadiness,
  buildDealExecutionSnapshot,
  buildDealOriginationProfile,
  getDealMaterialUpdatedAt
} from '@/lib/services/deals';
import { buildMacroBacktest } from '@/lib/services/macro/backtest';
import { computeDealMacroExposure } from '@/lib/services/macro/deal-risk';
import { buildMacroForecastBacktest } from '@/lib/services/macro/forecast-backtest';
import { getCommitteeWorkspace } from '@/lib/services/ic';
import { listInquiries } from '@/lib/services/inquiries';
import {
  buildQuantAllocationView,
  buildQuantAssetClassAllocationView,
  buildQuantMarketSignals
} from '@/lib/services/macro/quant';
import { buildMacroMonitor } from '@/lib/services/macro/monitor';
import { buildRealizedOutcomeSummary } from '@/lib/services/realized-outcomes';
import { listReadinessProjects } from '@/lib/services/readiness';
import { getSourceRefreshHealth } from '@/lib/services/source-refresh';
type CreditLiquiditySignals = {
  refinanceRiskLevel?: string;
  covenantPressureLevel?: string;
  downsideDscrHaircutPct?: number;
  downsideValueHaircutPct?: number;
  weakestCurrentRatio?: number | null;
  weakestMaturityCoverage?: number | null;
};

type PortfolioRiskSourceRun = {
  id: string;
  assetId: string;
  createdAt: Date;
  asset: {
    id: string;
    name: string;
    assetCode: string;
    assetClass: string;
  };
  confidenceScore: number;
  assumptions: unknown;
};

type CounterpartyRiskSourceAssessment = {
  id: string;
  score: number;
  riskLevel: string;
  createdAt: Date;
  asset: {
    id: string;
    name: string;
    assetCode: string;
  };
  counterparty: {
    id: string;
    name: string;
    role: string;
  };
};

function getCreditSignals(assumptions: unknown): CreditLiquiditySignals | null {
  if (!assumptions || typeof assumptions !== 'object') return null;
  const credit = (assumptions as Record<string, unknown>).credit;
  if (!credit || typeof credit !== 'object') return null;
  const liquiditySignals = (credit as Record<string, unknown>).liquiditySignals;
  return liquiditySignals && typeof liquiditySignals === 'object'
    ? (liquiditySignals as CreditLiquiditySignals)
    : null;
}

function getRiskLevelWeight(level?: string) {
  if (level === 'HIGH') return 2;
  if (level === 'MODERATE') return 1;
  return 0;
}

function getDealStageRank(stage: DealStage) {
  const index = dealStageOrder.indexOf(stage);
  return index === -1 ? -1 : index;
}

export function buildPortfolioRiskSummary(runs: PortfolioRiskSourceRun[]) {
  const latestRuns = new Map<string, PortfolioRiskSourceRun>();

  for (const run of runs) {
    const current = latestRuns.get(run.assetId);
    if (!current || current.createdAt < run.createdAt) {
      latestRuns.set(run.assetId, run);
    }
  }

  const normalized = [...latestRuns.values()].map((run) => {
    const liquiditySignals = getCreditSignals(run.assumptions);
    return {
      run,
      liquiditySignals,
      refinanceRiskLevel: liquiditySignals?.refinanceRiskLevel ?? 'LOW',
      covenantPressureLevel: liquiditySignals?.covenantPressureLevel ?? 'LOW',
      downsideDscrHaircutPct: liquiditySignals?.downsideDscrHaircutPct ?? 0,
      downsideValueHaircutPct: liquiditySignals?.downsideValueHaircutPct ?? 0,
      weakestCurrentRatio: liquiditySignals?.weakestCurrentRatio ?? null,
      weakestMaturityCoverage: liquiditySignals?.weakestMaturityCoverage ?? null
    };
  });

  const refinanceWatch = normalized.filter(
    (item) => getRiskLevelWeight(item.refinanceRiskLevel) > 0
  );
  const covenantWatch = normalized.filter(
    (item) => getRiskLevelWeight(item.covenantPressureLevel) > 0
  );
  const highRiskCount = normalized.filter(
    (item) => item.refinanceRiskLevel === 'HIGH' || item.covenantPressureLevel === 'HIGH'
  ).length;
  const watchlist = [...normalized]
    .sort((left, right) => {
      const leftScore =
        getRiskLevelWeight(left.refinanceRiskLevel) * 3 +
        getRiskLevelWeight(left.covenantPressureLevel) * 2 +
        left.downsideDscrHaircutPct;
      const rightScore =
        getRiskLevelWeight(right.refinanceRiskLevel) * 3 +
        getRiskLevelWeight(right.covenantPressureLevel) * 2 +
        right.downsideDscrHaircutPct;
      return rightScore - leftScore;
    })
    .slice(0, 4)
    .map((item) => ({
      assetId: item.run.asset.id,
      assetName: item.run.asset.name,
      assetCode: item.run.asset.assetCode,
      assetClass: item.run.asset.assetClass,
      runId: item.run.id,
      confidenceScore: item.run.confidenceScore,
      refinanceRiskLevel: item.refinanceRiskLevel,
      covenantPressureLevel: item.covenantPressureLevel,
      downsideDscrHaircutPct: item.downsideDscrHaircutPct,
      downsideValueHaircutPct: item.downsideValueHaircutPct,
      weakestCurrentRatio: item.weakestCurrentRatio,
      weakestMaturityCoverage: item.weakestMaturityCoverage
    }));

  return {
    assetCoverage: normalized.length,
    refinanceWatchCount: refinanceWatch.length,
    covenantWatchCount: covenantWatch.length,
    highRiskCount,
    watchlist
  };
}

export function buildCounterpartyRiskSummary(assessments: CounterpartyRiskSourceAssessment[]) {
  const latestAssessments = new Map<string, CounterpartyRiskSourceAssessment>();

  for (const assessment of assessments) {
    const current = latestAssessments.get(assessment.counterparty.id);
    if (!current || current.createdAt < assessment.createdAt) {
      latestAssessments.set(assessment.counterparty.id, assessment);
    }
  }

  const normalized = [...latestAssessments.values()];
  const roles = ['SPONSOR', 'TENANT', 'OPERATOR'] as const;
  const roleSummary = roles.map((role) => {
    const roleAssessments = normalized.filter(
      (assessment) => assessment.counterparty.role === role
    );
    const highRiskCount = roleAssessments.filter(
      (assessment) => assessment.riskLevel === 'HIGH'
    ).length;
    const moderateRiskCount = roleAssessments.filter(
      (assessment) => assessment.riskLevel === 'MODERATE'
    ).length;
    const averageScore =
      roleAssessments.length > 0
        ? roleAssessments.reduce((sum, assessment) => sum + assessment.score, 0) /
          roleAssessments.length
        : null;

    return {
      role,
      assessmentCount: roleAssessments.length,
      highRiskCount,
      moderateRiskCount,
      averageScore
    };
  });

  const watchlist = [...normalized]
    .sort(
      (left, right) =>
        left.score - right.score || right.createdAt.getTime() - left.createdAt.getTime()
    )
    .slice(0, 5)
    .map((assessment) => ({
      assessmentId: assessment.id,
      assetId: assessment.asset.id,
      assetName: assessment.asset.name,
      assetCode: assessment.asset.assetCode,
      counterpartyName: assessment.counterparty.name,
      counterpartyRole: assessment.counterparty.role,
      score: assessment.score,
      riskLevel: assessment.riskLevel,
      createdAt: assessment.createdAt
    }));

  return {
    coverage: normalized.length,
    highRiskCount: normalized.filter((assessment) => assessment.riskLevel === 'HIGH').length,
    roleSummary,
    watchlist
  };
}

export function buildDealPipelineSummary(
  deals: Array<{
    id: string;
    dealCode: string;
    title: string;
    stage: DealStage;
    nextAction: string | null;
    targetCloseDate: Date | null;
    updatedAt: Date;
    originationSource?: string | null;
    originSummary?: string | null;
    tasks: Array<{
      status: string;
      priority: string;
    }>;
    riskFlags: Array<{
      isResolved: boolean;
      severity: RiskSeverity;
    }>;
    counterparties: Array<{
      role: string;
      coverageOwner?: string | null;
      coverageStatus?: string;
      lastContactAt?: Date | null;
      name?: string;
    }>;
    documentRequests: Array<{
      status: string;
    }>;
    bidRevisions: Array<{
      status: string;
      label: string;
    }>;
    lenderQuotes: Array<{
      status: string;
      facilityLabel: string;
    }>;
    negotiationEvents: Array<{
      eventType: string;
      expiresAt: Date | null;
    }>;
    activityLogs?: Array<unknown>;
    asset: {
      researchSnapshots?: Array<{
        freshnessStatus: string | null;
      }>;
      coverageTasks?: Array<{
        status: string;
      }>;
      valuations: Array<{
        id: string;
        baseCaseValueKrw: number;
        confidenceScore: number;
        createdAt: Date;
      }>;
    } | null;
  }>
) {
  const byStage = Object.values(DealStage).map((stage) => ({
    stage,
    count: deals.filter((deal) => deal.stage === stage).length
  }));

  const normalized = deals.map((deal) => {
    const snapshot =
      'activityLogs' in deal && Array.isArray((deal as Record<string, unknown>).activityLogs)
        ? buildDealExecutionSnapshot(deal as any)
        : null;
    const readiness = buildDealClosingReadiness(deal as any, snapshot);
    const urgentTaskCount = deal.tasks.filter(
      (task) =>
        task.status !== 'DONE' &&
        (task.priority === TaskPriority.URGENT || task.priority === TaskPriority.HIGH)
    ).length;
    const openRiskCount = deal.riskFlags.filter((risk) => !risk.isResolved).length;
    const criticalRiskCount = deal.riskFlags.filter(
      (risk) => !risk.isResolved && risk.severity === RiskSeverity.CRITICAL
    ).length;
    const origination = buildDealOriginationProfile(deal as any, snapshot);

    return {
      ...deal,
      urgentTaskCount,
      openRiskCount,
      criticalRiskCount,
      readiness,
      origination,
      closeProbability: buildDealCloseProbability(deal as any, snapshot, readiness),
      latestCounterpartyRoles: [
        ...new Set(deal.counterparties.map((counterparty) => counterparty.role))
      ].slice(0, 3),
      latestValuation: deal.asset?.valuations[0] ?? null
    };
  });
  const watchlist = [...normalized]
    .sort((left, right) => {
      const leftStageRank = getDealStageRank(left.stage);
      const rightStageRank = getDealStageRank(right.stage);
      const leftScore =
        left.criticalRiskCount * 5 +
        left.openRiskCount * 2 +
        left.urgentTaskCount +
        (100 - left.origination.scorePct) / 15 +
        (left.origination.exclusivityLabel === 'No live exclusivity' &&
        leftStageRank >= getDealStageRank(DealStage.LOI)
          ? 2
          : 0);
      const rightScore =
        right.criticalRiskCount * 5 +
        right.openRiskCount * 2 +
        right.urgentTaskCount +
        (100 - right.origination.scorePct) / 15 +
        (right.origination.exclusivityLabel === 'No live exclusivity' &&
        rightStageRank >= getDealStageRank(DealStage.LOI)
          ? 2
          : 0);
      return (
        rightScore - leftScore ||
        left.origination.scorePct - right.origination.scorePct ||
        right.closeProbability.scorePct - left.closeProbability.scorePct ||
        left.readiness.scorePct - right.readiness.scorePct ||
        left.updatedAt.getTime() - right.updatedAt.getTime()
      );
    })
    .slice(0, 5);

  return {
    totalDeals: deals.length,
    urgentDeals: deals.filter((deal) =>
      deal.tasks.some(
        (task) =>
          task.status !== 'DONE' &&
          (task.priority === TaskPriority.URGENT || task.priority === TaskPriority.HIGH)
      )
    ).length,
    blockedDeals: deals.filter((deal) => deal.riskFlags.some((risk) => !risk.isResolved)).length,
    closingDeals: deals.filter((deal) => deal.stage === DealStage.CLOSING).length,
    directOrProprietaryDeals: deals.filter(
      (deal) =>
        deal.originationSource === 'DIRECT_OWNER' || deal.originationSource === 'PROPRIETARY'
    ).length,
    liveExclusivityDeals: normalized.filter(
      (deal) => deal.origination.exclusivityLabel !== 'No live exclusivity'
    ).length,
    lowOriginationCoverageDeals: normalized.filter((deal) => deal.origination.band === 'LOW')
      .length,
    processProtectionGapDeals: normalized.filter(
      (deal) =>
        getDealStageRank(deal.stage) >= getDealStageRank(DealStage.LOI) &&
        deal.origination.exclusivityLabel === 'No live exclusivity'
    ).length,
    relationshipCoverageGapDeals: normalized.filter((deal) =>
      deal.origination.blockers.some(
        (blocker) =>
          blocker.includes('No primary relationship owner') ||
          blocker.includes('No recent counterparty touchpoint')
      )
    ).length,
    byStage,
    watchlist: watchlist.map((deal) => ({
      id: deal.id,
      dealCode: deal.dealCode,
      title: deal.title,
      stage: deal.stage,
      nextAction: deal.nextAction,
      targetCloseDate: deal.targetCloseDate,
      urgentTaskCount: deal.urgentTaskCount,
      openRiskCount: deal.openRiskCount,
      readinessScorePct: deal.readiness.scorePct,
      readinessBlockerCount: deal.readiness.blockerCount,
      closeProbabilityPct: deal.closeProbability.scorePct,
      closeProbabilityBand: deal.closeProbability.band,
      originationScorePct: deal.origination.scorePct,
      originationBand: deal.origination.band,
      sourceLabel: deal.origination.sourceLabel,
      relationshipCoverageLabel: deal.origination.relationshipCoverageLabel,
      exclusivityLabel: deal.origination.exclusivityLabel,
      latestCounterpartyRoles: deal.latestCounterpartyRoles,
      latestValuation: deal.latestValuation
    }))
  };
}

export function buildDealCloseProbabilitySummary(
  deals: Array<{
    id: string;
    dealCode: string;
    title: string;
    stage: DealStage;
    nextAction: string | null;
    targetCloseDate: Date | null;
    updatedAt: Date;
    tasks: Array<{
      status: string;
      priority: string;
      dueDate?: Date | null;
      checklistKey?: string | null;
      isRequired?: boolean;
      title?: string;
      sortOrder?: number;
    }>;
    riskFlags: Array<{
      isResolved: boolean;
      severity: RiskSeverity;
    }>;
    counterparties: Array<{
      role: string;
    }>;
    documentRequests: Array<{
      status: string;
    }>;
    bidRevisions: Array<{
      status: string;
      label: string;
    }>;
    lenderQuotes: Array<{
      status: string;
      facilityLabel: string;
    }>;
    negotiationEvents: Array<{
      eventType: string;
      expiresAt: Date | null;
      effectiveAt?: Date;
    }>;
    asset: {
      valuations: Array<{
        id: string;
        baseCaseValueKrw: number;
        confidenceScore: number;
        createdAt: Date;
      }>;
    } | null;
    activityLogs?: Array<unknown>;
  }>
) {
  const normalized = deals
    .filter((deal) => deal.stage !== DealStage.SOURCED && deal.stage !== DealStage.SCREENED)
    .map((deal) => {
      const snapshot =
        'activityLogs' in deal && Array.isArray((deal as Record<string, unknown>).activityLogs)
          ? buildDealExecutionSnapshot(deal as any)
          : null;
      const readiness = buildDealClosingReadiness(deal as any, snapshot);
      const probability = buildDealCloseProbability(deal as any, snapshot, readiness);
      const openRiskCount = deal.riskFlags.filter((risk) => !risk.isResolved).length;
      return {
        id: deal.id,
        dealCode: deal.dealCode,
        title: deal.title,
        stage: deal.stage,
        probability,
        readiness,
        nextAction: deal.nextAction,
        targetCloseDate: deal.targetCloseDate,
        openRiskCount,
        latestValuation: deal.asset?.valuations[0] ?? null
      };
    });

  const watchlist = [...normalized]
    .sort((left, right) => {
      const leftPenalty = left.stage === DealStage.CLOSING ? 20 : 0;
      const rightPenalty = right.stage === DealStage.CLOSING ? 20 : 0;
      return (
        left.probability.scorePct - right.probability.scorePct - leftPenalty + rightPenalty ||
        right.openRiskCount - left.openRiskCount
      );
    })
    .slice(0, 5);

  return {
    highProbabilityCount: normalized.filter((deal) => deal.probability.band === 'HIGH').length,
    mediumProbabilityCount: normalized.filter((deal) => deal.probability.band === 'MEDIUM').length,
    lowProbabilityCount: normalized.filter((deal) => deal.probability.band === 'LOW').length,
    watchlist
  };
}

export function buildDealReminderSummary(
  deals: Array<{
    id: string;
    dealCode: string;
    title: string;
    stage: DealStage;
    statusLabel: string;
    archivedAt: Date | null;
    updatedAt: Date;
    nextAction: string | null;
    nextActionAt: Date | null;
    tasks: Array<{
      status: string;
      priority: string;
      dueDate: Date | null;
      checklistKey: string | null;
      isRequired: boolean;
    }>;
    counterparties: Array<{
      role: string;
    }>;
  }>
) {
  const now = Date.now();
  const normalized = deals.map((deal) => {
    const openTasks = deal.tasks.filter((task) => task.status !== 'DONE');
    const datedOpenTasks = openTasks
      .filter((task) => task.dueDate != null)
      .sort(
        (left, right) =>
          (left.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER) -
          (right.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER)
      );
    const overdueTaskCount = openTasks.filter(
      (task) => task.dueDate && task.dueDate.getTime() < now
    ).length;
    const dueSoonTaskCount = openTasks.filter((task) => {
      if (!task.dueDate) return false;
      const due = task.dueDate.getTime();
      return due >= now && due <= now + 1000 * 60 * 60 * 24 * 3;
    }).length;
    const requiredChecklistCount = deal.tasks.filter(
      (task) => task.isRequired || task.checklistKey != null
    ).length;
    const completedChecklistCount = deal.tasks.filter(
      (task) => (task.isRequired || task.checklistKey != null) && task.status === 'DONE'
    ).length;
    const checklistCompletionPct =
      requiredChecklistCount > 0 ? (completedChecklistCount / requiredChecklistCount) * 100 : 100;
    const nextDueAt = datedOpenTasks[0]?.dueDate ?? deal.nextActionAt ?? null;
    const isStale =
      getDealMaterialUpdatedAt(deal as any).getTime() <= now - 1000 * 60 * 60 * 24 * 7;

    const reminder =
      overdueTaskCount > 0
        ? `${overdueTaskCount} overdue task${overdueTaskCount === 1 ? '' : 's'} need immediate follow-up.`
        : dueSoonTaskCount > 0
          ? `${dueSoonTaskCount} task${dueSoonTaskCount === 1 ? '' : 's'} due within 72 hours.`
          : !deal.nextAction
            ? 'No next action is set for this deal.'
            : isStale
              ? 'No material update logged in the last 7 days.'
              : checklistCompletionPct < 100
                ? 'Current stage checklist is incomplete.'
                : 'Queue looks current.';

    return {
      ...deal,
      overdueTaskCount,
      dueSoonTaskCount,
      nextDueAt,
      isStale,
      checklistCompletionPct,
      reminder
    };
  });

  return {
    overdueDeals: normalized.filter((deal) => deal.overdueTaskCount > 0).length,
    dueSoonDeals: normalized.filter((deal) => deal.dueSoonTaskCount > 0).length,
    staleDeals: normalized.filter((deal) => deal.isStale && deal.statusLabel !== 'ARCHIVED').length,
    missingNextActionDeals: normalized.filter(
      (deal) => !deal.nextAction && deal.statusLabel !== 'ARCHIVED'
    ).length,
    archivedDeals: normalized.filter(
      (deal) => deal.statusLabel === 'ARCHIVED' || deal.archivedAt != null
    ).length,
    reminders: normalized
      .filter(
        (deal) =>
          deal.statusLabel !== 'ARCHIVED' &&
          (deal.overdueTaskCount > 0 ||
            deal.dueSoonTaskCount > 0 ||
            !deal.nextAction ||
            deal.isStale ||
            deal.checklistCompletionPct < 100)
      )
      .sort((left, right) => {
        const leftScore =
          left.overdueTaskCount * 5 +
          left.dueSoonTaskCount * 3 +
          (left.nextAction ? 0 : 2) +
          (left.isStale ? 1.5 : 0) +
          (100 - left.checklistCompletionPct) / 20;
        const rightScore =
          right.overdueTaskCount * 5 +
          right.dueSoonTaskCount * 3 +
          (right.nextAction ? 0 : 2) +
          (right.isStale ? 1.5 : 0) +
          (100 - right.checklistCompletionPct) / 20;
        const scoreDelta = rightScore - leftScore;
        if (scoreDelta !== 0) return scoreDelta;
        const leftDue = left.nextDueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const rightDue = right.nextDueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return leftDue - rightDue;
      })
      .slice(0, 6)
      .map((deal) => ({
        id: deal.id,
        dealCode: deal.dealCode,
        title: deal.title,
        stage: deal.stage,
        reminder: deal.reminder,
        nextActionAt: deal.nextActionAt,
        nextDueAt: deal.nextDueAt,
        overdueTaskCount: deal.overdueTaskCount,
        dueSoonTaskCount: deal.dueSoonTaskCount,
        isStale: deal.isStale,
        checklistCompletionPct: deal.checklistCompletionPct
      }))
  };
}

export async function getDashboardSummary(db: PrismaClient = prisma) {
  const [assetCount, underReviewCount, documentCount, valuationCount] = await Promise.all([
    db.asset.count(),
    db.asset.count({
      where: {
        status: 'UNDER_REVIEW'
      }
    }),
    db.document.count(),
    db.valuationRun.count()
  ]);

  return {
    assetCount,
    underReviewCount,
    documentCount,
    valuationCount
  };
}

export async function getLandingData(db: PrismaClient = prisma) {
  const [assets, summary] = await Promise.all([
    db.asset.findMany({
      include: {
        address: true,
        marketSnapshot: true,
        valuations: {
          take: 1,
          orderBy: {
            createdAt: 'desc'
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      },
      take: 3
    }),
    getDashboardSummary(db)
  ]);

  return {
    assets,
    summary
  };
}

export async function getSampleReport(db: PrismaClient = prisma) {
  return getAssetBySlug('seoul-gangseo-01-seoul-hyperscale-campus', db);
}

function buildFirmActionCenter({
  reviewCount,
  dealReminderCount,
  lowOriginationCoverageDeals,
  processProtectionGapDeals,
  relationshipCoverageGapDeals,
  staleSourceCount,
  portfolioWatchCount,
  initiativeBacklog,
  fundReportingBacklog,
  readyReportCount,
  capitalCallCount,
  committeeActionItems
}: {
  reviewCount: number;
  dealReminderCount: number;
  lowOriginationCoverageDeals: number;
  processProtectionGapDeals: number;
  relationshipCoverageGapDeals: number;
  staleSourceCount: number;
  portfolioWatchCount: number;
  initiativeBacklog: number;
  fundReportingBacklog: number;
  readyReportCount: number;
  capitalCallCount: number;
  committeeActionItems: Array<{
    key: string;
    area: string;
    title: string;
    detail: string;
    href: string;
    priority: 'critical' | 'high' | 'medium';
    dueLabel?: string;
  }>;
}) {
  const items = [
    ...(reviewCount > 0
      ? [
          {
            key: 'review-queue',
            area: 'REVIEW',
            title: `${reviewCount} normalized evidence item(s) are still pending review`,
            detail:
              'Approve or reject pending technical, legal, and lease evidence before downstream valuation and committee use.',
            href: '/admin/review',
            priority: 'critical' as const
          }
        ]
      : []),
    ...(dealReminderCount > 0
      ? [
          {
            key: 'deal-reminders',
            area: 'DEALS',
            title: `${dealReminderCount} deal(s) need an immediate execution action`,
            detail:
              'Clear missing next actions, overdue workstreams, and stale DD items before the close path slips.',
            href: '/admin/deals',
            priority: 'critical' as const
          }
        ]
      : []),
    ...(lowOriginationCoverageDeals > 0
      ? [
          {
            key: 'deal-origination-coverage',
            area: 'ORIGINATION',
            title: `${lowOriginationCoverageDeals} pursuit(s) still have thin origination coverage`,
            detail:
              'Tighten source tagging, relationship ownership, and market touchpoints before the process enters deeper bid or IC work.',
            href: '/admin/deals',
            priority: 'high' as const
          }
        ]
      : []),
    ...(processProtectionGapDeals > 0
      ? [
          {
            key: 'deal-exclusivity-gap',
            area: 'ORIGINATION',
            title: `${processProtectionGapDeals} LOI-or-deeper pursuit(s) have no live exclusivity`,
            detail:
              'Push process protection or re-underwrite competitive risk before diligence and committee time compounds into a weak process position.',
            href: '/admin/deals',
            priority: 'high' as const
          }
        ]
      : []),
    ...(relationshipCoverageGapDeals > 0
      ? [
          {
            key: 'deal-coverage-gap',
            area: 'ORIGINATION',
            title: `${relationshipCoverageGapDeals} pursuit(s) need relationship ownership or fresh touchpoints`,
            detail:
              'Assign a primary counterparty owner and log current contact activity so pursuit quality is not dependent on ad hoc notes.',
            href: '/admin/deals',
            priority: 'medium' as const
          }
        ]
      : []),
    ...(staleSourceCount > 0
      ? [
          {
            key: 'research-ops',
            area: 'RESEARCH',
            title: `${staleSourceCount} source-system issue(s) need research operations follow-up`,
            detail:
              'Resolve stale or failed source runs before the shared research fabric drifts out of date.',
            href: '/admin/sources',
            priority: 'high' as const
          }
        ]
      : []),
    ...(portfolioWatchCount > 0
      ? [
          {
            key: 'portfolio-watch',
            area: 'PORTFOLIO',
            title: `${portfolioWatchCount} held-asset watch item(s) are active`,
            detail:
              'Refinance, covenant, rollover, or capex exceptions are surfacing in the hold set.',
            href: '/admin/portfolio',
            priority: 'high' as const
          }
        ]
      : []),
    ...(initiativeBacklog > 0
      ? [
          {
            key: 'portfolio-initiatives',
            area: 'PORTFOLIO',
            title: `${initiativeBacklog} asset-management initiative(s) remain open across the hold set`,
            detail:
              'Advance blocked leasing, refinance, capex, and disposition initiatives before KPI drift leaks into committee and LP reporting.',
            href: '/admin/portfolio',
            priority: 'high' as const
          }
        ]
      : []),
    ...(fundReportingBacklog > 0 || capitalCallCount > 0
      ? [
          {
            key: 'fund-reporting',
            area: 'FUNDS',
            title: `${fundReportingBacklog} controlled investor report item(s), ${readyReportCount} release-ready package(s), and ${capitalCallCount} near-term capital call(s) are open`,
            detail:
              'Clear release workflow items and call logistics before LP communication windows tighten.',
            href: '/admin/funds',
            priority: 'medium' as const
          }
        ]
      : []),
    ...committeeActionItems
  ];

  const priorityRank = {
    critical: 3,
    high: 2,
    medium: 1
  };

  return items
    .sort((left, right) => priorityRank[right.priority] - priorityRank[left.priority])
    .slice(0, 8);
}

export async function getAdminData(db: PrismaClient = prisma) {
  const [
    summary,
    recentAssets,
    valuationRuns,
    documentSummary,
    inquiries,
    readiness,
    sourceHealth,
    creditAssessments,
    macroFactors,
    realizedOutcomes,
    deals,
    forecastAssetFeatures,
    financialStatementCount,
    fundReportingSummary,
    assetManagementInitiativeCount,
    committeeWorkspace
  ] = await Promise.all([
    getDashboardSummary(db),
    db.asset.findMany({
      select: {
        id: true,
        name: true,
        assetCode: true,
        assetClass: true,
        market: true,
        status: true,
        powerCapacityMw: true,
        rentableAreaSqm: true,
        grossFloorAreaSqm: true,
        currentValuationKrw: true,
        address: {
          select: {
            city: true,
            country: true
          }
        },
        valuations: {
          select: {
            id: true,
            baseCaseValueKrw: true,
            confidenceScore: true,
            createdAt: true
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 1
        }
      },
      orderBy: {
        updatedAt: 'desc'
      },
      take: 4
    }),
    db.valuationRun.findMany({
      select: {
        id: true,
        assetId: true,
        runLabel: true,
        createdAt: true,
        baseCaseValueKrw: true,
        confidenceScore: true,
        assumptions: true,
        provenance: true,
        scenarios: {
          select: {
            name: true,
            valuationKrw: true,
            debtServiceCoverage: true
          },
          orderBy: {
            scenarioOrder: 'asc'
          }
        },
        asset: {
          select: {
            id: true,
            name: true,
            assetCode: true,
            assetClass: true,
            market: true,
            address: {
              select: {
                country: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 300
    }),
    Promise.all([
      db.document.count(),
      db.document.findFirst({
        select: {
          id: true,
          title: true,
          updatedAt: true
        },
        orderBy: {
          updatedAt: 'desc'
        }
      })
    ]),
    listInquiries(db),
    listReadinessProjects(db),
    getSourceRefreshHealth(db),
    db.creditAssessment.findMany({
      select: {
        id: true,
        score: true,
        riskLevel: true,
        createdAt: true,
        asset: {
          select: {
            id: true,
            name: true,
            assetCode: true
          }
        },
        counterparty: {
          select: {
            id: true,
            name: true,
            role: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 400
    }),
    db.macroFactor.findMany({
      orderBy: {
        observationDate: 'desc'
      },
      take: 120
    }),
    db.realizedOutcome.findMany({
      select: {
        id: true,
        assetId: true,
        observationDate: true,
        occupancyPct: true,
        noiKrw: true,
        rentGrowthPct: true,
        valuationKrw: true,
        debtServiceCoverage: true,
        exitCapRatePct: true,
        notes: true,
        asset: {
          select: {
            id: true,
            name: true,
            assetCode: true
          }
        }
      },
      orderBy: {
        observationDate: 'desc'
      },
      take: 400
    }),
    db.deal.findMany({
      select: {
        id: true,
        dealCode: true,
        title: true,
        stage: true,
        market: true,
        assetClass: true,
        statusLabel: true,
        archivedAt: true,
        nextAction: true,
        nextActionAt: true,
        targetCloseDate: true,
        updatedAt: true,
        originationSource: true,
        originSummary: true,
        tasks: {
          select: {
            title: true,
            status: true,
            priority: true,
            dueDate: true,
            checklistKey: true,
            isRequired: true,
            sortOrder: true
          }
        },
        riskFlags: {
          select: {
            isResolved: true,
            severity: true
          }
        },
        counterparties: {
          select: {
            name: true,
            role: true,
            coverageOwner: true,
            coverageStatus: true,
            lastContactAt: true
          }
        },
        documentRequests: {
          select: {
            status: true
          }
        },
        bidRevisions: {
          select: {
            status: true,
            label: true
          },
          orderBy: {
            submittedAt: 'desc'
          },
          take: 4
        },
        lenderQuotes: {
          select: {
            status: true,
            facilityLabel: true
          },
          orderBy: {
            quotedAt: 'desc'
          },
          take: 4
        },
        negotiationEvents: {
          select: {
            eventType: true,
            effectiveAt: true,
            expiresAt: true
          },
          orderBy: {
            effectiveAt: 'desc'
          },
          take: 4
        },
        activityLogs: {
          select: {
            activityType: true,
            counterparty: {
              select: {
                role: true
              }
            }
          },
          take: 4,
          orderBy: {
            createdAt: 'desc'
          }
        },
        asset: {
          select: {
            financingLtvPct: true,
            financingRatePct: true,
            researchSnapshots: {
              select: {
                freshnessStatus: true
              },
              orderBy: {
                createdAt: 'desc'
              },
              take: 8
            },
            coverageTasks: {
              select: {
                status: true
              },
              where: {
                status: {
                  not: TaskStatus.DONE
                }
              },
              orderBy: {
                dueDate: 'asc'
              },
              take: 12
            },
            valuations: {
              select: {
                id: true,
                baseCaseValueKrw: true,
                confidenceScore: true,
                createdAt: true
              },
              orderBy: {
                createdAt: 'desc'
              },
              take: 1
            }
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      },
      take: 200
    }),
    db.asset.findMany({
      select: {
        market: true,
        assetClass: true,
        _count: {
          select: {
            transactionComps: true,
            rentComps: true,
            marketIndicatorSeries: true,
            valuations: true
          }
        }
      }
    }),
    db.financialStatement.count(),
    db.fund.findMany({
      select: {
        id: true,
        code: true,
        investorReports: {
          select: {
            id: true,
            publishedAt: true,
            releaseStatus: true
          }
        },
        capitalCalls: {
          select: {
            id: true,
            dueDate: true,
            status: true
          }
        }
      }
    }),
    db.assetManagementInitiative.count({
      where: {
        status: {
          in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED]
        }
      }
    }),
    getCommitteeWorkspace(db)
  ]);

  const [documentCount, latestDocument] = documentSummary;

  const quantSignals = buildQuantMarketSignals(macroFactors);
  const quantAllocation = buildQuantAllocationView(quantSignals);
  const macroBacktest = buildMacroBacktest(macroFactors);
  const macroForecastBacktest = buildMacroForecastBacktest(macroFactors);
  const forecastRealizedBacktest = buildGradientBoostingRealizedBacktest({
    runs: valuationRuns.map((run) => ({
      id: run.id,
      assetId: run.assetId,
      createdAt: run.createdAt,
      baseCaseValueKrw: run.baseCaseValueKrw,
      confidenceScore: run.confidenceScore,
      assumptions: run.assumptions,
      asset: {
        id: run.asset.id,
        name: run.asset.name,
        assetCode: run.asset.assetCode,
        assetClass: run.asset.assetClass,
        market: run.asset.market
      },
      scenarios: run.scenarios.map((scenario) => ({
        name: scenario.name,
        debtServiceCoverage: scenario.debtServiceCoverage
      }))
    })),
    outcomes: realizedOutcomes
  });
  const forecastModelStack = buildForecastModelStack({
    featureSummary: {
      assetCount: summary.assetCount,
      marketCount: new Set(forecastAssetFeatures.map((asset) => asset.market)).size,
      assetClassCoverage: new Set(forecastAssetFeatures.map((asset) => asset.assetClass)).size,
      marketEvidenceAssets: forecastAssetFeatures.filter(
        (asset) =>
          asset._count.transactionComps > 0 ||
          asset._count.rentComps > 0 ||
          asset._count.marketIndicatorSeries > 0
      ).length,
      valuationHistoryCount: forecastAssetFeatures.reduce(
        (sum, asset) => sum + asset._count.valuations,
        0
      ),
      documentCount,
      financialStatementCount
    },
    macroObservationCount: macroFactors.length,
    realizedBacktest: forecastRealizedBacktest
  });
  const forecastEnsemblePolicy = buildForecastEnsemblePolicy({
    modelStack: forecastModelStack,
    macroBacktest,
    macroForecastBacktest,
    forecastRealizedBacktest
  });
  const realizedOutcomeSummary = buildRealizedOutcomeSummary({
    runs: valuationRuns.map((run) => ({
      id: run.id,
      assetId: run.assetId,
      createdAt: run.createdAt,
      baseCaseValueKrw: run.baseCaseValueKrw,
      asset: {
        id: run.asset.id,
        name: run.asset.name,
        assetCode: run.asset.assetCode,
        assetClass: run.asset.assetClass
      },
      scenarios: run.scenarios.map((scenario) => ({
        name: scenario.name,
        debtServiceCoverage: scenario.debtServiceCoverage
      }))
    })),
    outcomes: realizedOutcomes
  });
  const fundReportingBacklog = fundReportingSummary.reduce(
    (total, fund) =>
      total +
      fund.investorReports.filter(
        (report) => report.releaseStatus !== InvestorReportReleaseStatus.RELEASED
      ).length,
    0
  );
  const readyReportCount = fundReportingSummary.reduce(
    (total, fund) =>
      total +
      fund.investorReports.filter(
        (report) => report.releaseStatus === InvestorReportReleaseStatus.READY
      ).length,
    0
  );
  const capitalCallCount = fundReportingSummary.reduce(
    (total, fund) =>
      total +
      fund.capitalCalls.filter((call) => {
        if (call.status === 'FUNDED' || call.status === 'CANCELLED') return false;
        if (!call.dueDate) return true;
        return call.dueDate.getTime() <= Date.now() + 1000 * 60 * 60 * 24 * 30;
      }).length,
    0
  );
  const dealPipelineRaw = buildDealPipelineSummary(deals);
  const dealPipeline = {
    ...dealPipelineRaw,
    watchlist: dealPipelineRaw.watchlist.map((item) => {
      const deal = deals.find((d) => d.id === item.id);
      const exposure = deal
        ? computeDealMacroExposure(
            {
              id: deal.id,
              market: deal.market,
              assetClass: deal.assetClass,
              financingLtvPct: deal.asset?.financingLtvPct ?? null,
              financingRatePct: deal.asset?.financingRatePct ?? null,
              stage: deal.stage
            },
            macroFactors
          )
        : null;
      return {
        ...item,
        macroRiskScore: exposure?.overallScore ?? null,
        macroRiskBand: exposure?.band ?? null
      };
    })
  };
  const dealReminders = buildDealReminderSummary(deals);
  const portfolioRisk = buildPortfolioRiskSummary(
    valuationRuns.map((run) => ({
      id: run.id,
      assetId: run.assetId,
      createdAt: run.createdAt,
      confidenceScore: run.confidenceScore,
      assumptions: run.assumptions,
      asset: {
        id: run.asset.id,
        name: run.asset.name,
        assetCode: run.asset.assetCode,
        assetClass: run.asset.assetClass
      }
    }))
  );
  const actionCenter = buildFirmActionCenter({
    reviewCount: summary.underReviewCount,
    dealReminderCount: dealReminders.reminders.length,
    lowOriginationCoverageDeals: dealPipeline.lowOriginationCoverageDeals,
    processProtectionGapDeals: dealPipeline.processProtectionGapDeals,
    relationshipCoverageGapDeals: dealPipeline.relationshipCoverageGapDeals,
    staleSourceCount:
      sourceHealth.sourceFreshness.stale +
      sourceHealth.sourceFreshness.failed +
      sourceHealth.assetFreshness.staleCandidates,
    portfolioWatchCount: portfolioRisk.watchlist.length,
    initiativeBacklog: assetManagementInitiativeCount,
    fundReportingBacklog,
    readyReportCount,
    capitalCallCount,
    committeeActionItems: committeeWorkspace.dashboard.actionItems
  });

  return {
    summary,
    assets: recentAssets,
    valuations: valuationRuns.slice(0, 3),
    documents: {
      totalCount: documentCount,
      latest: latestDocument
    },
    inquiries,
    readiness,
    sourceHealth,
    dealPipeline,
    dealCloseProbability: buildDealCloseProbabilitySummary(deals),
    dealReminders,
    portfolioRisk,
    actionCenter,
    committee: committeeWorkspace,
    fundReportingBacklog,
    readyReportCount,
    capitalCallCount,
    counterpartyRisk: buildCounterpartyRiskSummary(creditAssessments),
    quantSignals,
    quantAllocation,
    quantAssetClassAllocation: buildQuantAssetClassAllocationView(quantSignals),
    macroMonitor: buildMacroMonitor(macroFactors, quantSignals, quantAllocation),
    forecastModelStack,
    macroBacktest,
    macroForecastBacktest,
    forecastRealizedBacktest,
    forecastEnsemblePolicy,
    realizedOutcomeSummary
  };
}
