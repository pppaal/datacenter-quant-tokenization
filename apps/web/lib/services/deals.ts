import {
  ActivityType,
  AssetClass,
  DealBidStatus,
  DealDiligenceWorkstreamStatus,
  DealDiligenceWorkstreamType,
  DealLossReason,
  DealOriginationSource,
  DealRequestStatus,
  DealStage,
  DocumentType,
  Prisma,
  RelationshipCoverageStatus,
  RiskSeverity,
  TaskPriority,
  TaskStatus,
  type PrismaClient
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { dealStageChecklistTemplates } from '@/lib/deals/config';
import { slugify, toSentenceCase } from '@/lib/utils';
import {
  dealArchiveSchema,
  dealActivitySchema,
  dealBidRevisionCreateSchema,
  dealBidRevisionUpdateSchema,
  dealCloseOutSchema,
  dealCounterpartySchema,
  dealCounterpartyUpdateSchema,
  dealCreateSchema,
  dealDocumentRequestCreateSchema,
  dealDocumentRequestUpdateSchema,
  dealDiligenceDeliverableCreateSchema,
  dealDiligenceWorkstreamCreateSchema,
  dealDiligenceWorkstreamUpdateSchema,
  dealLenderQuoteCreateSchema,
  dealLenderQuoteUpdateSchema,
  dealNegotiationEventCreateSchema,
  dealNegotiationEventUpdateSchema,
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
    select: {
      id: true,
      assetCode: true,
      assetClass: true,
      name: true,
      market: true,
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
        take: 1,
        orderBy: {
          createdAt: 'desc'
        }
      },
      researchSnapshots: {
        select: {
          id: true,
          title: true,
          summary: true,
          freshnessStatus: true,
          freshnessLabel: true,
          snapshotDate: true,
          sourceSystem: true
        },
        take: 4,
        orderBy: {
          snapshotDate: 'desc'
        }
      },
      coverageTasks: {
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          freshnessLabel: true,
          notes: true,
          updatedAt: true
        },
        where: {
          status: {
            not: TaskStatus.DONE
          }
        },
        take: 5,
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }]
      }
    }
  },
  counterparties: {
    select: {
      id: true,
      name: true,
      role: true,
      coverageOwner: true,
      coverageStatus: true,
      lastContactAt: true
    },
    orderBy: {
      createdAt: 'asc'
    }
  },
  tasks: {
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      checklistKey: true,
      isRequired: true,
      sortOrder: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'asc' }]
  },
  documentRequests: {
    select: {
      id: true,
      title: true,
      category: true,
      status: true,
      dueDate: true,
      requestedAt: true,
      receivedAt: true,
      matchSuggestion: true,
      createdAt: true,
      updatedAt: true,
      counterpartyId: true,
      documentId: true
    },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'asc' }]
  },
  diligenceWorkstreams: {
    include: {
      deliverables: {
        include: {
          document: {
            select: {
              id: true,
              title: true,
              documentType: true,
              currentVersion: true,
              documentHash: true,
              updatedAt: true
            }
          }
        },
        orderBy: [{ createdAt: 'asc' }]
      }
    },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { workstreamType: 'asc' }]
  },
  bidRevisions: {
    select: {
      id: true,
      label: true,
      status: true,
      bidPriceKrw: true,
      submittedAt: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
    take: 6
  },
  lenderQuotes: {
    select: {
      id: true,
      facilityLabel: true,
      status: true,
      amountKrw: true,
      quotedAt: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: [{ quotedAt: 'desc' }, { createdAt: 'desc' }],
    take: 6
  },
  negotiationEvents: {
    select: {
      id: true,
      eventType: true,
      effectiveAt: true,
      expiresAt: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }],
    take: 10
  },
  riskFlags: {
    select: {
      id: true,
      title: true,
      severity: true,
      isResolved: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: [{ isResolved: 'asc' }, { createdAt: 'desc' }]
  },
  activityLogs: {
    select: {
      id: true,
      title: true,
      activityType: true,
      createdAt: true,
      counterparty: {
        select: {
          role: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 12
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
      },
      researchSnapshots: {
        select: {
          id: true,
          title: true,
          summary: true,
          freshnessStatus: true,
          freshnessLabel: true,
          snapshotDate: true,
          sourceSystem: true
        },
        take: 6,
        orderBy: {
          snapshotDate: 'desc'
        }
      },
      coverageTasks: {
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          freshnessLabel: true,
          notes: true,
          updatedAt: true
        },
        where: {
          status: {
            not: TaskStatus.DONE
          }
        },
        take: 8,
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }]
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
    select: {
      id: true,
      dealId: true,
      counterpartyId: true,
      documentId: true,
      title: true,
      category: true,
      status: true,
      priority: true,
      dueDate: true,
      requestedAt: true,
      receivedAt: true,
      matchSuggestion: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      counterparty: true,
      document: true
    },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'asc' }]
  },
  diligenceWorkstreams: {
    select: {
      id: true,
      workstreamType: true,
      status: true,
      ownerLabel: true,
      advisorName: true,
      reportTitle: true,
      requestedAt: true,
      dueDate: true,
      signedOffAt: true,
      signedOffByLabel: true,
      summary: true,
      blockerSummary: true,
      notes: true,
      deliverables: {
        select: {
          id: true,
          note: true,
          document: {
            select: {
              id: true,
              title: true,
              documentType: true,
              currentVersion: true,
              documentHash: true,
              updatedAt: true
            }
          }
        },
        orderBy: [{ createdAt: 'asc' }]
      }
    },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { workstreamType: 'asc' }]
  },
  bidRevisions: {
    include: {
      counterparty: true
    },
    orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }]
  },
  lenderQuotes: {
    include: {
      counterparty: true
    },
    orderBy: [{ quotedAt: 'desc' }, { createdAt: 'desc' }]
  },
  negotiationEvents: {
    include: {
      counterparty: true,
      bidRevision: true
    },
    orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }]
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
  },
  probabilitySnapshots: {
    orderBy: {
      createdAt: 'desc'
    },
    take: 12
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
    lenderQuoteCount: number;
    negotiationEventCount: number;
    counterpartyCount: number;
    diligenceWorkstreamCount: number;
    signedOffWorkstreamCount: number;
    blockedWorkstreamCount: number;
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

export type DealClosingReadiness = {
  scorePct: number;
  completedCount: number;
  totalCount: number;
  blockerCount: number;
  readyToClose: boolean;
  checks: Array<{
    key: string;
    title: string;
    status: 'done' | 'open' | 'missing';
    detail: string;
    isBlocker: boolean;
  }>;
  blockers: string[];
};

export type DealCloseProbability = {
  scorePct: number;
  band: 'LOW' | 'MEDIUM' | 'HIGH';
  headline: string;
  drivers: string[];
};

export type DealCloseProbabilityHistoryPoint = {
  id: string;
  createdAt: Date;
  stage: DealStage;
  scorePct: number;
  band: 'LOW' | 'MEDIUM' | 'HIGH';
  readinessScorePct: number;
  blockerCount: number;
  reason: string;
  headline: string;
  openRiskCount: number;
  overdueTaskCount: number;
  pendingSuggestedRequestCount: number;
  flags: string[];
};

type DiligenceWorkstreamLike = {
  id: string;
  workstreamType: DealDiligenceWorkstreamType;
  status: DealDiligenceWorkstreamStatus;
  ownerLabel?: string | null;
  advisorName?: string | null;
  reportTitle?: string | null;
  requestedAt?: Date | null;
  dueDate?: Date | null;
  signedOffAt?: Date | null;
  signedOffByLabel?: string | null;
  summary?: string | null;
  blockerSummary?: string | null;
  notes?: string | null;
  deliverables?: Array<{
    id: string;
    note?: string | null;
    document: {
      id: string;
      title: string;
      documentType: string;
      currentVersion: number;
      documentHash: string;
      updatedAt: Date;
    };
  }>;
};

export type DealDiligenceSummary = {
  totalCount: number;
  signedOffCount: number;
  blockedCount: number;
  readyForSignoffCount: number;
  deliverableCount: number;
  uncoveredCoreTypes: DealDiligenceWorkstreamType[];
  coreRequiredTypes: DealDiligenceWorkstreamType[];
  missingCoreTypes: DealDiligenceWorkstreamType[];
  staleRequestedCount: number;
  headline: string;
};

const baseCoreDiligenceTypes: DealDiligenceWorkstreamType[] = [
  DealDiligenceWorkstreamType.LEGAL,
  DealDiligenceWorkstreamType.COMMERCIAL,
  DealDiligenceWorkstreamType.TECHNICAL
];

function getCoreDiligenceTypes(assetClass: AssetClass | null | undefined) {
  const types = [...baseCoreDiligenceTypes];
  if (assetClass === AssetClass.DATA_CENTER || assetClass === AssetClass.INDUSTRIAL || assetClass === AssetClass.LAND) {
    types.push(DealDiligenceWorkstreamType.ENVIRONMENTAL);
  }
  return types;
}

function getDealDiligenceWorkstreams(deal: DealListRecord | DealDetailRecord) {
  return ('diligenceWorkstreams' in deal ? deal.diligenceWorkstreams : []) as DiligenceWorkstreamLike[];
}

export function buildDealDiligenceSummary(
  deal: DealListRecord | DealDetailRecord,
  workstreams: DiligenceWorkstreamLike[] = getDealDiligenceWorkstreams(deal)
): DealDiligenceSummary {
  const coreRequiredTypes = getCoreDiligenceTypes(deal.assetClass ?? deal.asset?.assetClass ?? null);
  const signedOff = workstreams.filter((item) => item.status === DealDiligenceWorkstreamStatus.SIGNED_OFF);
  const blocked = workstreams.filter((item) => item.status === DealDiligenceWorkstreamStatus.BLOCKED);
  const readyForSignoff = workstreams.filter((item) => item.status === DealDiligenceWorkstreamStatus.READY_FOR_SIGNOFF);
  const workstreamTypes = new Set(workstreams.map((item) => item.workstreamType));
  const missingCoreTypes = coreRequiredTypes.filter((item) => !workstreamTypes.has(item));
  const deliverableCount = workstreams.reduce((total, item) => total + (item.deliverables?.length ?? 0), 0);
  const uncoveredCoreTypes = coreRequiredTypes.filter((type) => {
    const lane = workstreams.find((item) => item.workstreamType === type);
    return !lane || (lane.deliverables?.length ?? 0) === 0;
  });
  const staleRequestedCount = workstreams.filter((item) => {
    if (!item.requestedAt || item.signedOffAt) return false;
    return Date.now() - item.requestedAt.getTime() > 1000 * 60 * 60 * 24 * 14;
  }).length;

  const headline =
    missingCoreTypes.length === 0 && blocked.length === 0
      ? signedOff.length >= coreRequiredTypes.length
        ? uncoveredCoreTypes.length === 0
          ? 'Core specialist diligence is signed off and committee-ready.'
          : 'Core specialist diligence is signed off, but supporting deliverables still need to be attached.'
        : 'Core diligence workstreams are open with no immediate specialist blockers.'
      : missingCoreTypes.length > 0
        ? `${missingCoreTypes.length} core diligence workstream${missingCoreTypes.length === 1 ? '' : 's'} still need to be opened.`
        : `${blocked.length} diligence workstream${blocked.length === 1 ? '' : 's'} are blocked and need intervention.`;

  return {
    totalCount: workstreams.length,
    signedOffCount: signedOff.length,
    blockedCount: blocked.length,
    readyForSignoffCount: readyForSignoff.length,
    deliverableCount,
    uncoveredCoreTypes,
    coreRequiredTypes,
    missingCoreTypes,
    staleRequestedCount,
    headline
  };
}

export type DealDiligenceWorkpaperFact = {
  label: string;
  value: string;
};

export type DealDiligenceWorkpaperSection = {
  id: string;
  title: string;
  lines: string[];
};

export type DealDiligenceWorkpaper = {
  dealId: string;
  dealCode: string;
  title: string;
  stageLabel: string;
  generatedAt: Date;
  generatedAtLabel: string;
  exportFileBase: string;
  summaryFacts: DealDiligenceWorkpaperFact[];
  sections: DealDiligenceWorkpaperSection[];
};

function formatWorkpaperDate(value: Date | null | undefined) {
  if (!value) return 'Not set';
  return value.toISOString().slice(0, 10);
}

function buildWorkstreamLine(workstream: DiligenceWorkstreamLike) {
  const parts = [
    `${toSentenceCase(workstream.workstreamType)}: ${toSentenceCase(workstream.status)}`,
    workstream.ownerLabel ? `owner ${workstream.ownerLabel}` : null,
    workstream.advisorName ? `advisor ${workstream.advisorName}` : null,
    workstream.dueDate ? `due ${formatWorkpaperDate(workstream.dueDate)}` : null,
    workstream.signedOffAt
      ? `signed ${formatWorkpaperDate(workstream.signedOffAt)}${workstream.signedOffByLabel ? ` by ${workstream.signedOffByLabel}` : ''}`
      : null,
    workstream.reportTitle ? `report ${workstream.reportTitle}` : null
  ].filter(Boolean);

  const detail = [workstream.summary, workstream.blockerSummary ? `blocker: ${workstream.blockerSummary}` : null]
    .filter(Boolean)
    .join(' / ');

  const deliverableLabel =
    (workstream.deliverables?.length ?? 0) > 0
      ? `deliverables ${workstream.deliverables!.map((item) => item.document.title).join(', ')}`
      : 'no deliverables linked';
  const body = detail ? `${parts.join(' / ')} / ${detail}` : parts.join(' / ');
  return `${body} / ${deliverableLabel}`;
}

export function buildDealDiligenceWorkpaper(deal: DealDetailRecord): DealDiligenceWorkpaper {
  const generatedAt = new Date();
  const snapshot = buildDealExecutionSnapshot(deal);
  const coverage = buildDealDataCoverage(deal, snapshot);
  const readiness = buildDealClosingReadiness(deal, snapshot);
  const probability = buildDealCloseProbability(deal, snapshot, readiness);
  const origination = buildDealOriginationProfile(deal, snapshot);
  const diligenceSummary = buildDealDiligenceSummary(deal);
  const workstreams = [...deal.diligenceWorkstreams].sort((left, right) => {
    const leftDue = left.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const rightDue = right.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (leftDue !== rightDue) return leftDue - rightDue;
    return left.workstreamType.localeCompare(right.workstreamType);
  });
  const openRequests = deal.documentRequests.filter((request) => request.status === DealRequestStatus.REQUESTED);
  const keyDocuments = (deal.asset?.documents ?? []).slice(0, 8);
  const sections: DealDiligenceWorkpaperSection[] = [
    {
      id: 'specialist-lanes',
      title: 'Specialist Workstreams',
      lines:
        workstreams.length > 0
          ? workstreams.map((workstream) => buildWorkstreamLine(workstream))
          : ['No specialist diligence workstreams are open yet.']
    },
    {
      id: 'blockers-and-gaps',
      title: 'Blockers And Gaps',
      lines:
        [...readiness.blockers, ...origination.blockers].length > 0
          ? [...new Set([...readiness.blockers, ...origination.blockers])]
          : ['No live blockers are flagged across readiness or origination.']
    },
    {
      id: 'request-tracker',
      title: 'Document Request Tracker',
      lines:
        openRequests.length > 0
          ? openRequests.map((request) => {
              const counterpartyLabel = request.counterparty?.name ? ` / ${request.counterparty.name}` : '';
              return `${request.title}${counterpartyLabel} / ${toSentenceCase(request.status)} / due ${formatWorkpaperDate(request.dueDate)}${
                request.notes ? ` / ${request.notes}` : ''
              }`;
            })
          : ['All current diligence requests are cleared or no tracker entries are open.']
    },
    {
      id: 'supporting-documents',
      title: 'Supporting Documents',
      lines:
        keyDocuments.length > 0
          ? keyDocuments.map((document) => {
              const hashLabel = document.documentHash ? document.documentHash.slice(0, 12) : 'no-hash';
              return `${document.title} / ${toSentenceCase(document.documentType)} / v${document.currentVersion} / ${hashLabel}`;
            })
          : ['No supporting asset documents are linked yet.']
    }
  ];

  return {
    dealId: deal.id,
    dealCode: deal.dealCode,
    title: deal.title,
    stageLabel: formatEnumLabel(deal.stage),
    generatedAt,
    generatedAtLabel: formatWorkpaperDate(generatedAt),
    exportFileBase: `${slugify(deal.dealCode)}-dd-workpaper-${generatedAt.toISOString().slice(0, 10)}`,
    summaryFacts: [
      { label: 'Stage', value: formatEnumLabel(deal.stage) },
      { label: 'Checklist Completion', value: `${Math.round(snapshot?.checklistCompletionPct ?? 0)}%` },
      { label: 'Readiness', value: `${readiness.scorePct}% / ${readiness.readyToClose ? 'Ready' : `${readiness.blockerCount} blocker(s)`}` },
      { label: 'Close Probability', value: `${probability.scorePct}% / ${probability.band}` },
      { label: 'Origination', value: `${Math.round(origination.scorePct)}% / ${origination.sourceLabel}` },
      {
        label: 'Specialist Sign-Off',
        value: `${diligenceSummary.signedOffCount}/${diligenceSummary.coreRequiredTypes.length} core lanes signed off`
      },
      {
        label: 'Deliverables',
        value: `${diligenceSummary.deliverableCount} linked / ${diligenceSummary.uncoveredCoreTypes.length} core lanes without evidence`
      },
      { label: 'Coverage', value: `${coverage.completedCount}/${coverage.totalCount} checks complete` }
    ],
    sections
  };
}

export function serializeDealDiligenceWorkpaperToMarkdown(workpaper: DealDiligenceWorkpaper) {
  const lines: string[] = [];
  lines.push(`# ${workpaper.title} DD Workpaper`);
  lines.push('');
  lines.push(`- Deal: ${workpaper.dealCode}`);
  lines.push(`- Stage: ${workpaper.stageLabel}`);
  lines.push(`- Generated: ${workpaper.generatedAtLabel}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  workpaper.summaryFacts.forEach((fact) => {
    lines.push(`- ${fact.label}: ${fact.value}`);
  });

  workpaper.sections.forEach((section) => {
    lines.push('');
    lines.push(`## ${section.title}`);
    lines.push('');
    section.lines.forEach((line) => {
      lines.push(`- ${line}`);
    });
  });

  lines.push('');
  return lines.join('\n');
}

