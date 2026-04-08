import {
  AssetStatus,
  CommitteePacketStatus,
  type Prisma,
  type PrismaClient
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { buildCommitteeActionItems, buildCommitteeDashboard } from '@/lib/services/ic-builders';

export const committeePacketInclude = {
  asset: {
    select: {
      id: true,
      name: true,
      assetCode: true,
      assetClass: true,
      status: true
    }
  },
  deal: {
    select: {
      id: true,
      dealCode: true,
      title: true,
      stage: true,
      nextAction: true,
      targetCloseDate: true
    }
  },
  valuationRun: {
    select: {
      id: true,
      runLabel: true,
      createdAt: true,
      confidenceScore: true,
      approvalStatus: true
    }
  },
  decisions: {
    orderBy: {
      decidedAt: 'desc' as const
    },
    take: 5
  }
} satisfies Prisma.InvestmentCommitteePacketInclude;

export const committeeMeetingInclude = {
  packets: {
    include: committeePacketInclude,
    orderBy: {
      updatedAt: 'desc' as const
    }
  }
} satisfies Prisma.InvestmentCommitteeMeetingInclude;

export type CommitteePacketRecord = Prisma.InvestmentCommitteePacketGetPayload<{
  include: typeof committeePacketInclude;
}>;

export type CommitteeMeetingRecord = Prisma.InvestmentCommitteeMeetingGetPayload<{
  include: typeof committeeMeetingInclude;
}>;

type CandidateAsset = {
  id: string;
  name: string;
  assetCode: string;
  assetClass: string;
  status: AssetStatus;
  updatedAt: Date;
  valuations: Array<{
    id: string;
    runLabel: string;
    createdAt: Date;
    confidenceScore: number;
  }>;
  deals: Array<{
    id: string;
    dealCode: string;
    title: string;
    stage: string;
    nextAction: string | null;
  }>;
};

export async function listCommitteeMeetings(db: PrismaClient = prisma) {
  return db.investmentCommitteeMeeting.findMany({
    include: committeeMeetingInclude,
    orderBy: [
      {
        scheduledFor: 'asc'
      },
      {
        createdAt: 'desc'
      }
    ]
  });
}

export async function listCommitteePackets(db: PrismaClient = prisma) {
  return db.investmentCommitteePacket.findMany({
    include: committeePacketInclude,
    orderBy: {
      updatedAt: 'desc'
    }
  });
}

export async function listCommitteePacketCandidates(db: PrismaClient = prisma) {
  const assets = await db.asset.findMany({
    where: {
      status: {
        in: [AssetStatus.IC_READY, AssetStatus.APPROVED]
      }
    },
    select: {
      id: true,
      name: true,
      assetCode: true,
      assetClass: true,
      status: true,
      updatedAt: true,
      valuations: {
        select: {
          id: true,
          runLabel: true,
          createdAt: true,
          confidenceScore: true
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 1
      },
      deals: {
        select: {
          id: true,
          dealCode: true,
          title: true,
          stage: true,
          nextAction: true
        },
        orderBy: {
          updatedAt: 'desc'
        },
        take: 1
      }
    },
    orderBy: {
      updatedAt: 'desc'
    }
  });

  const packetAssetIds = new Set(
    (
      await db.investmentCommitteePacket.findMany({
        where: {
          assetId: {
            not: null
          },
          status: {
            in: [
              CommitteePacketStatus.DRAFT,
              CommitteePacketStatus.READY,
              CommitteePacketStatus.LOCKED,
              CommitteePacketStatus.CONDITIONAL
            ]
          }
        },
        select: {
          assetId: true
        }
      })
    )
      .map((packet) => packet.assetId)
      .filter((value): value is string => Boolean(value))
  );

  return assets.filter((asset) => !packetAssetIds.has(asset.id));
}

export async function getCommitteeWorkspace(db: PrismaClient = prisma) {
  const [meetings, packets, candidates] = await Promise.all([
    listCommitteeMeetings(db),
    listCommitteePackets(db),
    listCommitteePacketCandidates(db)
  ]);

  return {
    meetings,
    packets,
    candidates,
    dashboard: buildCommitteeDashboard(meetings, packets, candidates)
  };
}
