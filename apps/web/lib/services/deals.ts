import {
  ActivityType,
  DealBidStatus,
  DealRequestStatus,
  DealStage,
  Prisma,
  RiskSeverity,
  TaskPriority,
  TaskStatus,
  type PrismaClient
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { dealStageChecklistTemplates } from '@/lib/deals/config';
import { slugify } from '@/lib/utils';
import {
  dealArchiveSchema,
  dealActivitySchema,
  dealBidRevisionCreateSchema,
  dealBidRevisionUpdateSchema,
  dealCloseOutSchema,
  dealCounterpartySchema,
  dealCreateSchema,
  dealDocumentRequestCreateSchema,
  dealDocumentRequestUpdateSchema,
  dealRiskFlagSchema,
  dealRiskFlagUpdateSchema,
  dealRestoreSchema,
  dealStageOrder,
  dealStageUpdateSchema,
  dealTaskCreateSchema,
  dealTaskUpdateSchema,
  dealUpdateSchema
} from '@/lib/validations/deal';

export const dealStageMeta = dealStageOrder.map((stage) => ({
  value: stage,
  label: stage.toLowerCase().replaceAll('_', ' ')
}));

export const dealListInclude = Prisma.validator<Prisma.DealInclude>()({
  asset: {
    include: {
      address: true,
      documents: {
        take: 10,
        orderBy: {
          updatedAt: 'desc'
        }
      },
      valuations: {
        take: 8,
        orderBy: {
          createdAt: 'desc'
        }
      }
    }
  },
  counterparties: {
    orderBy: {
      createdAt: 'asc'
    }
  },
  tasks: {
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'asc' }]
  },
  documentRequests: {
    include: {
      counterparty: true,
      document: true
    },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'asc' }]
  },
  bidRevisions: {
    include: {
      counterparty: true
    },
    orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
    take: 6
  },
  riskFlags: {
    orderBy: [{ isResolved: 'asc' }, { createdAt: 'desc' }]
  },
  activityLogs: {
    include: {
      counterparty: true
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 1
  }
});

export type DealListRecord = Prisma.DealGetPayload<{
  include: typeof dealListInclude;
}>;

export const dealDetailInclude = Prisma.validator<Prisma.DealInclude>()({
  asset: {
    include: {
      address: true,
      documents: {
        take: 20,
        orderBy: {
          updatedAt: 'desc'
        }
      },
      valuations: {
        take: 8,
        orderBy: {
          createdAt: 'desc'
        }
      }
    }
  },
  counterparties: {
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }]
  },
  tasks: {
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }]
  },
  documentRequests: {
    include: {
      counterparty: true,
      document: true
    },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'asc' }]
  },
  bidRevisions: {
    include: {
      counterparty: true
    },
    orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }]
  },
  riskFlags: {
    orderBy: [{ isResolved: 'asc' }, { severity: 'desc' }, { createdAt: 'desc' }]
  },
  activityLogs: {
    include: {
      counterparty: true
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 40
  }
});

export type DealDetailRecord = Prisma.DealGetPayload<{
  include: typeof dealDetailInclude;
}>;

export type DealTimelineEvent = {
  id: string;
  kind: 'activity' | 'valuation';
  category: 'execution' | 'note' | 'risk' | 'valuation';
  title: string;
  body: string | null;
  createdAt: Date;
  href: string | null;
  tone: 'neutral' | 'good' | 'warn';
  meta: string[];
};

export type DealDataCoverage = {
  scorePct: number;
  completedCount: number;
  totalCount: number;
  evidence: {
    linkedAsset: boolean;
    valuationCount: number;
    documentCount: number;
    requestCount: number;
    fulfilledRequestCount: number;
    bidRevisionCount: number;
    counterpartyCount: number;
    requiredChecklistPct: number;
  };
  checks: Array<{
    key: string;
    title: string;
    status: 'done' | 'missing';
    detail: string;
  }>;
  gaps: string[];
};

function sameUtcDay(left: Date, right: Date) {
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth() &&
    left.getUTCDate() === right.getUTCDate()
  );
}

function getStageIndex(stage: DealStage) {
  return dealStageOrder.indexOf(stage);
}

function assertValidStageTransition(from: DealStage, to: DealStage) {
  if (from === to) return;

  const fromIndex = getStageIndex(from);
  const toIndex = getStageIndex(to);
  if (fromIndex === -1 || toIndex === -1) {
    throw new Error('Unsupported deal stage transition');
  }

  if (to === DealStage.ASSET_MANAGEMENT && from !== DealStage.CLOSING) {
    throw new Error('A deal can move to asset management only after closing');
  }

  if (toIndex < fromIndex - 1) {
    throw new Error('Stage rollbacks are limited to the previous stage');
  }
}

function getDefaultNextAction(stage: DealStage) {
  switch (stage) {
    case DealStage.SOURCED:
      return 'Triage the teaser, confirm sponsor credibility, and set screen/no-screen call.';
    case DealStage.SCREENED:
      return 'Request core diligence pack and decide whether to push for NDA.';
    case DealStage.NDA:
      return 'Get NDA fully executed and open the seller data room.';
    case DealStage.LOI:
      return 'Submit LOI with price, certainty, diligence scope, and access requests.';
    case DealStage.DD:
      return 'Run confirmatory diligence and clear closing blockers.';
    case DealStage.IC:
      return 'Prepare IC package and secure internal approvals.';
    case DealStage.CLOSING:
      return 'Track documents, conditions precedent, and funds flow to close.';
    case DealStage.ASSET_MANAGEMENT:
      return 'Hand over to execution and asset management rhythm.';
    default:
      return null;
  }
}

