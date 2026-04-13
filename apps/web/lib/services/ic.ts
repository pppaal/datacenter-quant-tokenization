import crypto from 'node:crypto';
import {
  AssetStatus,
  CommitteeDecisionOutcome,
  CommitteePacketStatus,
  type Prisma,
  type PrismaClient
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { buildDealDiligenceSummary } from '@/lib/services/deals';
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
      targetCloseDate: true,
      assetClass: true,
      diligenceWorkstreams: {
        select: {
          id: true,
          workstreamType: true,
          status: true,
          requestedAt: true,
          signedOffAt: true,
          blockerSummary: true,
          deliverables: {
            select: {
              id: true
            }
          }
        }
      }
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

export type CommitteePacketLockReadiness = {
  canLock: boolean;
  blockerCount: number;
  blockers: string[];
  diligenceSummary: ReturnType<typeof buildDealDiligenceSummary> | null;
};

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
    assetClass: string | null;
    diligenceWorkstreams: Array<{
      id: string;
      workstreamType: string;
      status: string;
      requestedAt: Date | null;
      signedOffAt: Date | null;
      blockerSummary: string | null;
      deliverables: Array<{
        id: string;
      }>;
    }>;
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
  const packets = await db.investmentCommitteePacket.findMany({
    include: committeePacketInclude,
    orderBy: {
      updatedAt: 'desc'
    }
  });

  return packets.map((packet) => ({
    ...packet,
    lockReadiness: buildCommitteePacketLockReadiness(packet)
  }));
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
          nextAction: true,
          assetClass: true,
          diligenceWorkstreams: {
            select: {
              id: true,
              workstreamType: true,
              status: true,
              requestedAt: true,
              signedOffAt: true,
              blockerSummary: true,
              deliverables: {
                select: {
                  id: true
                }
              }
            }
          }
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

  return assets
    .filter((asset) => !packetAssetIds.has(asset.id))
    .map((asset) => {
      const leadDeal = asset.deals[0] ?? null;
      const diligenceSummary = leadDeal
        ? buildDealDiligenceSummary(
            {
              assetClass: leadDeal.assetClass ?? asset.assetClass,
              asset: null
            } as any,
            leadDeal.diligenceWorkstreams as any
          )
        : null;

      return {
        ...asset,
        leadDeal,
        diligenceSummary
      };
    });
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

export function buildCommitteePacketLockReadiness(
  packet: CommitteePacketRecord
): CommitteePacketLockReadiness {
  const blockers: string[] = [];
  const diligenceSummary = packet.deal
    ? buildDealDiligenceSummary(
        {
          assetClass: packet.deal.assetClass ?? packet.asset?.assetClass ?? null,
          asset: packet.asset ?? null
        } as any,
        packet.deal.diligenceWorkstreams as any
      )
    : null;

  if (!packet.assetId) blockers.push('Link an asset before locking the packet.');
  if (!packet.dealId) blockers.push('Link a live deal before locking the packet.');
  if (!packet.valuationRunId) blockers.push('Attach a valuation run before locking the packet.');
  if (packet.valuationRun && packet.valuationRun.approvalStatus !== 'APPROVED') {
    blockers.push('Approve the linked valuation run before packet lock.');
  }
  if (diligenceSummary) {
    if (diligenceSummary.blockedCount > 0) {
      blockers.push(`${diligenceSummary.blockedCount} specialist DD lane(s) are blocked.`);
    }
    if (diligenceSummary.missingCoreTypes.length > 0) {
      blockers.push(
        `Missing core DD lane(s): ${diligenceSummary.missingCoreTypes.join(', ')}.`
      );
    }
    if (diligenceSummary.uncoveredCoreTypes.length > 0) {
      blockers.push(
        `Supporting deliverables are missing for ${diligenceSummary.uncoveredCoreTypes.join(', ')}.`
      );
    }
  }

  if (packet.status === CommitteePacketStatus.RELEASED) {
    blockers.push('Released packets are immutable.');
  }

  return {
    canLock: blockers.length === 0,
    blockerCount: blockers.length,
    blockers,
    diligenceSummary
  };
}

function buildCommitteePacketFingerprint(packet: CommitteePacketRecord, readiness: CommitteePacketLockReadiness) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        packetId: packet.id,
        packetCode: packet.packetCode,
        assetId: packet.assetId,
        dealId: packet.dealId,
        valuationRunId: packet.valuationRunId,
        diligenceSummary: readiness.diligenceSummary
          ? {
              signedOffCount: readiness.diligenceSummary.signedOffCount,
              deliverableCount: readiness.diligenceSummary.deliverableCount,
              missingCoreTypes: readiness.diligenceSummary.missingCoreTypes,
              uncoveredCoreTypes: readiness.diligenceSummary.uncoveredCoreTypes,
              blockedCount: readiness.diligenceSummary.blockedCount
            }
          : null
      })
    )
    .digest('hex');
}

