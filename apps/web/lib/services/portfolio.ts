import {
  CovenantStatus,
  PortfolioAssetStatus,
  TaskPriority,
  TaskStatus,
  type Prisma,
  type PrismaClient
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { buildAssetResearchDossier } from '@/lib/services/research/dossier';

export const portfolioInclude = {
  assets: {
    include: {
      asset: {
        include: {
          address: true,
          valuations: {
            orderBy: {
              createdAt: 'desc' as const
            },
            take: 1
          },
          leases: {
            orderBy: {
              updatedAt: 'desc' as const
            },
            take: 8
          },
          debtFacilities: {
            include: {
              draws: {
                orderBy: {
                  drawYear: 'asc' as const
                }
              }
            }
          },
          documents: {
            orderBy: {
              updatedAt: 'desc' as const
            },
            take: 1
          },
          readinessProject: {
            include: {
              onchainRecords: {
                orderBy: {
                  createdAt: 'desc' as const
                },
                take: 3
              }
            }
          },
          energySnapshot: true,
          permitSnapshot: true,
          siteProfile: true,
          buildingSnapshot: true,
          ownershipRecords: true,
          encumbranceRecords: true,
          planningConstraints: true,
          marketSnapshot: true,
          taxAssumption: true,
          macroFactors: {
            orderBy: {
              observationDate: 'desc' as const
            },
            take: 6
          },
          transactionComps: {
            orderBy: {
              transactionDate: 'desc' as const
            },
            take: 4
          },
          rentComps: {
            orderBy: {
              observationDate: 'desc' as const
            },
            take: 4
          },
          pipelineProjects: {
            orderBy: {
              expectedDeliveryDate: 'asc' as const
            },
            take: 4
          },
          marketIndicatorSeries: {
            orderBy: {
              observationDate: 'desc' as const
            },
            take: 8
          },
          featureSnapshots: {
            include: {
              values: true
            },
            orderBy: {
              snapshotDate: 'desc' as const
            },
            take: 4
          },
          researchSnapshots: {
            orderBy: {
              snapshotDate: 'desc' as const
            },
            take: 4
          },
          coverageTasks: {
            orderBy: {
              updatedAt: 'desc' as const
            },
            take: 12
          }
        }
      },
      businessPlans: {
        orderBy: {
          updatedAt: 'desc' as const
        },
        take: 1
      },
      initiatives: {
        orderBy: [
          { priority: 'desc' as const },
          { targetDate: 'asc' as const },
          { updatedAt: 'desc' as const }
        ],
        take: 8
      },
      monthlyKpis: {
        orderBy: {
          periodStart: 'desc' as const
        },
        take: 12
      },
      leaseRollSnapshots: {
        orderBy: {
          asOfDate: 'desc' as const
        },
        take: 6
      },
      budgets: {
        include: {
          lineItems: true
        },
        orderBy: {
          fiscalYear: 'desc' as const
        },
        take: 2
      },
      capexProjects: {
        orderBy: {
          updatedAt: 'desc' as const
        }
      },
      covenantTests: {
        include: {
          debtFacility: true
        },
        orderBy: {
          asOfDate: 'desc' as const
        },
        take: 12
      },
      exitCases: {
        orderBy: {
          updatedAt: 'desc' as const
        }
      }
    },
    orderBy: {
      updatedAt: 'desc' as const
    }
  },
  funds: {
    orderBy: {
      vintageYear: 'desc' as const
    }
  }
} satisfies Prisma.PortfolioInclude;

type PortfolioBundle = Prisma.PortfolioGetPayload<{
  include: typeof portfolioInclude;
}>;

type PortfolioAssetBundle = PortfolioBundle['assets'][number];

export type PortfolioRecord = PortfolioBundle;
export type PortfolioDashboard = ReturnType<typeof buildPortfolioDashboard>;
export type PortfolioOperatorBriefs = ReturnType<typeof buildPortfolioOperatorBriefs>;

function sum(values: Array<number | null | undefined>) {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function average(values: Array<number | null | undefined>) {
  const observed = values.filter((value): value is number => typeof value === 'number');
  if (observed.length === 0) return null;
  return sum(observed) / observed.length;
}

function latestKpi(portfolioAsset: PortfolioAssetBundle) {
  return portfolioAsset.monthlyKpis[0] ?? null;
}

function previousKpi(portfolioAsset: PortfolioAssetBundle) {
  return portfolioAsset.monthlyKpis[1] ?? null;
}

function latestLeaseRoll(portfolioAsset: PortfolioAssetBundle) {
  return portfolioAsset.leaseRollSnapshots[0] ?? null;
}

function latestValuation(portfolioAsset: PortfolioAssetBundle) {
  return portfolioAsset.asset.valuations[0] ?? null;
}

function latestBudget(portfolioAsset: PortfolioAssetBundle) {
  return portfolioAsset.budgets[0] ?? null;
}

function buildInitiativeSummary(
  initiatives: PortfolioAssetBundle['initiatives'] | undefined | null
) {
  const rows = initiatives ?? [];
  const openItems = rows.filter((item) => item.status !== TaskStatus.DONE);
  const blockedCount = openItems.filter((item) => item.status === TaskStatus.BLOCKED).length;
  const urgentCount = openItems.filter((item) => item.priority === TaskPriority.URGENT).length;
  const nextDueItem =
    [...openItems]
      .filter((item) => item.targetDate)
      .sort(
        (left, right) =>
          (left.targetDate?.getTime() ?? Number.MAX_SAFE_INTEGER) -
          (right.targetDate?.getTime() ?? Number.MAX_SAFE_INTEGER)
      )[0] ??
    openItems[0] ??
    null;

  return {
    totalCount: rows.length,
    openCount: openItems.length,
    blockedCount,
    urgentCount,
    nextDueItem,
    summary: nextDueItem
      ? `${nextDueItem.title} is the lead initiative ${nextDueItem.targetDate ? `due ${nextDueItem.targetDate.toISOString().slice(0, 10)}` : 'without a due date'}.`
      : 'No active asset-management initiative is currently staged.'
  };
}

function latestDocumentHash(portfolioAsset: PortfolioAssetBundle) {
  return portfolioAsset.asset.documents[0]?.documentHash ?? null;
}

function latestAnchorReference(portfolioAsset: PortfolioAssetBundle) {
  return portfolioAsset.asset.readinessProject?.onchainRecords[0]?.txHash ?? null;
}

function resolveDebtMaturityDate(
  facility: PortfolioAssetBundle['asset']['debtFacilities'][number]
) {
  if (!facility.amortizationTermMonths) return null;
  const start = facility.createdAt;
  return new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + facility.amortizationTermMonths, 1)
  );
}