function getChecklistTemplates(stage: DealStage) {
  return dealStageChecklistTemplates[stage] ?? [];
}

function getChecklistTaskKey(stage: DealStage, key: string) {
  return `${stage.toLowerCase()}::${key}`;
}

function formatStageLabel(stage: DealStage) {
  return stage.toLowerCase().replaceAll('_', ' ');
}

async function buildNextDealCode(db: PrismaClient) {
  const count = await db.deal.count();
  return `DEAL-${String(count + 1).padStart(4, '0')}`;
}

async function createActivityLog(
  db: PrismaClient,
  input: {
    dealId: string;
    activityType: ActivityType;
    title: string;
    body?: string | null;
    counterpartyId?: string | null;
    stageFrom?: DealStage | null;
    stageTo?: DealStage | null;
    metadata?: Prisma.InputJsonValue | null;
    createdByLabel?: string | null;
  }
) {
  return db.activityLog.create({
    data: {
      dealId: input.dealId,
      activityType: input.activityType,
      title: input.title,
      body: input.body ?? null,
      counterpartyId: input.counterpartyId ?? null,
      stageFrom: input.stageFrom ?? null,
      stageTo: input.stageTo ?? null,
      metadata: input.metadata ?? undefined,
      createdByLabel: input.createdByLabel ?? 'solo_operator'
    }
  });
}

export async function listDeals(db: PrismaClient = prisma) {
  return db.deal.findMany({
    include: dealListInclude,
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }]
  });
}

export async function getDealById(id: string, db: PrismaClient = prisma) {
  return db.deal.findUnique({
    where: { id },
    include: dealDetailInclude
  });
}

export async function createDeal(input: unknown, db: PrismaClient = prisma) {
  const parsed = dealCreateSchema.parse(input);
  const linkedAsset = parsed.assetId
    ? await db.asset.findUnique({
        where: { id: parsed.assetId },
        include: { address: true }
      })
    : null;
  const dealCode = await buildNextDealCode(db);
  const title = parsed.title.trim();
  const stage = parsed.stage;
  const nextAction = parsed.nextAction ?? getDefaultNextAction(stage);

  const created = await db.deal.create({
    data: {
      dealCode,
      slug: slugify(`${dealCode} ${title}`),
      title,
      stage,
      market: parsed.market ?? linkedAsset?.market ?? 'KR',
      city: parsed.city ?? linkedAsset?.address?.city ?? null,
      country: parsed.country ?? linkedAsset?.address?.country ?? null,
      assetClass: parsed.assetClass ?? linkedAsset?.assetClass ?? null,
      strategy: parsed.strategy ?? null,
      headline: parsed.headline ?? null,
      nextAction,
      nextActionAt: parsed.nextActionAt ?? null,
      targetCloseDate: parsed.targetCloseDate ?? null,
      sellerGuidanceKrw: parsed.sellerGuidanceKrw ?? null,
      bidGuidanceKrw: parsed.bidGuidanceKrw ?? null,
      purchasePriceKrw: parsed.purchasePriceKrw ?? linkedAsset?.purchasePriceKrw ?? null,
      statusLabel: parsed.statusLabel ?? 'ACTIVE',
      dealLead: parsed.dealLead ?? 'solo_operator',
      assetId: parsed.assetId ?? null
    },
    include: dealDetailInclude
  });

  await createActivityLog(db, {
    dealId: created.id,
    activityType: ActivityType.GENERAL,
    title: 'Deal created',
    body: `Execution record opened in ${formatStageLabel(stage)} stage.`,
    stageTo: stage
  });

  if (nextAction) {
    await createActivityLog(db, {
      dealId: created.id,
      activityType: ActivityType.NEXT_ACTION,
      title: 'Next action set',
      body: nextAction
    });
  }

  return getDealById(created.id, db);
}

export async function updateDeal(id: string, input: unknown, db: PrismaClient = prisma) {
  const parsed = dealUpdateSchema.parse(input);
  const current = await db.deal.findUnique({ where: { id } });
  if (!current) throw new Error('Deal not found');

  if (parsed.stage) {
    assertValidStageTransition(current.stage, parsed.stage);
  }

  const updated = await db.deal.update({
    where: { id },
    data: {
      title: parsed.title ?? undefined,
      stage: parsed.stage ?? undefined,
      market: parsed.market ?? undefined,
      city: parsed.city ?? undefined,
      country: parsed.country ?? undefined,
      assetClass: parsed.assetClass === undefined ? undefined : parsed.assetClass,
      strategy: parsed.strategy ?? undefined,
      headline: parsed.headline ?? undefined,
      nextAction: parsed.nextAction ?? undefined,
      nextActionAt: parsed.nextActionAt ?? undefined,
      targetCloseDate: parsed.targetCloseDate ?? undefined,
      sellerGuidanceKrw: parsed.sellerGuidanceKrw ?? undefined,
      bidGuidanceKrw: parsed.bidGuidanceKrw ?? undefined,
      purchasePriceKrw: parsed.purchasePriceKrw ?? undefined,
      statusLabel: parsed.statusLabel ?? undefined,
      closeOutcome: parsed.closeOutcome ?? undefined,
      closeSummary: parsed.closeSummary ?? undefined,
      dealLead: parsed.dealLead ?? undefined
    }
  });

  if (parsed.stage && parsed.stage !== current.stage) {
    await createActivityLog(db, {
      dealId: id,
      activityType: ActivityType.STAGE_CHANGED,
      title: 'Stage updated',
      body: `Moved from ${formatStageLabel(current.stage)} to ${formatStageLabel(parsed.stage)}.`,
      stageFrom: current.stage,
      stageTo: parsed.stage
    });
  }

  if (parsed.nextAction && parsed.nextAction !== current.nextAction) {
    await createActivityLog(db, {
      dealId: id,
      activityType: ActivityType.NEXT_ACTION,
      title: 'Next action updated',
      body: parsed.nextAction
    });
  }

  if (parsed.statusLabel && parsed.statusLabel !== current.statusLabel) {
    await createActivityLog(db, {
      dealId: id,
      activityType: ActivityType.GENERAL,
      title: 'Deal status updated',
      body: `Status changed from ${current.statusLabel} to ${parsed.statusLabel}.`
    });
  }

  return getDealById(updated.id, db);
}