function sameUtcDay(left: Date, right: Date) {
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth() &&
    left.getUTCDate() === right.getUTCDate()
  );
}

function getPendingSuggestedSnapshotCount(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object') return 0;
  const rawValue = (snapshot as Record<string, unknown>).pendingSuggestedRequestCount;
  return typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : 0;
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

function formatProbabilitySnapshotReason(reason: string) {
  return reason.replaceAll('_', ' ');
}

function maxDate(left: Date | null, right: Date | null) {
  if (!left) return right;
  if (!right) return left;
  return left.getTime() >= right.getTime() ? left : right;
}

function maxDateFromValues(values: Array<Date | null | undefined>) {
  return values.reduce<Date | null>((latest, value) => maxDate(latest, value ?? null), null);
}

function isDealCodeConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    Array.isArray(error.meta?.target) &&
    error.meta.target.includes('dealCode')
  );
}

function normalizeExecutionText(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildExecutionTokenSet(value: string | null | undefined) {
  return new Set(
    normalizeExecutionText(value)
      .split(' ')
      .filter((token) => token.length >= 3)
  );
}

const documentTypeKeywords: Record<DocumentType, string[]> = {
  IM: ['im', 'investment memo', 'memo', 'committee'],
  POWER_STUDY: ['power', 'utility', 'load study', 'electrical'],
  PERMIT: ['permit', 'entitlement', 'approval', 'zoning', 'license'],
  LEASE: ['lease', 'tenant', 'rent roll', 'lease abstract'],
  MODEL: ['model', 'underwriting', 'cash flow', 'financial model'],
  SITE_PHOTO: ['photo', 'site', 'image'],
  GRID_NOTICE: ['grid', 'interconnection', 'notice', 'utility'],
  REPORT: ['report', 'survey', 'environmental', 'engineering', 'title'],
  OTHER: []
};

const documentRequestCategoryAliases: Record<string, string[]> = {
  title: ['title', 'ownership', 'legal', 'survey'],
  power: ['power', 'utility', 'electrical', 'interconnection', 'grid', 'load'],
  permit: ['permit', 'entitlement', 'approval', 'zoning', 'license', 'environmental'],
  lease: ['lease', 'tenant', 'rent', 'rollover'],
  model: ['model', 'underwriting', 'cash flow', 'finance'],
  environmental: ['environmental', 'phase', 'soil', 'contamination'],
  legal: ['legal', 'title', 'encumbrance', 'litigation'],
  finance: ['finance', 'loan', 'lender', 'term sheet', 'debt']
};

function getCategoryAliasTokens(requestCategory: string | null | undefined, requestTitle: string) {
  const categoryKey = normalizeExecutionText(requestCategory);
  const titleKey = normalizeExecutionText(requestTitle);
  const aliases = new Set<string>();
  for (const [key, values] of Object.entries(documentRequestCategoryAliases)) {
    if (categoryKey.includes(key) || titleKey.includes(key)) {
      for (const value of values) aliases.add(value);
    }
  }
  return [...aliases];
}

function scoreDealDocumentRequestMatch(input: {
  requestTitle: string;
  requestCategory: string | null;
  documentTitle: string;
  documentType: DocumentType;
  documentSummary?: string | null;
  documentFacts?: Array<{
    factType: string;
    factKey: string;
    factValueText?: string | null;
  }>;
}) {
  const requestTitleNormalized = normalizeExecutionText(input.requestTitle);
  const requestCategoryNormalized = normalizeExecutionText(input.requestCategory);
  const documentTitleNormalized = normalizeExecutionText(input.documentTitle);
  const categoryAliases = getCategoryAliasTokens(input.requestCategory, input.requestTitle);
  const factTokens = new Set(
    (input.documentFacts ?? []).flatMap((fact) =>
      normalizeExecutionText(`${fact.factType} ${fact.factKey} ${fact.factValueText ?? ''}`)
        .split(' ')
        .filter((token) => token.length >= 3)
    )
  );
  const requestTokens = buildExecutionTokenSet(`${input.requestTitle} ${input.requestCategory ?? ''}`);
  const documentTokens = buildExecutionTokenSet(
    `${input.documentTitle} ${input.documentSummary ?? ''} ${documentTypeKeywords[input.documentType].join(' ')}`
  );

  let score = 0;

  if (
    requestTitleNormalized &&
    documentTitleNormalized &&
    (documentTitleNormalized.includes(requestTitleNormalized) ||
      requestTitleNormalized.includes(documentTitleNormalized))
  ) {
    score += 4;
  }

  if (
    requestCategoryNormalized &&
    (documentTitleNormalized.includes(requestCategoryNormalized) ||
      documentTypeKeywords[input.documentType].some((keyword) => {
        const normalizedKeyword = normalizeExecutionText(keyword);
        return (
          normalizedKeyword.includes(requestCategoryNormalized) ||
          requestCategoryNormalized.includes(normalizedKeyword)
        );
      }))
  ) {
    score += 3;
  }

  for (const token of requestTokens) {
    if (documentTokens.has(token)) score += 1;
  }

  for (const alias of categoryAliases) {
    const normalizedAlias = normalizeExecutionText(alias);
    if (!normalizedAlias) continue;
    if (documentTokens.has(normalizedAlias) || factTokens.has(normalizedAlias)) {
      score += 2;
    }
  }

  if (
    requestCategoryNormalized &&
    (input.documentFacts ?? []).some((fact) => {
      const factTypeNormalized = normalizeExecutionText(fact.factType);
      const factKeyNormalized = normalizeExecutionText(fact.factKey);
      return (
        factTypeNormalized.includes(requestCategoryNormalized) ||
        factKeyNormalized.includes(requestCategoryNormalized)
      );
    })
  ) {
    score += 2;
  }

  return score;
}

function buildDocumentMatchSuggestion(input: {
  documentId: string;
  documentTitle: string;
  documentType: DocumentType;
  score: number;
  competingRequestTitles?: string[];
}) {
  return {
    documentId: input.documentId,
    documentTitle: input.documentTitle,
    documentType: input.documentType,
    score: input.score,
    competingRequestTitles: input.competingRequestTitles ?? [],
    suggestedAt: new Date().toISOString()
  } satisfies Prisma.InputJsonValue;
}

async function buildNextDealCode(db: PrismaClient) {
  const allocate = async (tx: Prisma.TransactionClient | PrismaClient) => {
    await tx.sequenceCounter.upsert({
      where: { key: 'deal_code' },
      create: {
        key: 'deal_code',
        nextValue: 0
      },
      update: {}
    });

    const updatedCounter = await tx.sequenceCounter.update({
      where: { key: 'deal_code' },
      data: {
        nextValue: {
          increment: 1
        }
      },
      select: {
        nextValue: true
      }
    });

    return updatedCounter.nextValue;
  };

  const nextNumber = await db.$transaction((tx) => allocate(tx));

  return `DEAL-${String(nextNumber).padStart(4, '0')}`;
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
  const title = parsed.title.trim();
  const stage = parsed.stage;
  const nextAction = parsed.nextAction ?? getDefaultNextAction(stage);
  let created: DealDetailRecord | null = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const dealCode = await buildNextDealCode(db);

    try {
      created = await db.deal.create({
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
          originationSource: parsed.originationSource ?? null,
          originSummary: parsed.originSummary ?? null,
          statusLabel: parsed.statusLabel ?? 'ACTIVE',
          dealLead: parsed.dealLead ?? 'solo_operator',
          assetId: parsed.assetId ?? null
        },
        include: dealDetailInclude
      });
      break;
    } catch (error) {
      if (isDealCodeConflict(error) && attempt < 4) {
        continue;
      }
      throw error;
    }
  }

  if (!created) {
    throw new Error('Failed to allocate a unique deal code');
  }

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

  await recordDealProbabilitySnapshot(created.id, 'deal_created', db);
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
      originationSource:
        parsed.originationSource === undefined ? undefined : parsed.originationSource,
      originSummary: parsed.originSummary ?? undefined,
      statusLabel: parsed.statusLabel ?? undefined,
      lossReason: parsed.lossReason === undefined ? undefined : parsed.lossReason,
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

  await recordDealProbabilitySnapshot(updated.id, 'deal_updated', db);
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

  await recordDealProbabilitySnapshot(id, 'stage_changed', db);
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
      coverageOwner: parsed.coverageOwner ?? null,
      coverageStatus: parsed.coverageStatus,
      lastContactAt: parsed.lastContactAt ?? null,
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

  await recordDealProbabilitySnapshot(dealId, 'counterparty_added', db);
  return counterparty;
}