export async function lockCommitteePacket(
  packetId: string,
  actorLabel: string,
  db: PrismaClient = prisma
) {
  const packet = await db.investmentCommitteePacket.findUnique({
    where: { id: packetId },
    include: committeePacketInclude
  });

  if (!packet) {
    throw new Error('Committee packet not found.');
  }

  if (packet.status === CommitteePacketStatus.LOCKED) {
    throw new Error('Packet is already locked.');
  }
  if (packet.status === CommitteePacketStatus.RELEASED) {
    throw new Error('Released packets are immutable and cannot be re-locked.');
  }

  const readiness = buildCommitteePacketLockReadiness(packet);
  if (!readiness.canLock) {
    throw new Error(readiness.blockers[0] ?? 'Packet cannot be locked yet.');
  }

  const fingerprint = buildCommitteePacketFingerprint(packet, readiness);

  return db.investmentCommitteePacket.update({
    where: { id: packetId },
    data: {
      status: CommitteePacketStatus.LOCKED,
      lockedAt: new Date(),
      preparedByLabel: actorLabel,
      packetFingerprint: packet.packetFingerprint ?? fingerprint,
      reportFingerprint: packet.reportFingerprint ?? fingerprint,
      reviewPacketFingerprint: packet.reviewPacketFingerprint ?? fingerprint
    },
    include: committeePacketInclude
  });
}

export async function decideCommitteePacket(
  packetId: string,
  input: {
    outcome: CommitteeDecisionOutcome;
    notes?: string | null;
    followUpActions?: string | null;
  },
  actorLabel: string,
  db: PrismaClient = prisma
) {
  const packet = await db.investmentCommitteePacket.findUnique({
    where: { id: packetId },
    include: committeePacketInclude
  });

  if (!packet) {
    throw new Error('Committee packet not found.');
  }

  if (packet.status !== CommitteePacketStatus.LOCKED) {
    throw new Error('Only locked packets can receive committee decisions.');
  }

  const outcomeStatusMap: Record<CommitteeDecisionOutcome, CommitteePacketStatus> = {
    APPROVED: CommitteePacketStatus.APPROVED,
    CONDITIONAL: CommitteePacketStatus.CONDITIONAL,
    DECLINED: CommitteePacketStatus.DECLINED,
    DEFERRED: CommitteePacketStatus.READY
  };

  const nextStatus = outcomeStatusMap[input.outcome];

  return db.$transaction(async (tx) => {
    await tx.investmentCommitteeDecision.create({
      data: {
        packetId: packet.id,
        outcome: input.outcome,
        decidedAt: new Date(),
        decidedByLabel: actorLabel,
        notes: input.notes?.trim() || null,
        followUpActions: input.followUpActions?.trim() || null
      }
    });

    return tx.investmentCommitteePacket.update({
      where: { id: packet.id },
      data: {
        status: nextStatus,
        decisionSummary: input.notes?.trim() || packet.decisionSummary,
        followUpSummary: input.followUpActions?.trim() || packet.followUpSummary
      },
      include: committeePacketInclude
    });
  });
}

export async function releaseCommitteePacket(
  packetId: string,
  actorLabel: string,
  db: PrismaClient = prisma
) {
  const packet = await db.investmentCommitteePacket.findUnique({
    where: { id: packetId },
    include: committeePacketInclude
  });

  if (!packet) {
    throw new Error('Committee packet not found.');
  }

  if (packet.status === CommitteePacketStatus.RELEASED) {
    throw new Error('Packet has already been released.');
  }

  if (
    packet.status !== CommitteePacketStatus.APPROVED &&
    packet.status !== CommitteePacketStatus.CONDITIONAL &&
    packet.status !== CommitteePacketStatus.DECLINED
  ) {
    throw new Error('Only decided packets can be released.');
  }

  return db.investmentCommitteePacket.update({
    where: { id: packet.id },
    data: {
      status: CommitteePacketStatus.RELEASED,
      releasedAt: new Date(),
      preparedByLabel: actorLabel
    },
    include: committeePacketInclude
  });
}