export async function updateDealStage(id: string, input: unknown, db: PrismaClient = prisma) {
  const parsed = dealStageUpdateSchema.parse(input);
  const current = await db.deal.findUnique({ where: { id } });
  if (!current) throw new Error('Deal not found');

  assertValidStageTransition(current.stage, parsed.stage);

  const nextAction = current.nextAction ?? getDefaultNextAction(parsed.stage);
  await db.deal.update({
    where: { id },
    data: {
      stage: parsed.stage,
      nextAction
    }
  });

  await createActivityLog(db, {
    dealId: id,
    activityType: ActivityType.STAGE_CHANGED,
    title: 'Stage updated',
    body: parsed.note ?? `Moved from ${formatStageLabel(current.stage)} to ${formatStageLabel(parsed.stage)}.`,
    stageFrom: current.stage,
    stageTo: parsed.stage
  });

  if (!current.nextAction && nextAction) {
    await createActivityLog(db, {
      dealId: id,
      activityType: ActivityType.NEXT_ACTION,
      title: 'Next action set from stage workflow',
      body: nextAction
    });
  }

  return getDealById(id, db);
}

export async function createDealCounterparty(dealId: string, input: unknown, db: PrismaClient = prisma) {
  const parsed = dealCounterpartySchema.parse(input);
  const deal = await db.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new Error('Deal not found');

  const counterparty = await db.counterparty.create({
    data: {
      dealId,
      name: parsed.name,
      role: parsed.role.toUpperCase(),
      shortName: parsed.shortName ?? parsed.name.slice(0, 48),
      company: parsed.company ?? null,
      email: parsed.email ?? null,
      phone: parsed.phone ?? null,
      notes: parsed.notes ?? null
    }
  });

  await createActivityLog(db, {
    dealId,
    activityType: ActivityType.COUNTERPARTY_ADDED,
    counterpartyId: counterparty.id,
    title: 'Counterparty added',
    body: `${counterparty.name} added as ${counterparty.role.toLowerCase()}.`
  });

  return counterparty;
}

async function getNextTaskSortOrder(dealId: string, db: PrismaClient) {
  const latest = await db.task.findFirst({
    where: { dealId },
    orderBy: { sortOrder: 'desc' }
  });
  return (latest?.sortOrder ?? 0) + 1;
}

async function createTaskInternal(
  dealId: string,
  input: {
    title: string;
    description?: string | null;
    status?: TaskStatus;
    priority?: TaskPriority;
    ownerLabel?: string | null;
    dueDate?: Date | null;
    checklistKey?: string | null;
    isRequired?: boolean;
  },
  db: PrismaClient
) {
  return db.task.create({
    data: {
      dealId,
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? TaskStatus.OPEN,
      priority: input.priority ?? TaskPriority.MEDIUM,
      ownerLabel: input.ownerLabel ?? 'solo_operator',
      dueDate: input.dueDate ?? null,
      checklistKey: input.checklistKey ?? null,
      isRequired: input.isRequired ?? false,
      sortOrder: await getNextTaskSortOrder(dealId, db)
    }
  });
}

export async function createDealTask(dealId: string, input: unknown, db: PrismaClient = prisma) {
  const parsed = dealTaskCreateSchema.parse(input);
  const deal = await db.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new Error('Deal not found');

  const task = await createTaskInternal(
    dealId,
    {
      title: parsed.title,
      description: parsed.description ?? null,
      status: parsed.status,
      priority: parsed.priority,
      ownerLabel: parsed.ownerLabel ?? 'solo_operator',
      dueDate: parsed.dueDate ?? null
    },
    db
  );

  await createActivityLog(db, {
    dealId,
    activityType: ActivityType.TASK_CREATED,
    title: 'Task added',
    body: `${task.title} (${task.priority.toLowerCase()})`
  });

  return task;
}

