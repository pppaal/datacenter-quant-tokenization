import { InvestorReportReleaseStatus, TaskStatus, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { buildForecastModelStack } from '@/lib/services/forecast/model-stack';
import { buildForecastEnsemblePolicy } from '@/lib/services/forecast/ensemble';
import { buildGradientBoostingRealizedBacktest } from '@/lib/services/forecast/realized-backtest';
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
import { buildFirmActionCenter } from './action-center';
import { getDashboardSummary } from './core';
import {
  buildCounterpartyRiskSummary,
  buildDealCloseProbabilitySummary,
  buildDealPipelineSummary,
  buildDealReminderSummary,
  buildPortfolioRiskSummary
} from './summaries';

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