export async function updateDealCounterparty(
  dealId: string,
  counterpartyId: string,
  input: unknown,
  db: PrismaClient = prisma
) {
  const parsed = dealCounterpartyUpdateSchema.parse(input);
  const counterparty = await db.counterparty.findFirst({
    where: {
      id: counterpartyId,
      dealId
    }
  });

  if (!counterparty) throw new Error('Counterparty not found for this deal');

  const updated = await db.counterparty.update({
    where: {
      id: counterpartyId
    },
    data: {
      name: parsed.name ?? undefined,
      role: parsed.role ? parsed.role.toUpperCase() : undefined,
      shortName: parsed.shortName ?? undefined,
      company: parsed.company ?? undefined,
      email: parsed.email ?? undefined,
      phone: parsed.phone ?? undefined,
      coverageOwner: parsed.coverageOwner ?? undefined,
      coverageStatus: parsed.coverageStatus ?? undefined,
      lastContactAt: parsed.lastContactAt ?? undefined,
      notes: parsed.notes ?? undefined
    }
  });

  await createActivityLog(db, {
    dealId,
    activityType: ActivityType.GENERAL,
    counterpartyId,
    title: 'Counterparty coverage updated',
    body: `${updated.name} coverage updated for ${(updated.role ?? counterparty.role).toLowerCase()}.`
  });

  await recordDealProbabilitySnapshot(dealId, 'counterparty_updated', db);
  return updated;
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

  await recordDealProbabilitySnapshot(dealId, 'task_created', db);
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

  await recordDealProbabilitySnapshot(dealId, 'dd_request_created', db);
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
  const shouldClearMatchSuggestion =
    parsed.documentId !== undefined ||
    nextStatus === DealRequestStatus.RECEIVED ||
    nextStatus === DealRequestStatus.WAIVED;
  const requestUpdateData: Prisma.DealDocumentRequestUncheckedUpdateInput = {
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
    matchSuggestion: shouldClearMatchSuggestion ? Prisma.DbNull : undefined,
    notes: parsed.notes ?? undefined
  };
  const updated = await db.dealDocumentRequest.update({
    where: { id: requestId },
    data: requestUpdateData,
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

  await recordDealProbabilitySnapshot(dealId, 'dd_request_updated', db);
  return updated;
}

export async function upsertDealDiligenceWorkstream(
  dealId: string,
  input: unknown,
  db: PrismaClient = prisma
) {
  const parsed = dealDiligenceWorkstreamCreateSchema.parse(input);
  const deal = await db.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new Error('Deal not found');

  const status = parsed.status as DealDiligenceWorkstreamStatus;
  const signedOffAt =
    parsed.signedOffAt ?? (status === DealDiligenceWorkstreamStatus.SIGNED_OFF ? new Date() : null);

  const workstream = await db.dealDiligenceWorkstream.upsert({
    where: {
      dealId_workstreamType: {
        dealId,
        workstreamType: parsed.workstreamType as DealDiligenceWorkstreamType
      }
    },
    create: {
      dealId,
      workstreamType: parsed.workstreamType as DealDiligenceWorkstreamType,
      status,
      ownerLabel: parsed.ownerLabel ?? null,
      advisorName: parsed.advisorName ?? null,
      reportTitle: parsed.reportTitle ?? null,
      requestedAt: parsed.requestedAt ?? new Date(),
      dueDate: parsed.dueDate ?? null,
      signedOffAt,
      signedOffByLabel: parsed.signedOffByLabel ?? null,
      summary: parsed.summary ?? null,
      blockerSummary: parsed.blockerSummary ?? null,
      notes: parsed.notes ?? null
    },
    update: {
      status,
      ownerLabel: parsed.ownerLabel ?? undefined,
      advisorName: parsed.advisorName ?? undefined,
      reportTitle: parsed.reportTitle ?? undefined,
      requestedAt: parsed.requestedAt ?? undefined,
      dueDate: parsed.dueDate ?? undefined,
      signedOffAt:
        parsed.signedOffAt !== undefined
          ? parsed.signedOffAt
          : status === DealDiligenceWorkstreamStatus.SIGNED_OFF
            ? new Date()
            : undefined,
      signedOffByLabel: parsed.signedOffByLabel ?? undefined,
      summary: parsed.summary ?? undefined,
      blockerSummary: parsed.blockerSummary ?? undefined,
      notes: parsed.notes ?? undefined
    }
  });

  await createActivityLog(db, {
    dealId,
    activityType: ActivityType.GENERAL,
    title: 'Diligence workstream updated',
    body: `${toSentenceCase(workstream.workstreamType)} is ${workstream.status.toLowerCase().replaceAll('_', ' ')}.`
  });

  await recordDealProbabilitySnapshot(dealId, 'diligence_workstream_upserted', db);
  return workstream;
}

export async function updateDealDiligenceWorkstream(
  dealId: string,
  workstreamId: string,
  input: unknown,
  db: PrismaClient = prisma
) {
  const parsed = dealDiligenceWorkstreamUpdateSchema.parse(input);
  const workstream = await db.dealDiligenceWorkstream.findFirst({
    where: {
      id: workstreamId,
      dealId
    }
  });
  if (!workstream) throw new Error('Diligence workstream not found');

  const nextStatus = (parsed.status ?? workstream.status) as DealDiligenceWorkstreamStatus;
  const updated = await db.dealDiligenceWorkstream.update({
    where: { id: workstreamId },
    data: {
      status: nextStatus,
      ownerLabel: parsed.ownerLabel ?? undefined,
      advisorName: parsed.advisorName ?? undefined,
      reportTitle: parsed.reportTitle ?? undefined,
      requestedAt: parsed.requestedAt ?? undefined,
      dueDate: parsed.dueDate ?? undefined,
      signedOffAt:
        parsed.signedOffAt !== undefined
          ? parsed.signedOffAt
          : nextStatus === DealDiligenceWorkstreamStatus.SIGNED_OFF
            ? workstream.signedOffAt ?? new Date()
            : nextStatus === DealDiligenceWorkstreamStatus.NOT_STARTED || nextStatus === DealDiligenceWorkstreamStatus.IN_PROGRESS || nextStatus === DealDiligenceWorkstreamStatus.BLOCKED
              ? null
              : undefined,
      signedOffByLabel:
        parsed.signedOffByLabel !== undefined
          ? parsed.signedOffByLabel
          : nextStatus === DealDiligenceWorkstreamStatus.SIGNED_OFF
            ? workstream.signedOffByLabel ?? 'deal operator'
            : undefined,
      summary: parsed.summary ?? undefined,
      blockerSummary: parsed.blockerSummary ?? undefined,
      notes: parsed.notes ?? undefined
    }
  });

  await createActivityLog(db, {
    dealId,
    activityType: ActivityType.GENERAL,
    title: 'Diligence workstream updated',
    body: `${toSentenceCase(updated.workstreamType)} is ${updated.status.toLowerCase().replaceAll('_', ' ')}.`
  });

  await recordDealProbabilitySnapshot(dealId, 'diligence_workstream_updated', db);
  return updated;
}

export async function attachDealDiligenceDeliverable(
  dealId: string,
  workstreamId: string,
  input: unknown,
  db: PrismaClient = prisma
) {
  const parsed = dealDiligenceDeliverableCreateSchema.parse(input);
  const workstream = await db.dealDiligenceWorkstream.findFirst({
    where: {
      id: workstreamId,
      dealId
    },
    include: {
      deal: {
        select: {
          assetId: true
        }
      }
    }
  });
  if (!workstream) throw new Error('Diligence workstream not found');
  if (!workstream.deal.assetId) throw new Error('Linked asset is required for diligence deliverables');

  const document = await db.document.findFirst({
    where: {
      id: parsed.documentId,
      assetId: workstream.deal.assetId
    },
    select: {
      id: true,
      title: true,
      documentType: true,
      currentVersion: true,
      documentHash: true,
      updatedAt: true
    }
  });
  if (!document) throw new Error('Document not found for linked asset');

  const deliverable = await db.dealDiligenceDeliverable.upsert({
    where: {
      workstreamId_documentId: {
        workstreamId,
        documentId: parsed.documentId
      }
    },
    create: {
      workstreamId,
      documentId: parsed.documentId,
      note: parsed.note ?? null
    },
    update: {
      note: parsed.note ?? undefined
    },
    include: {
      document: {
        select: {
          id: true,
          title: true,
          documentType: true,
          currentVersion: true,
          documentHash: true,
          updatedAt: true
        }
      }
    }
  });

  await createActivityLog(db, {
    dealId,
    activityType: ActivityType.GENERAL,
    title: 'Diligence deliverable linked',
    body: `${toSentenceCase(workstream.workstreamType)} linked ${document.title}.`
  });

  await recordDealProbabilitySnapshot(dealId, 'diligence_deliverable_attached', db);
  return deliverable;
}

export async function autoMatchDealDocumentRequestsForAsset(
  assetId: string,
  input: {
    documentId: string;
    documentTitle: string;
    documentType: DocumentType;
  },
  db: PrismaClient = prisma,
  dealId?: string
) {
  const documentContext =
    'document' in db && db.document && 'findUnique' in db.document
      ? await db.document.findUnique({
          where: { id: input.documentId },
          select: {
            aiSummary: true,
            versions: {
              select: {
                facts: {
                  select: {
                    factType: true,
                    factKey: true,
                    factValueText: true
                  },
                  orderBy: [{ confidenceScore: 'desc' }, { createdAt: 'desc' }],
                  take: 24
                }
              },
              orderBy: {
                versionNumber: 'desc'
              },
              take: 1
            }
          }
        })
      : null;

  const openRequests = await db.dealDocumentRequest.findMany({
    where: {
      status: DealRequestStatus.REQUESTED,
      documentId: null,
      deal: {
        assetId,
        ...(dealId ? { id: dealId } : {})
      }
    },
    include: {
      deal: {
        select: {
          id: true
        }
      }
    },
    orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { requestedAt: 'asc' }]
  });

  const openDealIds = new Set(openRequests.map((request) => request.dealId));
  if (!dealId && openDealIds.size > 1) {
    return [];
  }

  const candidates = openRequests
    .map((request) => ({
      request,
      score: scoreDealDocumentRequestMatch({
        requestTitle: request.title,
        requestCategory: request.category,
        documentTitle: input.documentTitle,
        documentType: input.documentType,
        documentSummary: documentContext?.aiSummary ?? null,
        documentFacts: documentContext?.versions[0]?.facts ?? []
      })
    }))
    .filter((entry) => entry.score >= 3)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.request.requestedAt.getTime() - right.request.requestedAt.getTime()
    );

  const bestCandidate = candidates[0];
  if (!bestCandidate) {
    return [];
  }

  const secondBestScore = candidates[1]?.score ?? null;
  const shouldAutoMatch = bestCandidate.score >= 6 && (secondBestScore === null || bestCandidate.score - secondBestScore >= 2);

  if (!shouldAutoMatch) {
    const suggestedCandidates = candidates.slice(0, 3);
    await Promise.all(
      suggestedCandidates.map(({ request, score }) =>
        db.dealDocumentRequest.update({
          where: { id: request.id },
          data: {
            matchSuggestion: buildDocumentMatchSuggestion({
              documentId: input.documentId,
              documentTitle: input.documentTitle,
              documentType: input.documentType,
              score,
              competingRequestTitles: suggestedCandidates
                .filter((candidate) => candidate.request.id !== request.id)
                .map((candidate) => candidate.request.title)
            })
          }
        })
      )
    );

    await createActivityLog(db, {
      dealId: bestCandidate.request.dealId,
      activityType: ActivityType.GENERAL,
      title: 'DD match suggestions queued',
      body: `"${input.documentTitle}" is a possible match for ${suggestedCandidates.length} open DD request${suggestedCandidates.length === 1 ? '' : 's'}. Review before marking received.`,
      metadata: {
        documentId: input.documentId,
        candidateRequestIds: suggestedCandidates.map((candidate) => candidate.request.id),
        topScore: bestCandidate.score
      }
    });

    await recordDealProbabilitySnapshot(bestCandidate.request.dealId, 'dd_request_match_suggested', db);
    return [];
  }

  const { request, score } = bestCandidate;
  const autoMatchUpdateData: Prisma.DealDocumentRequestUncheckedUpdateInput = {
    documentId: input.documentId,
    status: DealRequestStatus.RECEIVED,
    receivedAt: request.receivedAt ?? new Date(),
    matchSuggestion: Prisma.DbNull,
    notes: request.notes
      ? `${request.notes}\n\nAuto-matched to uploaded document "${input.documentTitle}" (score ${score}).`
      : `Auto-matched to uploaded document "${input.documentTitle}" (score ${score}).`
  };
  const updated = await db.dealDocumentRequest.update({
    where: { id: request.id },
    data: autoMatchUpdateData,
    include: {
      counterparty: true,
      document: true
    }
  });

  await createActivityLog(db, {
    dealId: request.dealId,
    activityType: ActivityType.GENERAL,
    title: 'DD request auto-matched',
    body: `"${request.title}" matched to "${input.documentTitle}".`,
    metadata: {
      requestId: request.id,
      documentId: input.documentId,
      score
    }
  });

  await recordDealProbabilitySnapshot(request.dealId, 'dd_request_auto_matched', db);
  return [updated];
}