export async function createDealDocumentRequest(dealId: string, input: unknown, db: PrismaClient = prisma) {
  const parsed = dealDocumentRequestCreateSchema.parse(input);
  const deal = await db.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new Error('Deal not found');

  if (parsed.counterpartyId) {
    const counterparty = await db.counterparty.findFirst({
      where: { id: parsed.counterpartyId, dealId }
    });
    if (!counterparty) throw new Error('Counterparty not found for this deal');
  }

  if (parsed.documentId && deal.assetId) {
    const document = await db.document.findFirst({
      where: { id: parsed.documentId, assetId: deal.assetId }
    });
    if (!document) throw new Error('Document not found for linked asset');
  }

  const request = await db.dealDocumentRequest.create({
    data: {
      dealId,
      title: parsed.title,
      category: parsed.category ?? null,
      counterpartyId: parsed.counterpartyId ?? null,
      documentId: parsed.documentId ?? null,
      status: parsed.status as DealRequestStatus,
      priority: parsed.priority,
      dueDate: parsed.dueDate ?? null,
      requestedAt: parsed.requestedAt ?? new Date(),
      receivedAt: parsed.receivedAt ?? (parsed.status === 'RECEIVED' ? new Date() : null),
      notes: parsed.notes ?? null
    },
    include: {
      counterparty: true,
      document: true
    }
  });

  await createActivityLog(db, {
    dealId,
    activityType: ActivityType.GENERAL,
    counterpartyId: request.counterpartyId,
    title: 'DD request logged',
    body: `${request.title} (${request.status.toLowerCase()})`
  });

  return request;
}

export async function updateDealDocumentRequest(
  dealId: string,
  requestId: string,
  input: unknown,
  db: PrismaClient = prisma
) {
  const parsed = dealDocumentRequestUpdateSchema.parse(input);
  const request = await db.dealDocumentRequest.findFirst({
    where: { id: requestId, dealId }
  });
  if (!request) throw new Error('Document request not found');

  if (parsed.counterpartyId) {
    const counterparty = await db.counterparty.findFirst({
      where: { id: parsed.counterpartyId, dealId }
    });
    if (!counterparty) throw new Error('Counterparty not found for this deal');
  }

  const nextStatus = parsed.status ?? request.status;
  const updated = await db.dealDocumentRequest.update({
    where: { id: requestId },
    data: {
      title: parsed.title ?? undefined,
      category: parsed.category ?? undefined,
      counterpartyId: parsed.counterpartyId ?? undefined,
      documentId: parsed.documentId ?? undefined,
      status: nextStatus as DealRequestStatus,
      priority: parsed.priority ?? undefined,
      dueDate: parsed.dueDate ?? undefined,
      requestedAt: parsed.requestedAt ?? undefined,
      receivedAt:
        parsed.receivedAt !== undefined
          ? parsed.receivedAt
          : nextStatus === 'RECEIVED'
            ? request.receivedAt ?? new Date()
            : nextStatus === 'WAIVED'
              ? null
              : request.receivedAt,
      notes: parsed.notes ?? undefined
    },
    include: {
      counterparty: true,
      document: true
    }
  });

  await createActivityLog(db, {
    dealId,
    activityType: ActivityType.GENERAL,
    counterpartyId: updated.counterpartyId,
    title: 'DD request updated',
    body: `${updated.title} is ${updated.status.toLowerCase()}.`
  });

  return updated;
}

export async function createDealBidRevision(dealId: string, input: unknown, db: PrismaClient = prisma) {
  const parsed = dealBidRevisionCreateSchema.parse(input);
  const deal = await db.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new Error('Deal not found');

  if (parsed.counterpartyId) {
    const counterparty = await db.counterparty.findFirst({
      where: { id: parsed.counterpartyId, dealId }
    });
    if (!counterparty) throw new Error('Counterparty not found for this deal');
  }

  const bidRevision = await db.dealBidRevision.create({
    data: {
      dealId,
      counterpartyId: parsed.counterpartyId ?? null,
      label: parsed.label,
      status: parsed.status,
      bidPriceKrw: parsed.bidPriceKrw,
      depositKrw: parsed.depositKrw ?? null,
      exclusivityDays: parsed.exclusivityDays ?? null,
      diligenceDays: parsed.diligenceDays ?? null,
      closeTimelineDays: parsed.closeTimelineDays ?? null,
      submittedAt: parsed.submittedAt ?? (parsed.status !== DealBidStatus.DRAFT ? new Date() : null),
      notes: parsed.notes ?? null
    },
    include: {
      counterparty: true
    }
  });

  await createActivityLog(db, {
    dealId,
    activityType: ActivityType.GENERAL,
    counterpartyId: bidRevision.counterpartyId,
    title: 'Bid revision logged',
    body: `${bidRevision.label} at ${bidRevision.bidPriceKrw.toLocaleString()} KRW (${bidRevision.status.toLowerCase()}).`,
    metadata: {
      bidRevisionId: bidRevision.id,
      status: bidRevision.status,
      bidPriceKrw: bidRevision.bidPriceKrw
    }
  });

  return bidRevision;
}

