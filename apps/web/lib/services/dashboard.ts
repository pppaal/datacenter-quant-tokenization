import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { listAssets, getAssetBySlug } from '@/lib/services/assets';
import { listDocuments } from '@/lib/services/documents';
import { listInquiries } from '@/lib/services/inquiries';
import {
  buildQuantAllocationView,
  buildQuantAssetClassAllocationView,
  buildQuantMarketSignals
} from '@/lib/services/macro/quant';
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
  const [summary, assets, valuations, documents, inquiries, readiness, sourceHealth, riskRuns, creditAssessments, macroFactors] =
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
    })
  ]);

  const quantSignals = buildQuantMarketSignals(macroFactors);

  return {
    summary,
    assets,
    valuations,
    documents,
    inquiries,
    readiness,
    sourceHealth,
    portfolioRisk: buildPortfolioRiskSummary(riskRuns),
    counterpartyRisk: buildCounterpartyRiskSummary(creditAssessments),
    quantSignals,
    quantAllocation: buildQuantAllocationView(quantSignals),
    quantAssetClassAllocation: buildQuantAssetClassAllocationView(quantSignals)
  };
}