export function getDealMaterialUpdatedAt(
  deal: Pick<
    DealListRecord | DealDetailRecord,
    | 'updatedAt'
    | 'tasks'
    | 'riskFlags'
    | 'documentRequests'
    | 'bidRevisions'
    | 'lenderQuotes'
    | 'negotiationEvents'
    | 'activityLogs'
  >
) {
  const tasks = deal.tasks ?? [];
  const riskFlags = deal.riskFlags ?? [];
  const documentRequests = deal.documentRequests ?? [];
  const bidRevisions = deal.bidRevisions ?? [];
  const lenderQuotes = deal.lenderQuotes ?? [];
  const negotiationEvents = deal.negotiationEvents ?? [];
  const activityLogs = deal.activityLogs ?? [];

  return maxDateFromValues([
    deal.updatedAt,
    ...tasks.flatMap((task) => [
      task.updatedAt,
      task.createdAt,
      'completedAt' in task ? (task.completedAt ?? null) : null
    ]),
    ...riskFlags.flatMap((risk) => [
      risk.updatedAt,
      risk.createdAt,
      'resolvedAt' in risk ? (risk.resolvedAt ?? null) : null
    ]),
    ...documentRequests.flatMap((request) => [
      request.updatedAt,
      request.createdAt,
      request.requestedAt,
      request.receivedAt
    ]),
    ...bidRevisions.flatMap((bid) => [bid.updatedAt, bid.createdAt, bid.submittedAt]),
    ...lenderQuotes.flatMap((quote) => [quote.updatedAt, quote.createdAt, quote.quotedAt]),
    ...negotiationEvents.flatMap((event) => [event.updatedAt, event.createdAt, event.effectiveAt]),
    ...activityLogs.flatMap((activity) => [
      'updatedAt' in activity ? activity.updatedAt : null,
      activity.createdAt
    ])
  ]) ?? deal.updatedAt;
}