export async function updateDealBidRevision(
  dealId: string,
  bidRevisionId: string,
  input: unknown,
  db: PrismaClient = prisma
) {
  const parsed = dealBidRevisionUpdateSchema.parse(input);
  const bidRevision = await db.dealBidRevision.findFirst({
    where: { id: bidRevisionId, dealId }
  });
  if (!bidRevision) throw new Error('Bid revision not found');

  if (parsed.counterpartyId) {
    const counterparty = await db.counterparty.findFirst({
      where: { id: parsed.counterpartyId, dealId }
    });
    if (!counterparty) throw new Error('Counterparty not found for this deal');
  }

  const nextStatus = parsed.status ?? bidRevision.status;
  const updated = await db.dealBidRevision.update({
    where: { id: bidRevisionId },
    data: {
      label: parsed.label ?? undefined,
      counterpartyId: parsed.counterpartyId ?? undefined,
      status: nextStatus,
      bidPriceKrw: parsed.bidPriceKrw ?? undefined,
      depositKrw: parsed.depositKrw ?? undefined,
      exclusivityDays: parsed.exclusivityDays ?? undefined,
      diligenceDays: parsed.diligenceDays ?? undefined,
      closeTimelineDays: parsed.closeTimelineDays ?? undefined,
      submittedAt:
        parsed.submittedAt !== undefined
          ? parsed.submittedAt
          : nextStatus !== DealBidStatus.DRAFT
            ? bidRevision.submittedAt ?? new Date()
            : bidRevision.submittedAt,
      notes: parsed.notes ?? undefined
    },
    include: {
      counterparty: true
    }
  });

  await createActivityLog(db, {
    dealId,
    activityType: ActivityType.GENERAL,
    counterpartyId: updated.counterpartyId,
    title: 'Bid revision updated',
    body: `${updated.label} is now ${updated.status.toLowerCase()} at ${updated.bidPriceKrw.toLocaleString()} KRW.`,
    metadata: {
      bidRevisionId: updated.id,
      status: updated.status,
      bidPriceKrw: updated.bidPriceKrw
    }
  });

  return updated;
}

export async function updateDealTask(dealId: string, taskId: string, input: unknown, db: PrismaClient = prisma) {
  const parsed = dealTaskUpdateSchema.parse(input);
  const task = await db.task.findFirst({
    where: { id: taskId, dealId }
  });
  if (!task) throw new Error('Task not found');

  const nextStatus = parsed.status ?? task.status;
  const updated = await db.task.update({
    where: { id: taskId },
    data: {
      title: parsed.title ?? undefined,
      description: parsed.description ?? undefined,
      status: nextStatus,
      priority: parsed.priority ?? undefined,
      ownerLabel: parsed.ownerLabel ?? undefined,
      dueDate: parsed.dueDate ?? undefined,
      completedAt: nextStatus === TaskStatus.DONE ? new Date() : null
    }
  });

  await createActivityLog(db, {
    dealId,
    activityType: ActivityType.TASK_UPDATED,
    title: 'Task updated',
    body: `${updated.title} moved to ${updated.status.toLowerCase().replaceAll('_', ' ')}.`
  });

  return updated;
}

export async function createDealRiskFlag(dealId: string, input: unknown, db: PrismaClient = prisma) {
  const parsed = dealRiskFlagSchema.parse(input);
  const deal = await db.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new Error('Deal not found');

  const riskFlag = await db.riskFlag.create({
    data: {
      dealId,
      title: parsed.title,
      detail: parsed.detail ?? null,
      severity: parsed.severity,
      statusLabel: parsed.statusLabel ?? 'OPEN'
    }
  });

  await createActivityLog(db, {
    dealId,
    activityType: ActivityType.RISK_CREATED,
    title: 'Risk flag raised',
    body: `${riskFlag.title} (${riskFlag.severity.toLowerCase()})`
  });

  return riskFlag;
}

export async function updateDealRiskFlag(
  dealId: string,
  riskFlagId: string,
  input: unknown,
  db: PrismaClient = prisma
) {
  const parsed = dealRiskFlagUpdateSchema.parse(input);
  const riskFlag = await db.riskFlag.findFirst({
    where: { id: riskFlagId, dealId }
  });
  if (!riskFlag) throw new Error('Risk flag not found');

  const nextResolved = parsed.isResolved ?? riskFlag.isResolved;
  const updated = await db.riskFlag.update({
    where: { id: riskFlagId },
    data: {
      title: parsed.title ?? undefined,
      detail: parsed.detail ?? undefined,
      severity: parsed.severity ?? undefined,
      statusLabel: parsed.statusLabel ?? undefined,
      isResolved: nextResolved,
      resolvedAt: nextResolved ? new Date() : null
    }
  });

  await createActivityLog(db, {
    dealId,
    activityType: ActivityType.RISK_UPDATED,
    title: nextResolved ? 'Risk resolved' : 'Risk updated',
    body: `${updated.title} is ${nextResolved ? 'resolved' : updated.statusLabel.toLowerCase()}.`
  });

  return updated;
}

export async function createDealActivity(dealId: string, input: unknown, db: PrismaClient = prisma) {
  const parsed = dealActivitySchema.parse(input);
  const deal = await db.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new Error('Deal not found');

  const counterparty =
    parsed.counterpartyId != null
      ? await db.counterparty.findFirst({
          where: {
            id: parsed.counterpartyId,
            dealId
          }
        })
      : null;
  if (parsed.counterpartyId && !counterparty) {
    throw new Error('Counterparty not found for this deal');
  }

  return createActivityLog(db, {
    dealId,
    activityType: parsed.activityType,
    title: parsed.title,
    body: parsed.body ?? null,
    counterpartyId: parsed.counterpartyId ?? null
  });
}