export function buildCovenantStatusSummary(tests: PortfolioAssetBundle['covenantTests']) {
  const latestByName = new Map<string, (typeof tests)[number]>();
  for (const test of tests) {
    const existing = latestByName.get(test.testName);
    if (!existing || existing.asOfDate.getTime() < test.asOfDate.getTime()) {
      latestByName.set(test.testName, test);
    }
  }
  const items = [...latestByName.values()];
  const breachCount = items.filter((item) => item.status === CovenantStatus.BREACH).length;
  const watchCount = items.filter((item) => item.status === CovenantStatus.WATCH).length;

  return {
    items,
    breachCount,
    watchCount,
    passingCount: items.filter((item) => item.status === CovenantStatus.PASS).length
  };
}

export function buildPortfolioDashboard(portfolio: PortfolioBundle) {
  const assetRows = portfolio.assets.map((portfolioAsset) => {
    const latest = latestKpi(portfolioAsset);
    const previous = previousKpi(portfolioAsset);
    const leaseRoll = latestLeaseRoll(portfolioAsset);
    const valuation = latestValuation(portfolioAsset);
    const covenant = buildCovenantStatusSummary(portfolioAsset.covenantTests);
    const budget = latestBudget(portfolioAsset);
    const annualBudget = sum(budget?.lineItems.map((item) => item.annualBudgetKrw) ?? []);
    const actualBudget = sum(budget?.lineItems.map((item) => item.ytdActualKrw) ?? []);
    const varianceBudget = sum(budget?.lineItems.map((item) => item.varianceKrw) ?? []);
    const capexBudget = sum(
      portfolioAsset.capexProjects.map((project) => project.approvedBudgetKrw ?? project.budgetKrw)
    );
    const capexSpent = sum(portfolioAsset.capexProjects.map((project) => project.spentToDateKrw));
    const initiativeSummary = buildInitiativeSummary(portfolioAsset.initiatives);

    return {
      portfolioAsset,
      latest,
      previous,
      leaseRoll,
      valuation,
      covenant,
      annualBudget,
      actualBudget,
      varianceBudget,
      capexBudget,
      capexSpent,
      initiativeSummary,
      holdValueKrw:
        portfolioAsset.currentHoldValueKrw ??
        latest?.navKrw ??
        valuation?.baseCaseValueKrw ??
        portfolioAsset.acquisitionCostKrw ??
        null,
      latestDocumentHash: latestDocumentHash(portfolioAsset),
      latestAnchorReference: latestAnchorReference(portfolioAsset)
    };
  });

  const summary = {
    assetCount: assetRows.length,
    grossHoldValueKrw: sum(assetRows.map((row) => row.holdValueKrw)),
    averageOccupancyPct: average(assetRows.map((row) => row.latest?.occupancyPct)),
    annualizedNoiKrw: sum(assetRows.map((row) => row.latest?.noiKrw)),
    annualizedRevenueKrw: sum(
      assetRows.map((row) =>
        row.latest?.effectiveRentKrwPerSqmMonth != null && row.latest?.leasedAreaSqm != null
          ? row.latest.effectiveRentKrwPerSqmMonth * row.latest.leasedAreaSqm * 12
          : (row.latest?.noiKrw ?? 0)
      )
    ),
    watchlistCount: assetRows.filter(
      (row) =>
        row.portfolioAsset.status === PortfolioAssetStatus.WATCHLIST ||
        row.covenant.breachCount > 0 ||
        (row.leaseRoll?.next12MonthsExpiringPct ?? 0) >= 20
    ).length
  };

  const leaseRolloverWatchlist = assetRows
    .filter((row) => row.leaseRoll)
    .sort(
      (left, right) =>
        (right.leaseRoll?.next12MonthsExpiringPct ?? 0) -
          (left.leaseRoll?.next12MonthsExpiringPct ?? 0) ||
        (right.leaseRoll?.next24MonthsExpiringPct ?? 0) -
          (left.leaseRoll?.next24MonthsExpiringPct ?? 0)
    )
    .slice(0, 8);

  const debtMaturityWall = assetRows
    .flatMap((row) =>
      row.portfolioAsset.asset.debtFacilities.map((facility) => ({
        portfolioAsset: row.portfolioAsset,
        asset: row.portfolioAsset.asset,
        facility,
        maturityDate: resolveDebtMaturityDate(facility)
      }))
    )
    .sort(
      (left, right) =>
        (left.maturityDate?.getTime() ?? Number.MAX_SAFE_INTEGER) -
        (right.maturityDate?.getTime() ?? Number.MAX_SAFE_INTEGER)
    );

  const covenantWatchlist = assetRows
    .filter((row) => row.covenant.items.length > 0)
    .sort(
      (left, right) =>
        right.covenant.breachCount - left.covenant.breachCount ||
        right.covenant.watchCount - left.covenant.watchCount
    );

  const exitCaseTracker = assetRows
    .flatMap((row) =>
      row.portfolioAsset.exitCases.map((exitCase) => ({
        portfolioAsset: row.portfolioAsset,
        asset: row.portfolioAsset.asset,
        exitCase,
        holdValueKrw: row.holdValueKrw
      }))
    )
    .sort(
      (left, right) =>
        (left.exitCase.targetExitDate?.getTime() ?? Number.MAX_SAFE_INTEGER) -
        (right.exitCase.targetExitDate?.getTime() ?? Number.MAX_SAFE_INTEGER)
    );

  const capexBudgetTracker = [...assetRows].sort(
    (left, right) =>
      (right.capexSpent ?? 0) -
      (right.capexBudget ?? 0) -
      ((left.capexSpent ?? 0) - (left.capexBudget ?? 0))
  );

  const initiativeTracker = assetRows
    .filter((row) => row.initiativeSummary.openCount > 0)
    .sort(
      (left, right) =>
        right.initiativeSummary.blockedCount - left.initiativeSummary.blockedCount ||
        right.initiativeSummary.urgentCount - left.initiativeSummary.urgentCount ||
        (left.initiativeSummary.nextDueItem?.targetDate?.getTime() ?? Number.MAX_SAFE_INTEGER) -
          (right.initiativeSummary.nextDueItem?.targetDate?.getTime() ?? Number.MAX_SAFE_INTEGER)
    );

  const operatorSummary = [
    `${portfolio.name} currently holds ${summary.assetCount} asset${summary.assetCount === 1 ? '' : 's'} across ${portfolio.market}.`,
    summary.averageOccupancyPct != null
      ? `Average occupancy is ${summary.averageOccupancyPct.toFixed(1)}% with annualized NOI of KRW ${Math.round(summary.annualizedNoiKrw).toLocaleString()}.`
      : 'Occupancy history is still being populated for the current hold set.',
    initiativeTracker[0]
      ? `${initiativeTracker[0].portfolioAsset.asset.name} is carrying the lead asset-management initiative queue with ${initiativeTracker[0].initiativeSummary.blockedCount} blocked and ${initiativeTracker[0].initiativeSummary.urgentCount} urgent item(s).`
      : 'No blocked asset-management initiatives are currently staged.',
    covenantWatchlist[0]
      ? `${covenantWatchlist[0].portfolioAsset.asset.name} is the primary covenant watch item, while ${leaseRolloverWatchlist[0]?.portfolioAsset.asset.name ?? 'the rollover queue'} drives the lease rollover watchlist.`
      : 'No covenant breaches are flagged across the current hold set.'
  ].join(' ');

  const researchSummary = assetRows
    .slice(0, 2)
    .map((row) => {
      const dossier = buildAssetResearchDossier(row.portfolioAsset.asset as any);
      const officialSignal = dossier.market.officialHighlights[0]
        ? `${dossier.market.officialHighlights[0].label} ${dossier.market.officialHighlights[0].value}.`
        : '';
      return `${row.portfolioAsset.asset.name}: ${dossier.marketThesis} ${officialSignal} ${dossier.freshness.headline}`.trim();
    })
    .join(' ');

  return {
    summary,
    assetRows,
    leaseRolloverWatchlist,
    debtMaturityWall,
    covenantWatchlist,
    capexBudgetTracker,
    initiativeTracker,
    exitCaseTracker,
    operatorSummary,
    researchSummary
  };
}

