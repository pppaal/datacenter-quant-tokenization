import { DealStage, RiskSeverity, TaskPriority, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { buildForecastModelStack } from '@/lib/services/forecast/model-stack';
import { buildForecastEnsemblePolicy } from '@/lib/services/forecast/ensemble';
import { buildGradientBoostingRealizedBacktest } from '@/lib/services/forecast/realized-backtest';
import { listAssets, getAssetBySlug } from '@/lib/services/assets';
import { buildMacroBacktest } from '@/lib/services/macro/backtest';
import { buildMacroForecastBacktest } from '@/lib/services/macro/forecast-backtest';
import { listDocuments } from '@/lib/services/documents';
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
import { listValuationRuns } from '@/lib/services/valuations';

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

  const refinanceWatch = normalized.filter((item) => getRiskLevelWeight(item.refinanceRiskLevel) > 0);
  const covenantWatch = normalized.filter((item) => getRiskLevelWeight(item.covenantPressureLevel) > 0);
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
    const roleAssessments = normalized.filter((assessment) => assessment.counterparty.role === role);
    const highRiskCount = roleAssessments.filter((assessment) => assessment.riskLevel === 'HIGH').length;
    const moderateRiskCount = roleAssessments.filter((assessment) => assessment.riskLevel === 'MODERATE').length;
    const averageScore =
      roleAssessments.length > 0
        ? roleAssessments.reduce((sum, assessment) => sum + assessment.score, 0) / roleAssessments.length
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
    .sort((left, right) => left.score - right.score || right.createdAt.getTime() - left.createdAt.getTime())
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
    }>;
    asset: {
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

  const watchlist = [...deals]
    .map((deal) => {
      const urgentTaskCount = deal.tasks.filter(
        (task) =>
          task.status !== 'DONE' &&
          (task.priority === TaskPriority.URGENT || task.priority === TaskPriority.HIGH)
      ).length;
      const openRiskCount = deal.riskFlags.filter((risk) => !risk.isResolved).length;
      const criticalRiskCount = deal.riskFlags.filter(
        (risk) => !risk.isResolved && risk.severity === RiskSeverity.CRITICAL
      ).length;

      return {
        ...deal,
        urgentTaskCount,
        openRiskCount,
        criticalRiskCount,
        latestCounterpartyRoles: [...new Set(deal.counterparties.map((counterparty) => counterparty.role))].slice(0, 3),
        latestValuation: deal.asset?.valuations[0] ?? null
      };
    })
    .sort((left, right) => {
      const leftScore = left.criticalRiskCount * 5 + left.openRiskCount * 2 + left.urgentTaskCount;
      const rightScore = right.criticalRiskCount * 5 + right.openRiskCount * 2 + right.urgentTaskCount;
      return rightScore - leftScore || left.updatedAt.getTime() - right.updatedAt.getTime();
    })
    .slice(0, 5);

  return {
    totalDeals: deals.length,
    urgentDeals: deals.filter((deal) =>
      deal.tasks.some(
        (task) =>
          task.status !== 'DONE' && (task.priority === TaskPriority.URGENT || task.priority === TaskPriority.HIGH)
      )
    ).length,
    blockedDeals: deals.filter((deal) => deal.riskFlags.some((risk) => !risk.isResolved)).length,
    closingDeals: deals.filter((deal) => deal.stage === DealStage.CLOSING).length,
    byStage,
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
      .sort((left, right) => (left.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (right.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER));
    const overdueTaskCount = openTasks.filter((task) => task.dueDate && task.dueDate.getTime() < now).length;
    const dueSoonTaskCount = openTasks.filter((task) => {
      if (!task.dueDate) return false;
      const due = task.dueDate.getTime();
      return due >= now && due <= now + 1000 * 60 * 60 * 24 * 3;
    }).length;
    const requiredChecklistCount = deal.tasks.filter((task) => task.isRequired || task.checklistKey != null).length;
    const completedChecklistCount = deal.tasks.filter(
      (task) => (task.isRequired || task.checklistKey != null) && task.status === 'DONE'
    ).length;
    const checklistCompletionPct =
      requiredChecklistCount > 0 ? (completedChecklistCount / requiredChecklistCount) * 100 : 100;
    const nextDueAt = datedOpenTasks[0]?.dueDate ?? deal.nextActionAt ?? null;
    const isStale = deal.updatedAt.getTime() <= now - 1000 * 60 * 60 * 24 * 7;

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
    missingNextActionDeals: normalized.filter((deal) => !deal.nextAction && deal.statusLabel !== 'ARCHIVED').length,
    archivedDeals: normalized.filter((deal) => deal.statusLabel === 'ARCHIVED' || deal.archivedAt != null).length,
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

export async function getAdminData(db: PrismaClient = prisma) {
  const [summary, assets, valuations, documents, inquiries, readiness, sourceHealth, riskRuns, creditAssessments, macroFactors, realizedOutcomes, deals] =
    await Promise.all([
    getDashboardSummary(db),
    listAssets(db),
    listValuationRuns(db),
    listDocuments(db),
    listInquiries(db),
    listReadinessProjects(db),
    getSourceRefreshHealth(db),
    db.valuationRun.findMany({
      select: {
        id: true,
        assetId: true,
        createdAt: true,
        confidenceScore: true,
        assumptions: true,
        asset: {
          select: {
            id: true,
            name: true,
            assetCode: true,
            assetClass: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    }),
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
      }
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
      }
    }),
    db.deal.findMany({
      select: {
        id: true,
        dealCode: true,
        title: true,
        stage: true,
        statusLabel: true,
        archivedAt: true,
        nextAction: true,
        nextActionAt: true,
        targetCloseDate: true,
        updatedAt: true,
        tasks: {
          select: {
            status: true,
            priority: true,
            dueDate: true,
            checklistKey: true,
            isRequired: true
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
            role: true
          }
        },
        asset: {
          select: {
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
      }
    })
  ]);

  const quantSignals = buildQuantMarketSignals(macroFactors);
  const quantAllocation = buildQuantAllocationView(quantSignals);
  const macroBacktest = buildMacroBacktest(macroFactors);
  const macroForecastBacktest = buildMacroForecastBacktest(macroFactors);
  const forecastRealizedBacktest = buildGradientBoostingRealizedBacktest({
    runs: valuations.map((run) => ({
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
    assets,
    documents,
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
    runs: valuations.map((run) => ({
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

  return {
    summary,
    assets,
    valuations,
    documents,
    inquiries,
    readiness,
    sourceHealth,
    dealPipeline: buildDealPipelineSummary(deals),
    dealReminders: buildDealReminderSummary(deals),
    portfolioRisk: buildPortfolioRiskSummary(riskRuns),
    counterpartyRisk: buildCounterpartyRiskSummary(creditAssessments),
    quantSignals,
    quantAllocation,
    quantAssetClassAllocation: buildQuantAssetClassAllocationView(quantSignals)
      ,
    macroMonitor: buildMacroMonitor(macroFactors, quantSignals, quantAllocation),
    forecastModelStack,
    macroBacktest,
    macroForecastBacktest,
    forecastRealizedBacktest,
    forecastEnsemblePolicy,
    realizedOutcomeSummary
  };
}