export async function seedDealStageChecklist(dealId: string, db: PrismaClient = prisma) {
  const deal = await getDealById(dealId, db);
  if (!deal) throw new Error('Deal not found');

  const templates = getChecklistTemplates(deal.stage).filter((template) => template.kind === 'task');
  const existingKeys = new Set(deal.tasks.map((task) => task.checklistKey).filter(Boolean));
  const createdTasks = [];

  for (const template of templates) {
    const checklistKey = getChecklistTaskKey(deal.stage, template.key);
    if (existingKeys.has(checklistKey)) continue;

    const task = await createTaskInternal(
      dealId,
      {
        title: template.defaultTaskTitle ?? template.title,
        description: template.defaultTaskDescription ?? template.description,
        priority: template.priority ?? TaskPriority.MEDIUM,
        checklistKey,
        isRequired: true
      },
      db
    );
    createdTasks.push(task);
  }

  if (createdTasks.length > 0) {
    await createActivityLog(db, {
      dealId,
      activityType: ActivityType.TASK_CREATED,
      title: 'Stage checklist seeded',
      body: `${createdTasks.length} required tasks added for ${formatStageLabel(deal.stage)} stage.`
    });
  }

  return createdTasks;
}

export async function archiveDeal(dealId: string, input: unknown, db: PrismaClient = prisma) {
  const parsed = dealArchiveSchema.parse(input);
  const deal = await db.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new Error('Deal not found');

  await db.deal.update({
    where: { id: dealId },
    data: {
      statusLabel: 'ARCHIVED',
      archivedAt: new Date(),
      nextAction: null,
      closeSummary: parsed.summary ?? deal.closeSummary
    }
  });

  await createActivityLog(db, {
    dealId,
    activityType: ActivityType.GENERAL,
    title: 'Deal archived',
    body: parsed.summary ?? 'Execution record archived.'
  });

  return getDealById(dealId, db);
}

export async function restoreDeal(dealId: string, input: unknown, db: PrismaClient = prisma) {
  const parsed = dealRestoreSchema.parse(input);
  const deal = await db.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new Error('Deal not found');
  if (!deal.archivedAt && deal.statusLabel !== 'ARCHIVED' && deal.statusLabel !== 'CLOSED_LOST') {
    throw new Error('Deal is not archived');
  }

  await db.deal.update({
    where: { id: dealId },
    data: {
      statusLabel: 'ACTIVE',
      archivedAt: null,
      closedAt: deal.statusLabel === 'CLOSED_LOST' ? null : deal.closedAt,
      closeOutcome: deal.statusLabel === 'CLOSED_LOST' ? null : deal.closeOutcome,
      nextAction: deal.nextAction ?? getDefaultNextAction(deal.stage)
    }
  });

  await createActivityLog(db, {
    dealId,
    activityType: ActivityType.GENERAL,
    title: 'Deal restored',
    body: parsed.summary ?? 'Execution record restored from archive.'
  });

  return getDealById(dealId, db);
}

export async function closeOutDeal(dealId: string, input: unknown, db: PrismaClient = prisma) {
  const parsed = dealCloseOutSchema.parse(input);
  const deal = await db.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new Error('Deal not found');

  if (parsed.outcome === 'CLOSED_WON' && deal.stage !== DealStage.CLOSING && deal.stage !== DealStage.ASSET_MANAGEMENT) {
    throw new Error('Winning close-out requires the deal to be in closing or asset management');
  }

  const nextStage =
    parsed.outcome === 'CLOSED_WON'
      ? DealStage.ASSET_MANAGEMENT
      : deal.stage;

  await db.deal.update({
    where: { id: dealId },
    data: {
      stage: nextStage,
      statusLabel: parsed.outcome,
      closedAt: new Date(),
      closeOutcome: parsed.outcome,
      closeSummary: parsed.summary,
      nextAction: parsed.outcome === 'CLOSED_WON' ? 'Transition execution items into asset management.' : null,
      archivedAt: parsed.outcome === 'CLOSED_LOST' ? new Date() : null
    }
  });

  await createActivityLog(db, {
    dealId,
    activityType: ActivityType.GENERAL,
    title: parsed.outcome === 'CLOSED_WON' ? 'Deal closed' : 'Deal lost',
    body: parsed.summary,
    stageFrom: deal.stage,
    stageTo: nextStage
  });

  const followUpTask =
    parsed.outcome === 'CLOSED_WON'
      ? {
          title: 'Complete asset management handoff',
          description: 'Hand over open items, reporting cadence, and unresolved commercial issues to asset management.',
          checklistKey: 'closeout::asset-management-handoff',
          isRequired: true
        }
      : {
          title: 'Write loss post-mortem',
          description: 'Capture why the deal was lost and what changes before the next process.',
          checklistKey: 'closeout::loss-postmortem',
          isRequired: false
        };

  await createTaskInternal(
    dealId,
    {
      title: followUpTask.title,
      description: followUpTask.description,
      priority: parsed.outcome === 'CLOSED_WON' ? TaskPriority.HIGH : TaskPriority.MEDIUM,
      checklistKey: followUpTask.checklistKey,
      isRequired: followUpTask.isRequired
    },
    db
  );

  await createActivityLog(db, {
    dealId,
    activityType: ActivityType.TASK_CREATED,
    title: 'Close-out follow-up task created',
    body: followUpTask.title
  });

  return getDealById(dealId, db);
}

export function buildDealStageSummary(stage: DealStage) {
  const index = getStageIndex(stage);
  return dealStageMeta.map((item, itemIndex) => ({
    ...item,
    isCurrent: item.value === stage,
    isCompleted: itemIndex < index,
    isUpcoming: itemIndex > index
  }));
}

