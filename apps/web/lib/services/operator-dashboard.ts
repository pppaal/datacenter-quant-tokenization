import {
  CommitteePacketStatus,
  DealDiligenceWorkstreamStatus,
  DealStage,
  ResearchApprovalStatus,
  TaskStatus,
  type PrismaClient
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export type PipelineStageCount = {
  stage: DealStage;
  count: number;
};

export type OperatorActionItem = {
  key: string;
  label: string;
  description: string;
  count: number;
  severity: 'good' | 'warn' | 'danger';
  href: string;
};

export type OperatorActivityEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: string;
  statusLabel: string;
  createdAt: Date;
};

export type OperatorDashboardData = {
  pipeline: {
    stages: PipelineStageCount[];
    totalActive: number;
    maxStageCount: number;
  };
  portfolio: {
    totalAumKrw: number;
    totalAssets: number;
    avgOccupancyPct: number;
    avgNoiYieldPct: number;
  };
  capital: {
    totalCommittedKrw: number;
    totalCalledKrw: number;
    totalDistributedKrw: number;
  };
  actionItems: OperatorActionItem[];
  recentActivity: OperatorActivityEntry[];
};

const PIPELINE_STAGE_ORDER: DealStage[] = [
  DealStage.SOURCED,
  DealStage.SCREENED,
  DealStage.NDA,
  DealStage.LOI,
  DealStage.DD,
  DealStage.IC,
  DealStage.CLOSING,
  DealStage.ASSET_MANAGEMENT
];

function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'object' && 'toNumber' in (value as object)) {
    try {
      const n = (value as { toNumber: () => number }).toNumber();
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

export async function buildOperatorDashboard(
  db: PrismaClient = prisma
): Promise<OperatorDashboardData> {
  const now = new Date();

  const [
    dealStageGroups,
    portfolioAssets,
    commitmentTotals,
    draftLockedPackets,
    draftSnapshots,
    overdueOpenTasks,
    blockedWorkstreams,
    auditEvents
  ] = await Promise.all([
    db.deal.groupBy({
      by: ['stage'],
      where: { archivedAt: null },
      _count: { _all: true }
    }),
    db.portfolioAsset.findMany({
      include: {
        asset: {
          select: {
            id: true,
            purchasePriceKrw: true
          }
        },
        monthlyKpis: {
          orderBy: { periodStart: 'desc' },
          take: 1
        }
      }
    }),
    db.commitment.aggregate({
      _sum: {
        commitmentKrw: true,
        calledKrw: true,
        distributedKrw: true
      }
    }),
    db.investmentCommitteePacket.count({
      where: {
        status: { in: [CommitteePacketStatus.DRAFT, CommitteePacketStatus.LOCKED] }
      }
    }),
    db.researchSnapshot.count({
      where: { approvalStatus: ResearchApprovalStatus.DRAFT }
    }),
    db.task.count({
      where: {
        status: TaskStatus.OPEN,
        dueDate: { lt: now, not: null }
      }
    }),
    db.dealDiligenceWorkstream.count({
      where: { status: DealDiligenceWorkstreamStatus.BLOCKED }
    }),
    db.auditEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10
    })
  ]);

  const stageCountMap = new Map<DealStage, number>();
  for (const stage of PIPELINE_STAGE_ORDER) stageCountMap.set(stage, 0);
  for (const group of dealStageGroups) {
    stageCountMap.set(group.stage, group._count._all);
  }
  const stages: PipelineStageCount[] = PIPELINE_STAGE_ORDER.map((stage) => ({
    stage,
    count: stageCountMap.get(stage) ?? 0
  }));
  const totalActive = stages.reduce((acc, s) => acc + s.count, 0);
  const maxStageCount = stages.reduce((acc, s) => (s.count > acc ? s.count : acc), 0);

  let totalAumKrw = 0;
  let occupancySum = 0;
  let occupancyCount = 0;
  let noiYieldSum = 0;
  let noiYieldCount = 0;

  for (const pa of portfolioAssets) {
    const asset = pa.asset;
    if (!asset) continue;
    const purchasePrice = toNumber(asset.purchasePriceKrw);
    totalAumKrw += purchasePrice;

    const latestKpi = pa.monthlyKpis[0] ?? null;
    if (!latestKpi) continue;

    const occupancyPct = toNumber(latestKpi.occupancyPct);
    if (latestKpi.occupancyPct != null) {
      occupancySum += occupancyPct;
      occupancyCount += 1;
    }

    const noiKrw = toNumber(latestKpi.noiKrw);
    const holdValue =
      toNumber(pa.currentHoldValueKrw) || toNumber(latestKpi.navKrw) || purchasePrice;
    if (latestKpi.noiKrw != null && holdValue > 0) {
      const noiYieldPct = ((noiKrw * 12) / holdValue) * 100;
      noiYieldSum += noiYieldPct;
      noiYieldCount += 1;
    }
  }

  const totalCommittedKrw = toNumber(commitmentTotals._sum.commitmentKrw);
  const totalCalledKrw = toNumber(commitmentTotals._sum.calledKrw);
  const totalDistributedKrw = toNumber(commitmentTotals._sum.distributedKrw);

  const actionItems: OperatorActionItem[] = [
    {
      key: 'committee-awaiting',
      label: 'Committee packets awaiting decision',
      description: 'Draft or locked packets sitting in the IC queue without a recorded decision.',
      count: draftLockedPackets,
      severity: draftLockedPackets === 0 ? 'good' : draftLockedPackets > 5 ? 'danger' : 'warn',
      href: '/admin/ic'
    },
    {
      key: 'research-draft',
      label: 'Research snapshots awaiting approval',
      description: 'Draft research views blocking downstream underwriting and reporting.',
      count: draftSnapshots,
      severity: draftSnapshots === 0 ? 'good' : draftSnapshots > 10 ? 'danger' : 'warn',
      href: '/admin/research'
    },
    {
      key: 'tasks-overdue',
      label: 'Overdue deal tasks',
      description: 'Open tasks across live deals that have passed their due date.',
      count: overdueOpenTasks,
      severity: overdueOpenTasks === 0 ? 'good' : overdueOpenTasks > 10 ? 'danger' : 'warn',
      href: '/admin/deals'
    },
    {
      key: 'diligence-blocked',
      label: 'Blocked diligence workstreams',
      description: 'Workstreams flagged blocked by advisors, legal, or technical leads.',
      count: blockedWorkstreams,
      severity: blockedWorkstreams === 0 ? 'good' : blockedWorkstreams > 3 ? 'danger' : 'warn',
      href: '/admin/deals'
    }
  ];

  const recentActivity: OperatorActivityEntry[] = auditEvents.map((event) => ({
    id: event.id,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    actor: event.actorIdentifier,
    statusLabel: event.statusLabel,
    createdAt: event.createdAt
  }));

  return {
    pipeline: {
      stages,
      totalActive,
      maxStageCount
    },
    portfolio: {
      totalAumKrw,
      totalAssets: portfolioAssets.length,
      avgOccupancyPct: occupancyCount > 0 ? occupancySum / occupancyCount : 0,
      avgNoiYieldPct: noiYieldCount > 0 ? noiYieldSum / noiYieldCount : 0
    },
    capital: {
      totalCommittedKrw,
      totalCalledKrw,
      totalDistributedKrw
    },
    actionItems,
    recentActivity
  };
}