function getDealProbabilityObservedAt(deal: DealDetailRecord) {
  return maxDate(
    getDealMaterialUpdatedAt(deal),
    deal.asset?.valuations[0]?.createdAt ?? null
  ) ?? deal.updatedAt;
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

  await recordDealProbabilitySnapshot(dealId, 'bid_created', db);
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
    body: `${updated.label} is now ${updated.status.toLowerCase()} at ${(updated.bidPriceKrw ?? bidRevision.bidPriceKrw).toLocaleString()} KRW.`,
    metadata: {
      bidRevisionId: updated.id,
      status: updated.status,
      bidPriceKrw: updated.bidPriceKrw ?? bidRevision.bidPriceKrw
    }
  });

  await recordDealProbabilitySnapshot(dealId, 'bid_updated', db);
  return updated;
}

export async function createDealLenderQuote(dealId: string, input: unknown, db: PrismaClient = prisma) {
  const parsed = dealLenderQuoteCreateSchema.parse(input);
  const deal = await db.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new Error('Deal not found');

  if (parsed.counterpartyId) {
    const counterparty = await db.counterparty.findFirst({
      where: { id: parsed.counterpartyId, dealId }
    });
    if (!counterparty) throw new Error('Counterparty not found for this deal');
  }

  const lenderQuote = await db.dealLenderQuote.create({
    data: {
      dealId,
      counterpartyId: parsed.counterpartyId ?? null,
      status: parsed.status,
      facilityLabel: parsed.facilityLabel,
      amountKrw: parsed.amountKrw,
      ltvPct: parsed.ltvPct ?? null,
      spreadBps: parsed.spreadBps ?? null,
      allInRatePct: parsed.allInRatePct ?? null,
      dscrFloor: parsed.dscrFloor ?? null,
      termMonths: parsed.termMonths ?? null,
      ioMonths: parsed.ioMonths ?? null,
      quotedAt: parsed.quotedAt ?? new Date(),
      notes: parsed.notes ?? null
    },
    include: {
      counterparty: true
    }
  });

  await createActivityLog(db, {
    dealId,
    activityType: ActivityType.GENERAL,
    counterpartyId: lenderQuote.counterpartyId,
    title: 'Lender quote logged',
    body: `${lenderQuote.facilityLabel} at ${lenderQuote.amountKrw.toLocaleString()} KRW (${lenderQuote.status.toLowerCase()}).`,
    metadata: {
      lenderQuoteId: lenderQuote.id,
      status: lenderQuote.status,
      amountKrw: lenderQuote.amountKrw
    }
  });

  await recordDealProbabilitySnapshot(dealId, 'lender_quote_created', db);
  return lenderQuote;
}

export async function updateDealLenderQuote(
  dealId: string,
  lenderQuoteId: string,
  input: unknown,
  db: PrismaClient = prisma
) {
  const parsed = dealLenderQuoteUpdateSchema.parse(input);
  const lenderQuote = await db.dealLenderQuote.findFirst({
    where: { id: lenderQuoteId, dealId }
  });
  if (!lenderQuote) throw new Error('Lender quote not found');

  if (parsed.counterpartyId) {
    const counterparty = await db.counterparty.findFirst({
      where: { id: parsed.counterpartyId, dealId }
    });
    if (!counterparty) throw new Error('Counterparty not found for this deal');
  }

  const updated = await db.dealLenderQuote.update({
    where: { id: lenderQuoteId },
    data: {
      facilityLabel: parsed.facilityLabel ?? undefined,
      counterpartyId: parsed.counterpartyId ?? undefined,
      status: parsed.status ?? undefined,
      amountKrw: parsed.amountKrw ?? undefined,
      ltvPct: parsed.ltvPct ?? undefined,
      spreadBps: parsed.spreadBps ?? undefined,
      allInRatePct: parsed.allInRatePct ?? undefined,
      dscrFloor: parsed.dscrFloor ?? undefined,
      termMonths: parsed.termMonths ?? undefined,
      ioMonths: parsed.ioMonths ?? undefined,
      quotedAt: parsed.quotedAt ?? undefined,
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
    title: 'Lender quote updated',
    body: `${updated.facilityLabel} is now ${updated.status.toLowerCase()} at ${(updated.amountKrw ?? lenderQuote.amountKrw).toLocaleString()} KRW.`,
    metadata: {
      lenderQuoteId: updated.id,
      status: updated.status,
      amountKrw: updated.amountKrw ?? lenderQuote.amountKrw
    }
  });

  await recordDealProbabilitySnapshot(dealId, 'lender_quote_updated', db);
  return updated;
}

export async function createDealNegotiationEvent(dealId: string, input: unknown, db: PrismaClient = prisma) {
  const parsed = dealNegotiationEventCreateSchema.parse(input);
  const deal = await db.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new Error('Deal not found');

  if (parsed.counterpartyId) {
    const counterparty = await db.counterparty.findFirst({
      where: { id: parsed.counterpartyId, dealId }
    });
    if (!counterparty) throw new Error('Counterparty not found for this deal');
  }

  if (parsed.bidRevisionId) {
    const bidRevision = await db.dealBidRevision.findFirst({
      where: { id: parsed.bidRevisionId, dealId }
    });
    if (!bidRevision) throw new Error('Bid revision not found for this deal');
  }

  const negotiationEvent = await db.dealNegotiationEvent.create({
    data: {
      dealId,
      counterpartyId: parsed.counterpartyId ?? null,
      bidRevisionId: parsed.bidRevisionId ?? null,
      eventType: parsed.eventType,
      title: parsed.title,
      effectiveAt: parsed.effectiveAt ?? new Date(),
      expiresAt: parsed.expiresAt ?? null,
      summary: parsed.summary ?? null
    },
    include: {
      counterparty: true,
      bidRevision: true
    }
  });

  await createActivityLog(db, {
    dealId,
    activityType: ActivityType.GENERAL,
    counterpartyId: negotiationEvent.counterpartyId,
    title: 'Negotiation event logged',
    body: `${negotiationEvent.title} (${negotiationEvent.eventType.toLowerCase().replaceAll('_', ' ')}).`,
    metadata: {
      negotiationEventId: negotiationEvent.id,
      eventType: negotiationEvent.eventType,
      expiresAt: negotiationEvent.expiresAt?.toISOString() ?? null
    }
  });

  await recordDealProbabilitySnapshot(dealId, 'negotiation_event_created', db);
  return negotiationEvent;
}

export async function updateDealNegotiationEvent(
  dealId: string,
  negotiationEventId: string,
  input: unknown,
  db: PrismaClient = prisma
) {
  const parsed = dealNegotiationEventUpdateSchema.parse(input);
  const negotiationEvent = await db.dealNegotiationEvent.findFirst({
    where: { id: negotiationEventId, dealId }
  });
  if (!negotiationEvent) throw new Error('Negotiation event not found');

  if (parsed.counterpartyId) {
    const counterparty = await db.counterparty.findFirst({
      where: { id: parsed.counterpartyId, dealId }
    });
    if (!counterparty) throw new Error('Counterparty not found for this deal');
  }

  if (parsed.bidRevisionId) {
    const bidRevision = await db.dealBidRevision.findFirst({
      where: { id: parsed.bidRevisionId, dealId }
    });
    if (!bidRevision) throw new Error('Bid revision not found for this deal');
  }

  const updated = await db.dealNegotiationEvent.update({
    where: { id: negotiationEventId },
    data: {
      counterpartyId: parsed.counterpartyId ?? undefined,
      bidRevisionId: parsed.bidRevisionId ?? undefined,
      eventType: parsed.eventType ?? undefined,
      title: parsed.title ?? undefined,
      effectiveAt: parsed.effectiveAt ?? undefined,
      expiresAt: parsed.expiresAt ?? undefined,
      summary: parsed.summary ?? undefined
    },
    include: {
      counterparty: true,
      bidRevision: true
    }
  });

  await createActivityLog(db, {
    dealId,
    activityType: ActivityType.GENERAL,
    counterpartyId: updated.counterpartyId,
    title: 'Negotiation event updated',
    body: `${updated.title} (${updated.eventType.toLowerCase().replaceAll('_', ' ')}).`,
    metadata: {
      negotiationEventId: updated.id,
      eventType: updated.eventType,
      expiresAt: updated.expiresAt?.toISOString() ?? null
    }
  });

  await recordDealProbabilitySnapshot(dealId, 'negotiation_event_updated', db);
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

  await recordDealProbabilitySnapshot(dealId, 'task_updated', db);
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

  await recordDealProbabilitySnapshot(dealId, 'risk_created', db);
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

  await recordDealProbabilitySnapshot(dealId, 'risk_updated', db);
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

  const activity = await createActivityLog(db, {
    dealId,
    activityType: parsed.activityType,
    title: parsed.title,
    body: parsed.body ?? null,
    counterpartyId: parsed.counterpartyId ?? null
  });
  await recordDealProbabilitySnapshot(dealId, 'activity_logged', db);
  return activity;
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

  if (createdTasks.length > 0) {
    await recordDealProbabilitySnapshot(dealId, 'checklist_seeded', db);
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

  await recordDealProbabilitySnapshot(dealId, 'archived', db);
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
      lossReason: deal.statusLabel === 'CLOSED_LOST' ? null : deal.lossReason,
      nextAction: deal.nextAction ?? getDefaultNextAction(deal.stage)
    }
  });

  await createActivityLog(db, {
    dealId,
    activityType: ActivityType.GENERAL,
    title: 'Deal restored',
    body: parsed.summary ?? 'Execution record restored from archive.'
  });

  await recordDealProbabilitySnapshot(dealId, 'restored', db);
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
      lossReason: parsed.outcome === 'CLOSED_LOST' ? parsed.lossReason ?? DealLossReason.OTHER : null,
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

  await recordDealProbabilitySnapshot(dealId, 'close_out', db);
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
  const documentRequests = deal.documentRequests ?? [];
  const suggestedRequestCount = documentRequests.filter(
    (request) =>
      request.status === DealRequestStatus.REQUESTED &&
      request.documentId == null &&
      ('matchSuggestion' in request ? request.matchSuggestion : null) != null
  ).length;
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
  const activeExclusivityEvent =
    deal.negotiationEvents.find(
      (event) =>
        (event.eventType === 'EXCLUSIVITY_GRANTED' || event.eventType === 'EXCLUSIVITY_EXTENDED') &&
        event.expiresAt &&
        event.expiresAt.getTime() >= now
    ) ?? null;
  const exclusivityExpiresSoon =
    activeExclusivityEvent?.expiresAt &&
    activeExclusivityEvent.expiresAt.getTime() <= now + 1000 * 60 * 60 * 24 * 3;

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
    suggestedRequestCount,
    activeExclusivityEvent,
    exclusivityExpiresSoon: !!exclusivityExpiresSoon,
    nextTask,
    reminderSummary:
      overdueTasks.length > 0
        ? `${overdueTasks.length} overdue task${overdueTasks.length === 1 ? '' : 's'} need attention.`
        : exclusivityExpiresSoon
          ? `Exclusivity expires ${activeExclusivityEvent?.expiresAt?.toLocaleDateString()}.`
        : suggestedRequestCount > 0
          ? `${suggestedRequestCount} DD request suggestion${suggestedRequestCount === 1 ? '' : 's'} still need operator confirmation.`
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
  const lenderQuoteCount = deal.lenderQuotes.length;
  const negotiationEventCount = deal.negotiationEvents.length;
  const diligenceSummary = buildDealDiligenceSummary(deal);
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
      key: 'specialist-workstreams',
      title: 'Specialist diligence workstreams',
      status:
        diligenceSummary.totalCount > 0 && diligenceSummary.missingCoreTypes.length === 0
          ? 'done'
          : getStageIndex(deal.stage) >= getStageIndex(DealStage.DD)
            ? 'missing'
            : 'done',
      detail:
        diligenceSummary.totalCount > 0
          ? `${diligenceSummary.signedOffCount} signed off / ${diligenceSummary.totalCount} open workstreams. ${diligenceSummary.headline}`
          : 'No specialist diligence workstreams are tracked yet.'
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
      key: 'lender-process',
      title: 'Financing quotes tracked',
      status:
        getStageIndex(deal.stage) >= getStageIndex(DealStage.IC) && lenderQuoteCount === 0 ? 'missing' : 'done',
      detail:
        lenderQuoteCount > 0
          ? `${lenderQuoteCount} lender quote${lenderQuoteCount === 1 ? '' : 's'} captured.`
          : 'No structured lender quote or term sheet tracked yet.'
    },
    {
      key: 'negotiation-events',
      title: 'Counter and feedback log',
      status:
        getStageIndex(deal.stage) >= getStageIndex(DealStage.LOI) && negotiationEventCount === 0 ? 'missing' : 'done',
      detail:
        negotiationEventCount > 0
          ? `${negotiationEventCount} negotiation event${negotiationEventCount === 1 ? '' : 's'} captured.`
          : 'No structured seller counter, buyer feedback, or exclusivity event logged yet.'
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
      lenderQuoteCount,
      negotiationEventCount,
      counterpartyCount: deal.counterparties.length,
      diligenceWorkstreamCount: diligenceSummary.totalCount,
      signedOffWorkstreamCount: diligenceSummary.signedOffCount,
      blockedWorkstreamCount: diligenceSummary.blockedCount,
      requiredChecklistPct
    },
    checks,
    gaps
  };
}