export function buildDealStageChecklist(deal: DealDetailRecord) {
  return getChecklistTemplates(deal.stage).map((template) => {
    if (template.kind === 'task') {
      const checklistKey = getChecklistTaskKey(deal.stage, template.key);
      const task = deal.tasks.find((item) => item.checklistKey === checklistKey);
      return {
        ...template,
        status: task ? (task.status === TaskStatus.DONE ? 'done' : 'open') : 'missing',
        taskId: task?.id ?? null
      };
    }

    if (template.kind === 'field') {
      const value = template.fieldName ? deal[template.fieldName] : null;
      return {
        ...template,
        status: value ? 'done' : 'missing',
        taskId: null
      };
    }

    const counterpartyExists = template.counterpartyRole
      ? deal.counterparties.some((counterparty) => counterparty.role === template.counterpartyRole)
      : false;
    return {
      ...template,
      status: counterpartyExists ? 'done' : 'missing',
      taskId: null
    };
  });
}

export function buildDealExecutionSnapshot(deal: Awaited<ReturnType<typeof getDealById>>) {
  if (!deal) return null;

  const now = Date.now();
  const openTasks = deal.tasks.filter((task) => task.status !== TaskStatus.DONE);
  const urgentTasks = openTasks.filter((task) => task.priority === 'URGENT' || task.priority === 'HIGH');
  const overdueTasks = openTasks.filter((task) => task.dueDate && task.dueDate.getTime() < now);
  const dueSoonTasks = openTasks.filter((task) => {
    if (!task.dueDate) return false;
    const dueTime = task.dueDate.getTime();
    return dueTime >= now && dueTime <= now + 1000 * 60 * 60 * 24 * 3;
  });
  const openRisks = deal.riskFlags.filter((risk) => !risk.isResolved);
  const nextTask = [...openTasks].sort((left, right) => {
    const leftDue = left.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const rightDue = right.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return leftDue - rightDue || left.sortOrder - right.sortOrder;
  })[0] ?? null;
  const stageChecklist = buildDealStageChecklist(deal);
  const requiredChecklistCount = stageChecklist.length;
  const completedChecklistCount = stageChecklist.filter((item) => item.status === 'done').length;
  const notesByRole = ['BROKER', 'SELLER', 'BUYER'].map((role) => ({
    role,
    notes: deal.activityLogs.filter(
      (entry) => entry.activityType === ActivityType.NOTE && entry.counterparty?.role === role
    )
  }));

  return {
    stageTrack: buildDealStageSummary(deal.stage),
    stageChecklist,
    requiredChecklistCount,
    completedChecklistCount,
    checklistCompletionPct:
      requiredChecklistCount > 0 ? (completedChecklistCount / requiredChecklistCount) * 100 : 100,
    openTaskCount: openTasks.length,
    urgentTaskCount: urgentTasks.length,
    overdueTaskCount: overdueTasks.length,
    dueSoonTaskCount: dueSoonTasks.length,
    openRiskCount: openRisks.length,
    nextTask,
    reminderSummary:
      overdueTasks.length > 0
        ? `${overdueTasks.length} overdue task${overdueTasks.length === 1 ? '' : 's'} need attention.`
        : dueSoonTasks.length > 0
          ? `${dueSoonTasks.length} task${dueSoonTasks.length === 1 ? '' : 's'} due in the next 72 hours.`
          : openTasks.length > 0
            ? 'No overdue tasks. Keep the next queued item moving.'
            : 'No open tasks right now. Seed the current stage checklist or add the next action task.',
    notesByRole
  };
}

export type DealExecutionSnapshot = NonNullable<ReturnType<typeof buildDealExecutionSnapshot>>;