export function buildPortfolioOperatorBriefs(
  portfolio: PortfolioBundle,
  dashboard = buildPortfolioDashboard(portfolio)
) {
  const topWatch = dashboard.covenantWatchlist[0] ?? null;
  const topRollover = dashboard.leaseRolloverWatchlist[0] ?? null;
  const topExit = dashboard.exitCaseTracker[0] ?? null;
  const topCapex = dashboard.capexBudgetTracker[0] ?? null;
  const topInitiative = dashboard.initiativeTracker[0] ?? null;

  const researchBrief = [
    `${portfolio.name} is operating with ${dashboard.summary.assetCount} held asset${dashboard.summary.assetCount === 1 ? '' : 's'} across ${portfolio.market}.`,
    dashboard.researchSummary ||
      'Research coverage is still being expanded across the current hold set.',
    topExit
      ? `${topExit.asset.name} is the nearest modeled exit case with ${topExit.exitCase.targetExitDate ? `a target date of ${topExit.exitCase.targetExitDate.toISOString().slice(0, 10)}` : 'timing still under review'}.`
      : 'No active exit case has been staged yet.'
  ].join(' ');

  const covenantBrief = topWatch
    ? `${topWatch.portfolioAsset.asset.name} is the lead covenant watch asset with ${topWatch.covenant.breachCount} breach and ${topWatch.covenant.watchCount} watch test${topWatch.covenant.watchCount === 1 ? '' : 's'}. Current DSCR is ${topWatch.latest?.debtServiceCoverage?.toFixed(2) ?? 'N/A'}x and LTV is ${topWatch.latest?.ltvPct?.toFixed(1) ?? 'N/A'}%.`
    : 'No covenant breach is currently flagged across the held portfolio.';

  const watchlistBrief = topRollover
    ? `${topRollover.portfolioAsset.asset.name} leads the lease rollover watchlist with ${(topRollover.leaseRoll?.next12MonthsExpiringPct ?? 0).toFixed(1)}% expiring inside 12 months and ${(topRollover.leaseRoll?.next24MonthsExpiringPct ?? 0).toFixed(1)}% inside 24 months.`
    : 'No material lease rollover concentration is currently flagged.';

  const capexBrief = topCapex
    ? `${topCapex.portfolioAsset.asset.name} is the main capex tracking asset with KRW ${Math.round(topCapex.capexSpent ?? 0).toLocaleString()} spent against KRW ${Math.round(topCapex.capexBudget ?? 0).toLocaleString()} of approved capex budget.`
    : 'No material capex program has been staged yet.';

  const initiativeBrief = topInitiative
    ? `${topInitiative.portfolioAsset.asset.name} carries ${topInitiative.initiativeSummary.openCount} active asset-management initiative${topInitiative.initiativeSummary.openCount === 1 ? '' : 's'}, including ${topInitiative.initiativeSummary.blockedCount} blocked item${topInitiative.initiativeSummary.blockedCount === 1 ? '' : 's'}. ${topInitiative.initiativeSummary.summary}`
    : 'No active asset-management initiative queue has been staged yet.';

  return {
    researchBrief,
    covenantBrief,
    watchlistBrief,
    capexBrief,
    initiativeBrief
  };
}

export async function listPortfolios(db: PrismaClient = prisma) {
  return db.portfolio.findMany({
    include: portfolioInclude,
    orderBy: {
      updatedAt: 'desc'
    }
  });
}

export async function getPortfolioById(id: string, db: PrismaClient = prisma) {
  return db.portfolio.findUnique({
    where: { id },
    include: portfolioInclude
  });
}
