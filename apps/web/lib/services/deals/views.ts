/**
 * Read-only view builders for the deals workspace.
 *
 * Extracted from lib/services/deals.ts per the deferred-refactor note in
 * CLAUDE.md. Six pure builders + their supporting types and two private
 * helpers form a tightly-coupled cluster: they all consume the same
 * DealDetailRecord / Awaited<getDealById> shape and are only consumed
 * by the admin /admin/deals views, so they belong in their own module.
 *
 * Public surface:
 *   - DealDataCoverage / DealClosingReadiness / DealCloseProbability /
 *     DealCloseProbabilityHistoryPoint types.
 *   - buildDealExecutionSnapshot, buildDealDataCoverage,
 *     buildDealClosingReadiness, buildDealCloseProbability,
 *     buildDealOriginationProfile, buildDealCloseProbabilityHistory.
 *
 * Workpaper-related builders (buildDealDiligenceWorkpaper +
 * serializeDealDiligenceWorkpaperToMarkdown) and their workpaper-specific
 * types stay in deals.ts for now — they have a separate dependency
 * surface (DiligenceWorkstreamLike) and the marginal extraction value is
 * lower.
 */
import {
  ActivityType,
  DealBidStatus,
  DealRequestStatus,
  DealStage,
  RelationshipCoverageStatus,
  RiskSeverity,
  TaskStatus
} from '@prisma/client';
import { toSentenceCase } from '@/lib/utils';
import { buildDealDiligenceSummary } from './diligence-summary';
import { buildDealStageChecklist, buildDealStageSummary, getStageIndex } from './stage';
import type { DealDetailRecord, DealListRecord, getDealById } from '../deals';
import { getDealMaterialUpdatedAt } from '../deals';

function maxDate(left: Date | null, right: Date | null) {
  if (!left) return right;
  if (!right) return left;
  return left.getTime() >= right.getTime() ? left : right;
}

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
function getPendingSuggestedSnapshotCount(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object') return 0;
  const rawValue = (snapshot as Record<string, unknown>).pendingSuggestedRequestCount;
  return typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : 0;
}

function formatProbabilitySnapshotReason(reason: string) {
  return reason.replaceAll('_', ' ');
}

function getDealProbabilityObservedAt(deal: DealDetailRecord) {
  return (
    maxDate(getDealMaterialUpdatedAt(deal), deal.asset?.valuations[0]?.createdAt ?? null) ??
    deal.updatedAt
  );
}