export function buildDealDataCoverage(
  deal: DealDetailRecord,
  snapshot?: DealExecutionSnapshot | null
): DealDataCoverage {
  const latestValuation = deal.asset?.valuations[0] ?? null;
  const documentCount = deal.asset?.documents.length ?? 0;
  const requestCount = deal.documentRequests.length;
  const fulfilledRequestCount = deal.documentRequests.filter((request) => request.status === DealRequestStatus.RECEIVED).length;
  const bidRevisionCount = deal.bidRevisions.length;
  const requiredChecklistPct = snapshot?.checklistCompletionPct ?? 0;
  const hasBrokerOrSeller = deal.counterparties.some(
    (counterparty) => counterparty.role === 'BROKER' || counterparty.role === 'SELLER'
  );
  const hasBuyerOrLender = deal.counterparties.some(
    (counterparty) => counterparty.role === 'BUYER' || counterparty.role === 'LENDER'
  );
  const checks: DealDataCoverage['checks'] = [
    {
      key: 'linked-asset',
      title: 'Linked asset record',
      status: deal.asset ? 'done' : 'missing',
      detail: deal.asset ? 'The deal is anchored to a tracked asset record.' : 'Link the deal to an asset before execution deepens.'
    },
    {
      key: 'market-valuation',
      title: 'Recent valuation context',
      status: latestValuation ? 'done' : 'missing',
      detail: latestValuation
        ? 'A valuation run exists to anchor price, confidence, and downside.'
        : 'Run or link a valuation before pushing the process further.'
    },
    {
      key: 'process-documents',
      title: 'Diligence documents loaded',
      status: documentCount > 0 ? 'done' : 'missing',
      detail: documentCount > 0 ? `${documentCount} linked documents are available.` : 'No linked diligence files are visible yet.'
    },
    {
      key: 'external-contacts',
      title: 'Seller-side coverage',
      status: hasBrokerOrSeller ? 'done' : 'missing',
      detail: hasBrokerOrSeller
        ? 'Broker or seller contact is in the record.'
        : 'Add at least one broker or seller counterparty.'
    },
    {
      key: 'execution-contacts',
      title: 'Buyer / lender execution coverage',
      status:
        deal.stage === DealStage.CLOSING || deal.stage === DealStage.ASSET_MANAGEMENT
          ? hasBuyerOrLender
            ? 'done'
            : 'missing'
          : 'done',
      detail:
        deal.stage === DealStage.CLOSING || deal.stage === DealStage.ASSET_MANAGEMENT
          ? hasBuyerOrLender
            ? 'Buy-side or lender execution contact is logged.'
            : 'Closing-stage deals should have buyer or lender execution contacts logged.'
          : 'Not required for the current stage yet.'
    },
    {
      key: 'dd-request-tracker',
      title: 'DD request tracker',
      status: requestCount > 0 ? 'done' : 'missing',
      detail:
        requestCount > 0
          ? `${fulfilledRequestCount} of ${requestCount} requests have been fulfilled.`
          : 'No structured diligence requests logged yet.'
    },
    {
      key: 'bid-revisions',
      title: 'Negotiation history tracked',
      status: getStageIndex(deal.stage) >= getStageIndex(DealStage.LOI) && bidRevisionCount === 0 ? 'missing' : 'done',
      detail:
        bidRevisionCount > 0
          ? `${bidRevisionCount} bid revision${bidRevisionCount === 1 ? '' : 's'} captured.`
          : 'Log the first executable bid before moving deeper in the process.'
    },
    {
      key: 'commercial-guardrails',
      title: 'Commercial pricing guardrails',
      status: deal.sellerGuidanceKrw || deal.bidGuidanceKrw ? 'done' : 'missing',
      detail:
        deal.sellerGuidanceKrw || deal.bidGuidanceKrw
          ? 'Seller guidance or bid guardrail is captured.'
          : 'Capture seller guidance or bid view before pushing the process.'
    },
    {
      key: 'stage-checklist',
      title: 'Current stage checklist',
      status: requiredChecklistPct >= 100 ? 'done' : 'missing',
      detail:
        requiredChecklistPct >= 100
          ? 'Current stage checklist is complete.'
          : `Stage checklist is ${requiredChecklistPct.toFixed(0)}% complete.`
    }
  ];

  const completedCount = checks.filter((item) => item.status === 'done').length;
  const gaps = checks.filter((item) => item.status === 'missing').map((item) => item.title);

  return {
    scorePct: checks.length > 0 ? (completedCount / checks.length) * 100 : 100,
    completedCount,
    totalCount: checks.length,
    evidence: {
      linkedAsset: !!deal.asset,
      valuationCount: deal.asset?.valuations.length ?? 0,
      documentCount,
      requestCount,
      fulfilledRequestCount,
      bidRevisionCount,
      counterpartyCount: deal.counterparties.length,
      requiredChecklistPct
    },
    checks,
    gaps
  };
}

export function buildDealTimeline(deal: DealDetailRecord): DealTimelineEvent[] {
  const rawActivityEvents: DealTimelineEvent[] = deal.activityLogs.map((activity) => ({
    id: `activity-${activity.id}`,
    kind: 'activity',
    category:
      activity.activityType === ActivityType.NOTE
        ? 'note'
        : activity.activityType === ActivityType.RISK_CREATED || activity.activityType === ActivityType.RISK_UPDATED
          ? 'risk'
          : 'execution',
    title: activity.title,
    body: activity.body,
    createdAt: activity.createdAt,
    href: null,
    tone:
      activity.activityType === ActivityType.RISK_CREATED
        ? 'warn'
        : activity.activityType === ActivityType.STAGE_CHANGED || activity.activityType === ActivityType.TASK_CREATED
          ? 'good'
          : 'neutral',
    meta: [
      activity.activityType.toLowerCase().replaceAll('_', ' '),
      activity.counterparty ? activity.counterparty.role.toLowerCase() : null
    ].filter(Boolean) as string[]
  }));
  const activityEvents: DealTimelineEvent[] = [];

  for (const event of rawActivityEvents) {
    const previous = activityEvents[activityEvents.length - 1];
    const isTaskChurn =
      event.meta.includes('task updated') ||
      event.meta.includes('task created');
    const previousIsTaskChurn =
      previous?.meta.includes('task updated') ||
      previous?.meta.includes('task created');

    if (
      previous &&
      isTaskChurn &&
      previousIsTaskChurn &&
      sameUtcDay(previous.createdAt, event.createdAt)
    ) {
      previous.title = 'Task queue updated';
      previous.body = previous.body ?? event.body;
      previous.meta = [...new Set([...previous.meta, ...event.meta, 'task batch'])];
      continue;
    }

    activityEvents.push(event);
  }

  const valuationEvents: DealTimelineEvent[] = (deal.asset?.valuations ?? []).map((valuation) => ({
    id: `valuation-${valuation.id}`,
    kind: 'valuation',
    category: 'valuation',
    title: 'Valuation run updated',
    body: `Base case ${valuation.baseCaseValueKrw.toLocaleString()} KRW with ${valuation.confidenceScore.toFixed(0)} confidence.`,
    createdAt: valuation.createdAt,
    href: `/admin/valuations/${valuation.id}`,
    tone: valuation.confidenceScore >= 70 ? 'good' : valuation.confidenceScore >= 55 ? 'neutral' : 'warn',
    meta: ['valuation', valuation.runLabel ?? 'latest run']
  }));

  return [...activityEvents, ...valuationEvents]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, 20);
}