export function buildDealClosingReadiness(
  deal: DealListRecord | DealDetailRecord,
  snapshot?: DealExecutionSnapshot | null
): DealClosingReadiness {
  const stageIndex = getStageIndex(deal.stage);
  const latestValuation = deal.asset?.valuations[0] ?? null;
  const acceptedBid =
    deal.bidRevisions.find((bid) => bid.status === DealBidStatus.ACCEPTED) ?? deal.bidRevisions[0] ?? null;
  const approvedLenderQuote =
    deal.lenderQuotes.find(
      (quote) =>
        quote.status === 'CREDIT_APPROVED' ||
        quote.status === 'CLOSED'
    ) ?? null;
  const hasLiveExclusivity = !!snapshot?.activeExclusivityEvent;
  const totalRequestCount = deal.documentRequests.length;
  const clearedRequestCount = deal.documentRequests.filter(
    (request) => request.status === DealRequestStatus.RECEIVED || request.status === DealRequestStatus.WAIVED
  ).length;
  const suggestedRequestCount = deal.documentRequests.filter(
    (request) =>
      request.status === DealRequestStatus.REQUESTED &&
      request.documentId == null &&
      ('matchSuggestion' in request ? request.matchSuggestion : null) != null
  ).length;
  const requestCompletionPct =
    totalRequestCount > 0 ? (clearedRequestCount / totalRequestCount) * 100 : 0;
  const hasExecutionContacts = deal.counterparties.some(
    (counterparty) => counterparty.role === 'BUYER' || counterparty.role === 'LENDER'
  );
  const diligenceSummary = buildDealDiligenceSummary(deal);
  const valuationFreshnessDays = latestValuation
    ? Math.floor((Date.now() - latestValuation.createdAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const checks: DealClosingReadiness['checks'] = [
    {
      key: 'accepted-bid',
      title: 'Accepted executable bid',
      status:
        acceptedBid?.status === DealBidStatus.ACCEPTED
          ? 'done'
          : stageIndex >= getStageIndex(DealStage.LOI)
            ? 'missing'
            : 'open',
      detail:
        acceptedBid?.status === DealBidStatus.ACCEPTED
          ? `${acceptedBid.label} is marked accepted.`
          : acceptedBid
            ? `Latest bid is ${acceptedBid.status.toLowerCase()}.`
            : 'No accepted bid or signed commercial paper is logged yet.',
      isBlocker: true
    },
    {
      key: 'financing-approved',
      title: 'Financing approval',
      status:
        approvedLenderQuote
          ? 'done'
          : stageIndex >= getStageIndex(DealStage.IC)
            ? 'missing'
            : 'open',
      detail:
        approvedLenderQuote
          ? `${approvedLenderQuote.facilityLabel} is ${approvedLenderQuote.status.toLowerCase()}.`
          : 'No approved lender quote or closed financing is logged.',
      isBlocker: true
    },
    {
      key: 'live-exclusivity',
      title: 'Live exclusivity clock',
      status:
        hasLiveExclusivity
          ? 'done'
          : stageIndex >= getStageIndex(DealStage.LOI)
            ? 'missing'
            : 'open',
      detail: hasLiveExclusivity
        ? `Exclusivity runs until ${snapshot?.activeExclusivityEvent?.expiresAt?.toLocaleDateString()}.`
        : 'No live exclusivity event is protecting the process.',
      isBlocker: stageIndex >= getStageIndex(DealStage.DD)
    },
    {
      key: 'dd-cleared',
      title: 'DD request tracker cleared',
      status:
        totalRequestCount === 0
          ? stageIndex >= getStageIndex(DealStage.DD)
            ? 'missing'
            : 'open'
          : requestCompletionPct >= 100
            ? 'done'
            : requestCompletionPct >= 50
              ? 'open'
              : 'missing',
      detail:
        totalRequestCount > 0
          ? `${clearedRequestCount} of ${totalRequestCount} diligence requests are cleared.${suggestedRequestCount > 0 ? ` ${suggestedRequestCount} item${suggestedRequestCount === 1 ? '' : 's'} still have suggested documents pending operator confirmation.` : ''}`
          : 'No diligence request tracker has been opened yet.',
      isBlocker: stageIndex >= getStageIndex(DealStage.DD)
    },
    {
      key: 'specialist-signoff',
      title: 'Core specialist diligence signed off',
      status:
        diligenceSummary.missingCoreTypes.length === 0 &&
        diligenceSummary.blockedCount === 0 &&
        diligenceSummary.signedOffCount >= diligenceSummary.coreRequiredTypes.length &&
        diligenceSummary.uncoveredCoreTypes.length === 0
          ? 'done'
          : stageIndex >= getStageIndex(DealStage.DD)
            ? diligenceSummary.readyForSignoffCount > 0
              ? 'open'
              : 'missing'
            : 'open',
      detail:
        diligenceSummary.missingCoreTypes.length > 0
          ? `Open ${diligenceSummary.missingCoreTypes.map((item) => toSentenceCase(item)).join(', ')} workstreams before committee progression.`
          : diligenceSummary.blockedCount > 0
            ? `${diligenceSummary.blockedCount} workstream blocker${diligenceSummary.blockedCount === 1 ? '' : 's'} still need intervention.`
            : diligenceSummary.uncoveredCoreTypes.length > 0
              ? `Attach supporting deliverables for ${diligenceSummary.uncoveredCoreTypes.map((item) => toSentenceCase(item)).join(', ')} before packet lock.`
            : `${diligenceSummary.signedOffCount} signed-off workstream${diligenceSummary.signedOffCount === 1 ? '' : 's'} are logged across ${diligenceSummary.totalCount} tracked lanes.`,
      isBlocker: stageIndex >= getStageIndex(DealStage.IC)
    },
    {
      key: 'recent-valuation',
      title: 'Recent valuation anchor',
      status:
        !latestValuation
          ? 'missing'
          : valuationFreshnessDays !== null && valuationFreshnessDays <= 30
            ? 'done'
            : 'open',
      detail:
        latestValuation
          ? valuationFreshnessDays !== null && valuationFreshnessDays <= 30
            ? `Latest valuation is ${valuationFreshnessDays} day${valuationFreshnessDays === 1 ? '' : 's'} old.`
            : `Latest valuation is ${valuationFreshnessDays ?? '?'} days old and should be refreshed.`
          : 'No linked valuation is available.',
      isBlocker: stageIndex >= getStageIndex(DealStage.IC)
    },
    {
      key: 'stage-checklist',
      title: 'Current stage checklist complete',
      status:
        (snapshot?.checklistCompletionPct ?? 0) >= 100
          ? 'done'
          : (snapshot?.checklistCompletionPct ?? 0) > 0
            ? 'open'
            : 'missing',
      detail:
        snapshot
          ? `${snapshot.completedChecklistCount} of ${snapshot.requiredChecklistCount} required items are complete.`
          : 'Stage checklist has not been evaluated.',
      isBlocker: true
    },
    {
      key: 'execution-contacts',
      title: 'Execution counterparties assigned',
      status:
        hasExecutionContacts
          ? 'done'
          : stageIndex >= getStageIndex(DealStage.CLOSING)
            ? 'missing'
            : 'open',
      detail: hasExecutionContacts
        ? 'Buyer or lender execution contacts are logged.'
        : 'Assign at least one buyer or lender execution contact.',
      isBlocker: stageIndex >= getStageIndex(DealStage.CLOSING)
    }
  ];

  const weightedCompletion = checks.reduce((sum, check) => {
    if (check.status === 'done') return sum + 1;
    if (check.status === 'open') return sum + 0.5;
    return sum;
  }, 0);
  const blockerCount = checks.filter((check) => check.isBlocker && check.status !== 'done').length;
  const blockers = checks.filter((check) => check.isBlocker && check.status !== 'done').map((check) => check.title);

  return {
    scorePct: checks.length > 0 ? (weightedCompletion / checks.length) * 100 : 100,
    completedCount: checks.filter((check) => check.status === 'done').length,
    totalCount: checks.length,
    blockerCount,
    readyToClose: blockerCount === 0,
    checks,
    blockers
  };
}

export function buildDealCloseProbability(
  deal: DealListRecord | DealDetailRecord,
  snapshot?: DealExecutionSnapshot | null,
  readiness?: DealClosingReadiness | null
): DealCloseProbability {
  const readinessView = readiness ?? buildDealClosingReadiness(deal, snapshot);
  const stageBaseScore: Record<DealStage, number> = {
    SOURCED: 15,
    SCREENED: 25,
    NDA: 35,
    LOI: 50,
    DD: 60,
    IC: 72,
    CLOSING: 82,
    ASSET_MANAGEMENT: 98
  };
  const acceptedBid = deal.bidRevisions.some((bid) => bid.status === DealBidStatus.ACCEPTED);
  const approvedLenderQuote = deal.lenderQuotes.some(
    (quote) => quote.status === 'CREDIT_APPROVED' || quote.status === 'CLOSED'
  );
  const latestLenderQuote = deal.lenderQuotes[0] ?? null;
  const latestNegotiationEvent = deal.negotiationEvents[0] ?? null;
  const recentSellerCounter =
    latestNegotiationEvent?.eventType === 'SELLER_COUNTER' &&
    Date.now() - latestNegotiationEvent.effectiveAt.getTime() <= 1000 * 60 * 60 * 24 * 14;
  const latestValuation = deal.asset?.valuations[0] ?? null;
  const staleValuation =
    latestValuation != null &&
    Date.now() - latestValuation.createdAt.getTime() > 1000 * 60 * 60 * 24 * 30;
  const staleExecution = Date.now() - getDealMaterialUpdatedAt(deal).getTime() > 1000 * 60 * 60 * 24 * 7;
  const openRiskCount = deal.riskFlags.filter((risk) => !risk.isResolved).length;
  const criticalRiskCount = deal.riskFlags.filter(
    (risk) => !risk.isResolved && risk.severity === RiskSeverity.CRITICAL
  ).length;
  const suggestedRequestCount = deal.documentRequests.filter(
    (request) =>
      request.status === DealRequestStatus.REQUESTED &&
      request.documentId == null &&
      ('matchSuggestion' in request ? request.matchSuggestion : null) != null
  ).length;
  const overdueTaskCount = snapshot?.overdueTaskCount ?? 0;
  const hasNextAction = !!deal.nextAction;
  const closingLikeStage = stageBaseScore[deal.stage] >= stageBaseScore[DealStage.IC];
  const lenderStatusAdjustment =
    latestLenderQuote?.status === 'CLOSED' || latestLenderQuote?.status === 'CREDIT_APPROVED'
      ? 6
      : latestLenderQuote?.status === 'TERM_SHEET'
        ? 2
        : latestLenderQuote?.status === 'DECLINED' || latestLenderQuote?.status === 'WITHDRAWN'
          ? -7
          : 0;

  let score =
    stageBaseScore[deal.stage] +
    (readinessView.scorePct - 50) * 0.25 +
    (acceptedBid ? 8 : 0) +
    (approvedLenderQuote ? 8 : closingLikeStage ? -8 : 0) +
    lenderStatusAdjustment +
    (snapshot?.activeExclusivityEvent ? 5 : 0) -
    (closingLikeStage && !snapshot?.activeExclusivityEvent ? 5 : 0) -
    openRiskCount * 3 -
    criticalRiskCount * 6 -
    overdueTaskCount * 2 -
    suggestedRequestCount * 1.5 -
    (hasNextAction ? 0 : 5) -
    (staleValuation ? 4 : 0) -
    (staleExecution ? 5 : 0) -
    (snapshot?.exclusivityExpiresSoon ? 3 : 0) -
    (recentSellerCounter ? 6 : 0) -
    (closingLikeStage && !acceptedBid ? 8 : 0) -
    readinessView.blockerCount * 2;

  score = Math.max(5, Math.min(98, score));

  const band: DealCloseProbability['band'] = score >= 75 ? 'HIGH' : score >= 50 ? 'MEDIUM' : 'LOW';
  const drivers = [
    acceptedBid ? 'Accepted bid is logged.' : 'No accepted bid is in the record.',
    approvedLenderQuote
      ? 'Financing is approved or closed.'
      : latestLenderQuote
        ? `Latest lender signal is ${latestLenderQuote.status.toLowerCase()}.`
        : 'No approved financing is logged.',
    snapshot?.activeExclusivityEvent
      ? `Exclusivity is live until ${snapshot.activeExclusivityEvent.expiresAt?.toLocaleDateString()}.`
      : 'No live exclusivity clock is protecting the process.',
    overdueTaskCount > 0
      ? `${overdueTaskCount} overdue task${overdueTaskCount === 1 ? '' : 's'} are dragging execution.`
      : 'No overdue tasks are sitting in the queue.',
    suggestedRequestCount > 0
      ? `${suggestedRequestCount} DD suggestion${suggestedRequestCount === 1 ? '' : 's'} still need operator confirmation.`
      : 'No unconfirmed DD document suggestions are sitting in the queue.',
    criticalRiskCount > 0
      ? `${criticalRiskCount} critical risk${criticalRiskCount === 1 ? '' : 's'} remain unresolved.`
      : 'No critical risk flags are open.',
    recentSellerCounter
      ? 'Seller has recently countered, so commercial certainty is still moving.'
      : 'No recent seller counter is disrupting the current path.',
    staleExecution
      ? 'Execution record is stale and has not been updated in the last 7 days.'
      : 'Execution record is fresh.'
  ];

  return {
    scorePct: score,
    band,
    headline:
      band === 'HIGH'
        ? 'Close path is credible if the current checklist stays clean.'
        : band === 'MEDIUM'
          ? 'Deal can close, but execution gaps still need active management.'
          : 'Close path is fragile until commercial, financing, or process blockers are cleared.',
    drivers
  };
}

export type DealOriginationProfile = {
  scorePct: number;
  band: 'LOW' | 'MEDIUM' | 'HIGH';
  headline: string;
  sourceLabel: string;
  relationshipCoverageLabel: string;
  exclusivityLabel: string;
  lastTouchLabel: string;
  lossLabel: string | null;
  strengths: string[];
  blockers: string[];
};

function formatEnumLabel(value: string | null | undefined) {
  if (!value) return 'Not set';
  return toSentenceCase(value);
}

export function buildDealOriginationProfile(
  deal: DealListRecord | DealDetailRecord,
  snapshot?: DealExecutionSnapshot | null
): DealOriginationProfile {
  const snapshotView = snapshot ?? buildDealExecutionSnapshot(deal as DealDetailRecord);
  const counterparties = deal.counterparties ?? [];
  const roles = counterparties.map((counterparty) => counterparty.role);
  const hasSellerCoverage = roles.some((role) => role === 'BROKER' || role === 'SELLER' || role === 'OWNER');
  const hasLenderCoverage = roles.some((role) => role === 'LENDER');
  const primaryCoverage = counterparties.filter(
    (counterparty) => counterparty.coverageStatus === RelationshipCoverageStatus.PRIMARY
  );
  const recentContacts = counterparties.filter((counterparty) => {
    if (!counterparty.lastContactAt) return false;
    return Date.now() - counterparty.lastContactAt.getTime() <= 1000 * 60 * 60 * 24 * 21;
  });
  const latestRecentContact = [...counterparties]
    .filter((counterparty) => counterparty.lastContactAt)
    .sort((left, right) => {
      const leftValue = left.lastContactAt?.getTime() ?? 0;
      const rightValue = right.lastContactAt?.getTime() ?? 0;
      return rightValue - leftValue;
    })[0] ?? null;
  const activeExclusivityEvent =
    snapshotView?.activeExclusivityEvent ??
    deal.negotiationEvents.find(
      (event) =>
        (event.eventType === 'EXCLUSIVITY_GRANTED' || event.eventType === 'EXCLUSIVITY_EXTENDED') &&
        event.expiresAt &&
        event.expiresAt.getTime() >= Date.now()
    ) ??
    null;
  const hasLiveExclusivity = !!activeExclusivityEvent;
  const hasAcceptedBid = deal.bidRevisions.some((bid) => bid.status === DealBidStatus.ACCEPTED);
  const hasLiveBid = deal.bidRevisions.some(
    (bid) => bid.status === DealBidStatus.SUBMITTED || bid.status === DealBidStatus.COUNTERED || bid.status === DealBidStatus.BAFO
  );
  const researchSnapshots = deal.asset?.researchSnapshots ?? [];
  const coverageTasks = deal.asset?.coverageTasks ?? [];
  const freshResearchCount = researchSnapshots.filter((item) => item.freshnessStatus === 'FRESH').length;
  const conflictOrStaleCoverage = coverageTasks.filter((task) => task.status !== TaskStatus.DONE).length;
  const staleExecution = Date.now() - getDealMaterialUpdatedAt(deal).getTime() > 1000 * 60 * 60 * 24 * 7;
  const openRiskCount = deal.riskFlags.filter((risk) => !risk.isResolved).length;
  const sourceSet = deal.originationSource != null;

  let score = 20;
  score += sourceSet ? 12 : 0;
  score += deal.originSummary ? 8 : 0;
  score += hasSellerCoverage ? 14 : -8;
  score += hasLenderCoverage ? 8 : 0;
  score += primaryCoverage.length > 0 ? 14 : -6;
  score += primaryCoverage.length > 1 ? 4 : 0;
  score += recentContacts.length > 0 ? 10 : -5;
  score += hasLiveExclusivity ? 15 : getStageIndex(deal.stage) >= getStageIndex(DealStage.LOI) ? -10 : 0;
  score += hasAcceptedBid ? 8 : hasLiveBid ? 4 : 0;
  score += freshResearchCount > 0 ? 8 : 0;
  score -= Math.min(conflictOrStaleCoverage * 2, 10);
  score -= Math.min(openRiskCount * 3, 12);
  score -= staleExecution ? 8 : 0;
  score -= deal.nextAction ? 0 : 5;
  score = Math.max(5, Math.min(98, score));

  const band: DealOriginationProfile['band'] = score >= 75 ? 'HIGH' : score >= 50 ? 'MEDIUM' : 'LOW';
  const strengths = [
    sourceSet ? `Source path is tagged as ${formatEnumLabel(deal.originationSource)}.` : null,
    primaryCoverage.length > 0
      ? `${primaryCoverage.length} primary relationship owner${primaryCoverage.length === 1 ? '' : 's'} are assigned.`
      : null,
    recentContacts.length > 0
      ? `${recentContacts.length} counterparty touchpoint${recentContacts.length === 1 ? '' : 's'} were logged in the last 21 days.`
      : null,
    hasLiveExclusivity ? 'Live exclusivity is protecting the pursuit.' : null,
    hasAcceptedBid ? 'Accepted paper is already in the process.' : hasLiveBid ? 'A live bid is already in market.' : null,
    freshResearchCount > 0 ? `${freshResearchCount} fresh research snapshot${freshResearchCount === 1 ? '' : 's'} support the process.` : null
  ].filter((item): item is string => !!item);
  const blockers = [
    !hasSellerCoverage ? 'No broker, seller, or owner-side relationship is logged.' : null,
    primaryCoverage.length === 0 ? 'No primary relationship owner is assigned.' : null,
    recentContacts.length === 0 ? 'No recent counterparty touchpoint is logged.' : null,
    !hasLiveExclusivity && getStageIndex(deal.stage) >= getStageIndex(DealStage.LOI)
      ? 'LOI-stage or deeper process has no live exclusivity clock.'
      : null,
    conflictOrStaleCoverage > 0 ? `${conflictOrStaleCoverage} research blocker${conflictOrStaleCoverage === 1 ? '' : 's'} still sit open.` : null,
    staleExecution ? 'Deal execution record is stale.' : null
  ].filter((item): item is string => !!item);

  return {
    scorePct: score,
    band,
    headline:
      band === 'HIGH'
        ? 'Origination coverage is institutional and the process has real commercial shape.'
        : band === 'MEDIUM'
          ? 'Origination coverage is usable, but relationship ownership or process protection still needs work.'
          : 'Origination coverage is thin and the deal is still vulnerable to process drift.',
    sourceLabel: formatEnumLabel(deal.originationSource),
    relationshipCoverageLabel:
      primaryCoverage.length > 0
        ? `${primaryCoverage.length} primary / ${counterparties.length} total counterparties`
        : `${counterparties.length} counterparties / no primary owner`,
    exclusivityLabel: hasLiveExclusivity
      ? `Live until ${activeExclusivityEvent?.expiresAt?.toLocaleDateString() ?? 'active'}`
      : 'No live exclusivity',
    lastTouchLabel: latestRecentContact?.lastContactAt
      ? `${latestRecentContact.name} / ${latestRecentContact.lastContactAt.toLocaleDateString()}`
      : 'No recent touchpoint logged',
    lossLabel: deal.lossReason ? formatEnumLabel(deal.lossReason) : null,
    strengths,
    blockers
  };
}

export function buildDealCloseProbabilityHistory(
  deal: DealDetailRecord,
  current?: {
    readiness: DealClosingReadiness;
    probability: DealCloseProbability;
  }
): DealCloseProbabilityHistoryPoint[] {
  const persisted = deal.probabilitySnapshots.map((item) => ({
    id: item.id,
    createdAt: item.createdAt,
    stage: item.stage,
    scorePct: item.closeProbabilityPct,
    band: item.closeProbabilityBand as DealCloseProbability['band'],
    readinessScorePct: item.readinessScorePct,
    blockerCount: item.readinessBlockerCount,
    reason: formatProbabilitySnapshotReason(item.snapshotReason),
    headline: item.headline,
    openRiskCount: item.openRiskCount,
    overdueTaskCount: item.overdueTaskCount,
    pendingSuggestedRequestCount: getPendingSuggestedSnapshotCount(item),
    flags: [
      item.hasAcceptedBid ? 'accepted bid' : null,
      item.hasApprovedFinancing ? 'approved financing' : null,
      item.hasLiveExclusivity ? 'live exclusivity' : null,
      getPendingSuggestedSnapshotCount(item) > 0
        ? `pending DD suggestions (${getPendingSuggestedSnapshotCount(item)})`
        : null
    ].filter(Boolean) as string[]
  }));

  if (!current) {
    return persisted;
  }

  const currentPoint: DealCloseProbabilityHistoryPoint = {
    id: 'current',
    createdAt: getDealProbabilityObservedAt(deal),
    stage: deal.stage,
    scorePct: current.probability.scorePct,
    band: current.probability.band,
    readinessScorePct: current.readiness.scorePct,
    blockerCount: current.readiness.blockerCount,
    reason: 'current state',
    headline: current.probability.headline,
    openRiskCount: deal.riskFlags.filter((risk) => !risk.isResolved).length,
    overdueTaskCount: deal.tasks.filter(
      (task) => task.status !== TaskStatus.DONE && task.dueDate && task.dueDate.getTime() < Date.now()
    ).length,
    pendingSuggestedRequestCount: deal.documentRequests.filter(
      (request) =>
        request.status === DealRequestStatus.REQUESTED &&
        request.documentId == null &&
        (request.matchSuggestion ?? null) != null
    ).length,
    flags: [
      deal.bidRevisions.some((bid) => bid.status === DealBidStatus.ACCEPTED) ? 'accepted bid' : null,
      deal.lenderQuotes.some((quote) => quote.status === 'CREDIT_APPROVED' || quote.status === 'CLOSED')
        ? 'approved financing'
        : null,
      deal.negotiationEvents.some(
        (event) =>
          (event.eventType === 'EXCLUSIVITY_GRANTED' || event.eventType === 'EXCLUSIVITY_EXTENDED') &&
          event.expiresAt &&
          event.expiresAt.getTime() >= Date.now()
      )
        ? 'live exclusivity'
        : null,
      deal.documentRequests.some(
        (request) =>
          request.status === DealRequestStatus.REQUESTED &&
          request.documentId == null &&
          (request.matchSuggestion ?? null) != null
      )
        ? `pending DD suggestions (${deal.documentRequests.filter(
            (request) =>
              request.status === DealRequestStatus.REQUESTED &&
              request.documentId == null &&
              (request.matchSuggestion ?? null) != null
          ).length})`
        : null
    ].filter(Boolean) as string[]
  };

  if (persisted.length === 0) {
    return [currentPoint];
  }

  const latestPersisted = persisted[0];
  const currentMatchesLatest =
    latestPersisted?.scorePct === currentPoint.scorePct &&
    latestPersisted?.readinessScorePct === currentPoint.readinessScorePct &&
    latestPersisted?.blockerCount === currentPoint.blockerCount &&
    latestPersisted?.stage === currentPoint.stage &&
    latestPersisted?.headline === currentPoint.headline &&
    latestPersisted?.openRiskCount === currentPoint.openRiskCount &&
    latestPersisted?.overdueTaskCount === currentPoint.overdueTaskCount &&
    getPendingSuggestedSnapshotCount(latestPersisted) === currentPoint.pendingSuggestedRequestCount;

  return currentMatchesLatest ? persisted : [currentPoint, ...persisted];
}

export async function recordDealProbabilitySnapshot(
  dealId: string,
  snapshotReason: string,
  db: PrismaClient
) {
  try {
    if (!('dealExecutionProbabilitySnapshot' in db) || !db.dealExecutionProbabilitySnapshot) {
      return null;
    }

    if ('deal' in db && db.deal && 'update' in db.deal) {
      await db.deal.update({
        where: { id: dealId },
        data: {
          updatedAt: new Date()
        }
      });
    }

    const deal = await getDealById(dealId, db);
    if (
      !deal ||
      !Array.isArray(deal.tasks) ||
      !Array.isArray(deal.riskFlags) ||
      !Array.isArray(deal.counterparties) ||
      !Array.isArray(deal.documentRequests) ||
      !Array.isArray(deal.bidRevisions) ||
      !Array.isArray(deal.lenderQuotes) ||
      !Array.isArray(deal.negotiationEvents) ||
      !Array.isArray(deal.activityLogs)
    ) {
      return null;
    }

    const executionSnapshot = buildDealExecutionSnapshot(deal);
    if (!executionSnapshot) return null;

    const readiness = buildDealClosingReadiness(deal, executionSnapshot);
    const probability = buildDealCloseProbability(deal, executionSnapshot, readiness);

    return db.dealExecutionProbabilitySnapshot.create({
      data: {
        dealId,
        stage: deal.stage,
        snapshotReason,
        readinessScorePct: readiness.scorePct,
        readinessBlockerCount: readiness.blockerCount,
        closeProbabilityPct: probability.scorePct,
        closeProbabilityBand: probability.band,
        headline: probability.headline,
        openRiskCount: executionSnapshot.openRiskCount,
        overdueTaskCount: executionSnapshot.overdueTaskCount,
        pendingSuggestedRequestCount: deal.documentRequests.filter(
          (request) =>
            request.status === DealRequestStatus.REQUESTED &&
            request.documentId == null &&
            (request.matchSuggestion ?? null) != null
        ).length,
        hasAcceptedBid: deal.bidRevisions.some((bid) => bid.status === DealBidStatus.ACCEPTED),
        hasApprovedFinancing: deal.lenderQuotes.some(
          (quote) => quote.status === 'CREDIT_APPROVED' || quote.status === 'CLOSED'
        ),
        hasLiveExclusivity: !!executionSnapshot.activeExclusivityEvent
      } as Prisma.DealExecutionProbabilitySnapshotUncheckedCreateInput
    });
  } catch {
    return null;
  }
}

export async function syncDealProbabilitySnapshotsForAssetDeals(
  assetId: string,
  snapshotReason: string,
  db: PrismaClient = prisma
) {
  if (!('deal' in db) || !db.deal || !('findMany' in db.deal)) {
    return [];
  }

  const deals = await db.deal.findMany({
    where: {
      assetId,
      archivedAt: null
    },
    select: {
      id: true
    }
  });

  return Promise.all(deals.map((deal) => recordDealProbabilitySnapshot(deal.id, snapshotReason, db)));
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

  const negotiationEvents: DealTimelineEvent[] = deal.negotiationEvents.map((event) => ({
    id: `negotiation-${event.id}`,
    kind: 'activity',
    category: 'execution',
    title: event.title,
    body: [event.summary, event.expiresAt ? `expires ${event.expiresAt.toLocaleDateString()}` : null]
      .filter(Boolean)
      .join(' / ') || null,
    createdAt: event.effectiveAt,
    href: null,
    tone:
      event.eventType === 'SELLER_COUNTER' || event.eventType === 'EXCLUSIVITY_GRANTED' || event.eventType === 'EXCLUSIVITY_EXTENDED'
        ? 'warn'
        : 'neutral',
    meta: [
      'negotiation',
      event.eventType.toLowerCase().replaceAll('_', ' '),
      event.counterparty ? event.counterparty.role.toLowerCase() : null,
      event.bidRevision ? event.bidRevision.label : null
    ].filter(Boolean) as string[]
  }));

  return [...activityEvents, ...negotiationEvents, ...valuationEvents]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, 20);
}
