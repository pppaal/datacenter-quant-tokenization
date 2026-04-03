import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { buildAssetResearchDossier } from '@/lib/services/research/dossier';

export const fundInclude = {
  portfolio: {
    include: {
      assets: {
        include: {
          asset: {
            include: {
              address: true,
              marketSnapshot: true,
              macroFactors: {
                orderBy: {
                  observationDate: 'desc' as const
                },
                take: 4
              },
              marketIndicatorSeries: {
                orderBy: {
                  observationDate: 'desc' as const
                },
                take: 8
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
              siteProfile: true,
              buildingSnapshot: true,
              energySnapshot: true,
              permitSnapshot: true,
              ownershipRecords: true,
              encumbranceRecords: true,
              planningConstraints: true,
              leases: true,
              documents: {
                orderBy: {
                  updatedAt: 'desc' as const
                },
                take: 1
              },
              valuations: {
                orderBy: {
                  createdAt: 'desc' as const
                },
                take: 1
              },
              readinessProject: {
                include: {
                  onchainRecords: {
                    orderBy: {
                      createdAt: 'desc' as const
                    },
                    take: 4
                  }
                }
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
                take: 8
              },
              featureSnapshots: {
                orderBy: {
                  snapshotDate: 'desc' as const
                },
                take: 4
              }
            }
          }
        }
      }
    }
  },
  vehicles: true,
  mandates: true,
  commitments: {
    include: {
      investor: true,
      vehicle: true
    }
  },
  capitalCalls: {
    orderBy: {
      callDate: 'desc' as const
    }
  },
  distributions: {
    orderBy: {
      distributionDate: 'desc' as const
    }
  },
  investorReports: {
    include: {
      investor: true
    },
    orderBy: {
      periodEnd: 'desc' as const
    }
  },
  ddqResponses: {
    include: {
      investor: true
    },
    orderBy: {
      updatedAt: 'desc' as const
    }
  }
} satisfies Prisma.FundInclude;

type FundBundle = Prisma.FundGetPayload<{
  include: typeof fundInclude;
}>;

export type FundRecord = FundBundle;
export type FundDashboard = ReturnType<typeof buildFundDashboard>;
export type InvestorRecord = Awaited<ReturnType<typeof listInvestors>>[number];
export type FundOperatorBriefs = ReturnType<typeof buildFundOperatorBriefs>;

export function buildCommitmentMath(fund: Pick<FundBundle, 'commitments' | 'capitalCalls' | 'distributions' | 'targetSizeKrw' | 'committedCapitalKrw' | 'investedCapitalKrw' | 'dryPowderKrw'>) {
  const totalCommitmentKrw = fund.commitments.reduce((total, item) => total + item.commitmentKrw, 0);
  const totalCalledKrw = fund.commitments.reduce((total, item) => total + item.calledKrw, 0);
  const totalDistributedKrw = fund.commitments.reduce((total, item) => total + item.distributedKrw, 0);
  const pendingCallsKrw = fund.capitalCalls
    .filter((item) => item.status === 'PLANNED' || item.status === 'ISSUED')
    .reduce((total, item) => total + item.amountKrw, 0);
  const pendingDistributionsKrw = fund.distributions
    .filter((item) => item.status === 'PLANNED' || item.status === 'ISSUED')
    .reduce((total, item) => total + item.amountKrw, 0);

  return {
    totalCommitmentKrw,
    totalCalledKrw,
    totalDistributedKrw,
    unfundedCommitmentKrw: totalCommitmentKrw - totalCalledKrw,
    netInvestedKrw: totalCalledKrw - totalDistributedKrw,
    pendingCallsKrw,
    pendingDistributionsKrw,
    targetSizeKrw: fund.targetSizeKrw ?? null,
    committedCapitalKrw: fund.committedCapitalKrw ?? totalCommitmentKrw,
    investedCapitalKrw: fund.investedCapitalKrw ?? (totalCalledKrw - totalDistributedKrw),
    dryPowderKrw: fund.dryPowderKrw ?? (totalCommitmentKrw - totalCalledKrw)
  };
}

export function buildFundDashboard(fund: FundBundle) {
  const math = buildCommitmentMath(fund);
  const topInvestors = [...fund.commitments]
    .sort((left, right) => right.commitmentKrw - left.commitmentKrw)
    .slice(0, 5);
  const latestCall = fund.capitalCalls[0] ?? null;
  const latestDistribution = fund.distributions[0] ?? null;
  const latestReport = fund.investorReports[0] ?? null;

  const researchHighlights =
    fund.portfolio?.assets
      .slice(0, 2)
      .map((portfolioAsset) => {
        const dossier = buildAssetResearchDossier(portfolioAsset.asset as any);
        const officialSignal = dossier.market.officialHighlights[0]
          ? `${dossier.market.officialHighlights[0].label} ${dossier.market.officialHighlights[0].value}.`
          : '';
        return `${portfolioAsset.asset.name}: ${dossier.marketThesis} ${officialSignal} ${dossier.freshness.headline}`.trim();
      })
      .join(' ') ?? '';

  const investorUpdateDraft = [
    `${fund.name} has KRW ${Math.round(math.totalCommitmentKrw).toLocaleString()} of commitments and KRW ${Math.round(math.totalCalledKrw).toLocaleString()} called to date.`,
    latestCall
      ? `The latest capital call was dated ${latestCall.callDate.toISOString().slice(0, 10)} for KRW ${Math.round(latestCall.amountKrw).toLocaleString()} to support ${latestCall.purpose ?? 'portfolio execution'}.`
      : 'No capital call has been issued yet.',
    latestDistribution
      ? `The latest distribution was dated ${latestDistribution.distributionDate.toISOString().slice(0, 10)} for KRW ${Math.round(latestDistribution.amountKrw).toLocaleString()}.`
      : 'No distribution has been issued yet.',
    latestReport
      ? `The current reporting cadence is anchored by ${latestReport.title}.`
      : 'An investor reporting shell is ready but no report has been published yet.',
    researchHighlights || 'Portfolio-linked research coverage is still being populated.'
  ].join(' ');

  return {
    math,
    topInvestors,
    latestCall,
    latestDistribution,
    latestReport,
    investorUpdateDraft
  };
}

export function buildFundOperatorBriefs(fund: FundBundle, dashboard = buildFundDashboard(fund)) {
  const topInvestor = dashboard.topInvestors[0] ?? null;
  const ddqBacklog = fund.ddqResponses.filter((item) => item.statusLabel !== 'COMPLETE').length;
  const reportingBacklog = fund.investorReports.filter((item) => !item.publishedAt).length;

  const capitalActivityBrief = [
    `${fund.name} has KRW ${Math.round(dashboard.math.totalCommitmentKrw).toLocaleString()} of commitments and KRW ${Math.round(dashboard.math.dryPowderKrw).toLocaleString()} of modeled dry powder.`,
    dashboard.latestCall
      ? `The latest capital call is ${dashboard.latestCall.status.toLowerCase()} for KRW ${Math.round(dashboard.latestCall.amountKrw).toLocaleString()}.`
      : 'No capital call has been staged yet.',
    dashboard.latestDistribution
      ? `The latest distribution is ${dashboard.latestDistribution.status.toLowerCase()} for KRW ${Math.round(dashboard.latestDistribution.amountKrw).toLocaleString()}.`
      : 'No distribution has been staged yet.'
  ].join(' ');

  const investorCoverageBrief = topInvestor
    ? `${topInvestor.investor.name} is the largest investor at KRW ${Math.round(topInvestor.commitmentKrw).toLocaleString()} committed. ${ddqBacklog} DDQ response${ddqBacklog === 1 ? '' : 's'} and ${reportingBacklog} unpublished investor report${reportingBacklog === 1 ? '' : 's'} remain in the shell.`
    : `No investor commitment has been loaded yet. ${ddqBacklog} DDQ response${ddqBacklog === 1 ? '' : 's'} and ${reportingBacklog} unpublished report${reportingBacklog === 1 ? '' : 's'} are staged.`;

  return {
    capitalActivityBrief,
    investorCoverageBrief,
    investorUpdateDraft: dashboard.investorUpdateDraft
  };
}

export async function listFunds(db: PrismaClient = prisma) {
  return db.fund.findMany({
    include: fundInclude,
    orderBy: {
      updatedAt: 'desc'
    }
  });
}

export async function getFundById(id: string, db: PrismaClient = prisma) {
  return db.fund.findUnique({
    where: { id },
    include: fundInclude
  });
}

export async function listInvestors(db: PrismaClient = prisma) {
  return db.investor.findMany({
    include: {
      commitments: {
        include: {
          fund: true
        }
      },
      investorReports: {
        orderBy: {
          periodEnd: 'desc'
        },
        take: 3
      },
      ddqResponses: {
        orderBy: {
          updatedAt: 'desc'
        },
        take: 3
      }
    },
    orderBy: {
      updatedAt: 'desc'
    }
  });
}