export function buildDealExecutionSnapshot(deal: Awaited<ReturnType<typeof getDealById>>) {
  if (!deal) return null;

  const now = Date.now();
  const openTasks = deal.tasks.filter((task) => task.status !== TaskStatus.DONE);
  const urgentTasks = openTasks.filter(
    (task) => task.priority === 'URGENT' || task.priority === 'HIGH'
  );
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
  const nextTask =
    [...openTasks].sort((left, right) => {
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
  const fulfilledRequestCount = deal.documentRequests.filter(
    (request) => request.status === DealRequestStatus.RECEIVED
  ).length;
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
      detail: deal.asset
        ? 'The deal is anchored to a tracked asset record.'
        : 'Link the deal to an asset before execution deepens.'
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
      detail:
        documentCount > 0
          ? `${documentCount} linked documents are available.`
          : 'No linked diligence files are visible yet.'
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
      status:
        getStageIndex(deal.stage) >= getStageIndex(DealStage.LOI) && bidRevisionCount === 0
          ? 'missing'
          : 'done',
      detail:
        bidRevisionCount > 0
          ? `${bidRevisionCount} bid revision${bidRevisionCount === 1 ? '' : 's'} captured.`
          : 'Log the first executable bid before moving deeper in the process.'
    },
    {
      key: 'lender-process',
      title: 'Financing quotes tracked',
      status:
        getStageIndex(deal.stage) >= getStageIndex(DealStage.IC) && lenderQuoteCount === 0
          ? 'missing'
          : 'done',
      detail:
        lenderQuoteCount > 0
          ? `${lenderQuoteCount} lender quote${lenderQuoteCount === 1 ? '' : 's'} captured.`
          : 'No structured lender quote or term sheet tracked yet.'
    },
    {
      key: 'negotiation-events',
      title: 'Counter and feedback log',
      status:
        getStageIndex(deal.stage) >= getStageIndex(DealStage.LOI) && negotiationEventCount === 0
          ? 'missing'
          : 'done',
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
    deal.bidRevisions.find((bid) => bid.status === DealBidStatus.ACCEPTED) ??
    deal.bidRevisions[0] ??
    null;
  const approvedLenderQuote =
    deal.lenderQuotes.find(
      (quote) => quote.status === 'CREDIT_APPROVED' || quote.status === 'CLOSED'
    ) ?? null;
  const hasLiveExclusivity = !!snapshot?.activeExclusivityEvent;
  const totalRequestCount = deal.documentRequests.length;
  const clearedRequestCount = deal.documentRequests.filter(
    (request) =>
      request.status === DealRequestStatus.RECEIVED || request.status === DealRequestStatus.WAIVED
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
      status: approvedLenderQuote
        ? 'done'
        : stageIndex >= getStageIndex(DealStage.IC)
          ? 'missing'
          : 'open',
      detail: approvedLenderQuote
        ? `${approvedLenderQuote.facilityLabel} is ${approvedLenderQuote.status.toLowerCase()}.`
        : 'No approved lender quote or closed financing is logged.',
      isBlocker: true
    },
    {
      key: 'live-exclusivity',
      title: 'Live exclusivity clock',
      status: hasLiveExclusivity
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
      status: !latestValuation
        ? 'missing'
        : valuationFreshnessDays !== null && valuationFreshnessDays <= 30
          ? 'done'
          : 'open',
      detail: latestValuation
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
      detail: snapshot
        ? `${snapshot.completedChecklistCount} of ${snapshot.requiredChecklistCount} required items are complete.`
        : 'Stage checklist has not been evaluated.',
      isBlocker: true
    },
    {
      key: 'execution-contacts',
      title: 'Execution counterparties assigned',
      status: hasExecutionContacts
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
  const blockers = checks
    .filter((check) => check.isBlocker && check.status !== 'done')
    .map((check) => check.title);

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
  const staleExecution =
    Date.now() - getDealMaterialUpdatedAt(deal).getTime() > 1000 * 60 * 60 * 24 * 7;
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

export function formatEnumLabel(value: string | null | undefined) {
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
  const hasSellerCoverage = roles.some(
    (role) => role === 'BROKER' || role === 'SELLER' || role === 'OWNER'
  );
  const hasLenderCoverage = roles.some((role) => role === 'LENDER');
  const primaryCoverage = counterparties.filter(
    (counterparty) => counterparty.coverageStatus === RelationshipCoverageStatus.PRIMARY
  );
  const recentContacts = counterparties.filter((counterparty) => {
    if (!counterparty.lastContactAt) return false;
    return Date.now() - counterparty.lastContactAt.getTime() <= 1000 * 60 * 60 * 24 * 21;
  });
  const latestRecentContact =
    [...counterparties]
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
    (bid) =>
      bid.status === DealBidStatus.SUBMITTED ||
      bid.status === DealBidStatus.COUNTERED ||
      bid.status === DealBidStatus.BAFO
  );
  const researchSnapshots = deal.asset?.researchSnapshots ?? [];
  const coverageTasks = deal.asset?.coverageTasks ?? [];
  const freshResearchCount = researchSnapshots.filter(
    (item) => item.freshnessStatus === 'FRESH'
  ).length;
  const conflictOrStaleCoverage = coverageTasks.filter(
    (task) => task.status !== TaskStatus.DONE
  ).length;
  const staleExecution =
    Date.now() - getDealMaterialUpdatedAt(deal).getTime() > 1000 * 60 * 60 * 24 * 7;
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
  score += hasLiveExclusivity
    ? 15
    : getStageIndex(deal.stage) >= getStageIndex(DealStage.LOI)
      ? -10
      : 0;
  score += hasAcceptedBid ? 8 : hasLiveBid ? 4 : 0;
  score += freshResearchCount > 0 ? 8 : 0;
  score -= Math.min(conflictOrStaleCoverage * 2, 10);
  score -= Math.min(openRiskCount * 3, 12);
  score -= staleExecution ? 8 : 0;
  score -= deal.nextAction ? 0 : 5;
  score = Math.max(5, Math.min(98, score));

  const band: DealOriginationProfile['band'] =
    score >= 75 ? 'HIGH' : score >= 50 ? 'MEDIUM' : 'LOW';
  const strengths = [
    sourceSet ? `Source path is tagged as ${formatEnumLabel(deal.originationSource)}.` : null,
    primaryCoverage.length > 0
      ? `${primaryCoverage.length} primary relationship owner${primaryCoverage.length === 1 ? '' : 's'} are assigned.`
      : null,
    recentContacts.length > 0
      ? `${recentContacts.length} counterparty touchpoint${recentContacts.length === 1 ? '' : 's'} were logged in the last 21 days.`
      : null,
    hasLiveExclusivity ? 'Live exclusivity is protecting the pursuit.' : null,
    hasAcceptedBid
      ? 'Accepted paper is already in the process.'
      : hasLiveBid
        ? 'A live bid is already in market.'
        : null,
    freshResearchCount > 0
      ? `${freshResearchCount} fresh research snapshot${freshResearchCount === 1 ? '' : 's'} support the process.`
      : null
  ].filter((item): item is string => !!item);
  const blockers = [
    !hasSellerCoverage ? 'No broker, seller, or owner-side relationship is logged.' : null,
    primaryCoverage.length === 0 ? 'No primary relationship owner is assigned.' : null,
    recentContacts.length === 0 ? 'No recent counterparty touchpoint is logged.' : null,
    !hasLiveExclusivity && getStageIndex(deal.stage) >= getStageIndex(DealStage.LOI)
      ? 'LOI-stage or deeper process has no live exclusivity clock.'
      : null,
    conflictOrStaleCoverage > 0
      ? `${conflictOrStaleCoverage} research blocker${conflictOrStaleCoverage === 1 ? '' : 's'} still sit open.`
      : null,
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
      (task) =>
        task.status !== TaskStatus.DONE && task.dueDate && task.dueDate.getTime() < Date.now()
    ).length,
    pendingSuggestedRequestCount: deal.documentRequests.filter(
      (request) =>
        request.status === DealRequestStatus.REQUESTED &&
        request.documentId == null &&
        (request.matchSuggestion ?? null) != null
    ).length,
    flags: [
      deal.bidRevisions.some((bid) => bid.status === DealBidStatus.ACCEPTED)
        ? 'accepted bid'
        : null,
      deal.lenderQuotes.some(
        (quote) => quote.status === 'CREDIT_APPROVED' || quote.status === 'CLOSED'
      )
        ? 'approved financing'
        : null,
      deal.negotiationEvents.some(
        (event) =>
          (event.eventType === 'EXCLUSIVITY_GRANTED' ||
            event.eventType === 'EXCLUSIVITY_EXTENDED') &&
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
        ? `pending DD suggestions (${
            deal.documentRequests.filter(
              (request) =>
                request.status === DealRequestStatus.REQUESTED &&
                request.documentId == null &&
                (request.matchSuggestion ?? null) != null
            ).length
          })`
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

