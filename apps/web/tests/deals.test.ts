import assert from 'node:assert/strict';
import test from 'node:test';
import { ActivityType, AssetClass, DealBidStatus, DealDiligenceWorkstreamStatus, DealDiligenceWorkstreamType, DealLossReason, DealOriginationSource, DealRequestStatus, DealStage, RelationshipCoverageStatus, RiskSeverity, TaskPriority, TaskStatus } from '@prisma/client';
import {
  autoMatchDealDocumentRequestsForAsset,
  archiveDeal,
  buildDealCloseProbability,
  buildDealCloseProbabilityHistory,
  buildDealClosingReadiness,
  buildDealDiligenceSummary,
  buildDealDiligenceWorkpaper,
  attachDealDiligenceDeliverable,
  createDealBidRevision,
  buildDealOriginationProfile,
  createDealDocumentRequest,
  upsertDealDiligenceWorkstream,
  createDealLenderQuote,
  createDealNegotiationEvent,
  buildDealDataCoverage,
  buildDealExecutionSnapshot,
  buildDealStageChecklist,
  buildDealStageSummary,
  buildDealTimeline,
  closeOutDeal,
  restoreDeal,
  seedDealStageChecklist,
  serializeDealDiligenceWorkpaperToMarkdown,
  updateDealDiligenceWorkstream,
  updateDealCounterparty,
  updateDealBidRevision,
  updateDealDocumentRequest,
  updateDealLenderQuote,
  updateDealNegotiationEvent,
  updateDealStage
} from '@/lib/services/deals';
import {
  buildDealCloseProbabilitySummary,
  buildDealPipelineSummary,
  buildDealReminderSummary
} from '@/lib/services/dashboard';

test('buildDealStageSummary marks completed current and upcoming stages', () => {
  const summary = buildDealStageSummary(DealStage.DD);
  assert.equal(summary.find((item) => item.value === DealStage.SOURCED)?.isCompleted, true);
  assert.equal(summary.find((item) => item.value === DealStage.DD)?.isCurrent, true);
  assert.equal(summary.find((item) => item.value === DealStage.CLOSING)?.isUpcoming, true);
});

test('buildDealExecutionSnapshot surfaces next task and grouped notes', () => {
  const now = new Date();
  const laterToday = new Date(now.getTime() + 1000 * 60 * 60 * 6);
  const tomorrow = new Date(now.getTime() + 1000 * 60 * 60 * 24);
  const snapshot = buildDealExecutionSnapshot({
    id: 'deal_1',
    dealCode: 'DEAL-0001',
    slug: 'deal-0001',
    title: 'Test Deal',
    stage: DealStage.DD,
    market: 'KR',
    city: 'Seoul',
    country: 'KR',
    assetClass: null,
    strategy: null,
    headline: null,
    nextAction: 'Finish lender diligence',
    nextActionAt: now,
    targetCloseDate: now,
    sellerGuidanceKrw: null,
    bidGuidanceKrw: null,
    purchasePriceKrw: null,
    statusLabel: 'ACTIVE',
    archivedAt: null,
    closedAt: null,
    closeOutcome: null,
    closeSummary: null,
    dealLead: 'solo_operator',
    assetId: null,
    createdAt: now,
    updatedAt: now,
    asset: null,
    counterparties: [
      {
        id: 'cp_1',
        assetId: null,
        dealId: 'deal_1',
        name: 'Test Broker',
        role: 'BROKER',
        shortName: null,
        company: null,
        email: null,
        phone: null,
        notes: null,
        createdAt: now,
        updatedAt: now
      }
    ],
    tasks: [
      {
        id: 'task_1',
        dealId: 'deal_1',
        title: 'Review title',
        description: null,
        status: TaskStatus.OPEN,
        priority: TaskPriority.HIGH,
        ownerLabel: 'solo_operator',
        checklistKey: 'dd::review-title',
        isRequired: true,
        dueDate: tomorrow,
        completedAt: null,
        sortOrder: 2,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'task_2',
        dealId: 'deal_1',
        title: 'Call broker',
        description: null,
        status: TaskStatus.OPEN,
        priority: TaskPriority.MEDIUM,
        ownerLabel: 'solo_operator',
        checklistKey: 'dd::call-broker',
        isRequired: false,
        dueDate: laterToday,
        completedAt: null,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now
      }
    ],
    riskFlags: [
      {
        id: 'risk_1',
        dealId: 'deal_1',
        title: 'Open blocker',
        detail: null,
        severity: RiskSeverity.HIGH,
        statusLabel: 'OPEN',
        isResolved: false,
        resolvedAt: null,
        createdAt: now,
        updatedAt: now
      }
    ],
    negotiationEvents: [],
    activityLogs: [
      {
        id: 'act_1',
        dealId: 'deal_1',
        counterpartyId: 'cp_1',
        activityType: ActivityType.NOTE,
        title: 'Broker note',
        body: 'Seller wants fast certainty.',
        stageFrom: null,
        stageTo: null,
        metadata: null,
        createdByLabel: 'solo_operator',
        createdAt: now,
        updatedAt: now,
        counterparty: {
          id: 'cp_1',
          assetId: null,
          dealId: 'deal_1',
          name: 'Test Broker',
          role: 'BROKER',
          shortName: null,
          company: null,
          email: null,
          phone: null,
          notes: null,
          createdAt: now,
          updatedAt: now
        }
      }
    ]
  } as any);

  assert.equal(snapshot?.nextTask?.title, 'Call broker');
  assert.equal(snapshot?.openRiskCount, 1);
  assert.equal(snapshot?.notesByRole.find((group) => group.role === 'BROKER')?.notes.length, 1);
  assert.equal(snapshot?.requiredChecklistCount, 2);
  assert.equal(snapshot?.completedChecklistCount, 0);
  assert.equal(snapshot?.dueSoonTaskCount, 2);
});

test('buildDealDataCoverage surfaces missing execution evidence', () => {
  const now = new Date();
  const deal = {
    id: 'deal_1',
    dealCode: 'DEAL-0001',
    slug: 'deal-0001',
    title: 'Coverage deal',
    stage: DealStage.LOI,
    market: 'KR',
    city: 'Seoul',
    country: 'KR',
    assetClass: null,
    strategy: null,
    headline: null,
    nextAction: 'Submit LOI',
    nextActionAt: now,
    targetCloseDate: now,
    sellerGuidanceKrw: null,
    bidGuidanceKrw: null,
    purchasePriceKrw: null,
    statusLabel: 'ACTIVE',
    archivedAt: null,
    closedAt: null,
    closeOutcome: null,
    closeSummary: null,
    dealLead: 'solo_operator',
    assetId: null,
    createdAt: now,
    updatedAt: now,
    counterparties: [],
    documentRequests: [],
    bidRevisions: [],
    lenderQuotes: [],
    negotiationEvents: [],
    tasks: [],
    riskFlags: [],
    activityLogs: [],
    asset: null
  } as any;

  const coverage = buildDealDataCoverage(deal, null);

  assert.equal(coverage.evidence.linkedAsset, false);
  assert.ok(coverage.gaps.includes('Linked asset record'));
  assert.ok(coverage.gaps.includes('Commercial pricing guardrails'));
});

test('buildDealClosingReadiness scores accepted bid, financing, and exclusivity gates', () => {
  const now = new Date('2026-03-28T12:00:00.000Z');
  const snapshot = {
    stageTrack: [],
    stageChecklist: [],
    requiredChecklistCount: 4,
    completedChecklistCount: 4,
    checklistCompletionPct: 100,
    openTaskCount: 0,
    urgentTaskCount: 0,
    overdueTaskCount: 0,
    dueSoonTaskCount: 0,
    openRiskCount: 0,
    activeExclusivityEvent: {
      id: 'neg_1',
      expiresAt: new Date('2026-04-05T00:00:00.000Z')
    },
    exclusivityExpiresSoon: false,
    nextTask: null,
    reminderSummary: 'No open tasks right now.',
    notesByRole: []
  } as any;

  const readiness = buildDealClosingReadiness(
    {
      id: 'deal_1',
      dealCode: 'DEAL-0001',
      slug: 'deal-0001',
      title: 'Closeable deal',
      stage: DealStage.CLOSING,
      market: 'KR',
      city: 'Seoul',
      country: 'KR',
      assetClass: null,
      strategy: null,
      headline: null,
      nextAction: 'Close docs',
      nextActionAt: now,
      targetCloseDate: now,
      sellerGuidanceKrw: 120_000_000_000,
      bidGuidanceKrw: 118_000_000_000,
      purchasePriceKrw: 118_000_000_000,
      statusLabel: 'ACTIVE',
      archivedAt: null,
      closedAt: null,
      closeOutcome: null,
      closeSummary: null,
      dealLead: 'solo_operator',
      assetId: 'asset_1',
      createdAt: now,
      updatedAt: now,
      counterparties: [
        { id: 'cp_1', role: 'LENDER' },
        { id: 'cp_2', role: 'BUYER' }
      ],
      documentRequests: [
        { id: 'req_1', status: 'RECEIVED' },
        { id: 'req_2', status: 'WAIVED' }
      ],
      bidRevisions: [
        { id: 'bid_1', label: 'Signed LOI', status: 'ACCEPTED' }
      ],
      lenderQuotes: [
        { id: 'lender_1', facilityLabel: 'Senior facility', status: 'CREDIT_APPROVED' }
      ],
      negotiationEvents: [
        { id: 'neg_1', eventType: 'EXCLUSIVITY_GRANTED', expiresAt: new Date('2026-04-05T00:00:00.000Z') }
      ],
      diligenceWorkstreams: [
        {
          id: 'dd_legal',
          workstreamType: DealDiligenceWorkstreamType.LEGAL,
          status: DealDiligenceWorkstreamStatus.SIGNED_OFF,
          deliverables: [{ id: 'deliverable_legal' }]
        },
        {
          id: 'dd_commercial',
          workstreamType: DealDiligenceWorkstreamType.COMMERCIAL,
          status: DealDiligenceWorkstreamStatus.SIGNED_OFF,
          deliverables: [{ id: 'deliverable_commercial' }]
        },
        {
          id: 'dd_technical',
          workstreamType: DealDiligenceWorkstreamType.TECHNICAL,
          status: DealDiligenceWorkstreamStatus.SIGNED_OFF,
          deliverables: [{ id: 'deliverable_technical' }]
        }
      ],
      asset: {
        valuations: [
          {
            id: 'val_1',
            createdAt: new Date('2026-03-20T00:00:00.000Z')
          }
        ]
      }
    } as any,
    snapshot
  );

  assert.equal(readiness.readyToClose, true);
  assert.equal(readiness.blockerCount, 0);
  assert.ok(readiness.scorePct >= 95);
});

test('buildDealCloseProbability drops when financing and exclusivity are missing', () => {
  const now = new Date('2026-03-28T12:00:00.000Z');
  const snapshot = {
    stageTrack: [],
    stageChecklist: [],
    requiredChecklistCount: 4,
    completedChecklistCount: 2,
    checklistCompletionPct: 50,
    openTaskCount: 3,
    urgentTaskCount: 1,
    overdueTaskCount: 2,
    dueSoonTaskCount: 1,
    openRiskCount: 2,
    activeExclusivityEvent: null,
    exclusivityExpiresSoon: false,
    nextTask: null,
    reminderSummary: '2 overdue tasks need attention.',
    notesByRole: []
  } as any;

  const readiness = buildDealClosingReadiness(
    {
      id: 'deal_1',
      dealCode: 'DEAL-0001',
      slug: 'deal-0001',
      title: 'Fragile close',
      stage: DealStage.CLOSING,
      market: 'KR',
      city: 'Seoul',
      country: 'KR',
      assetClass: null,
      strategy: null,
      headline: null,
      nextAction: null,
      nextActionAt: null,
      targetCloseDate: now,
      sellerGuidanceKrw: 120_000_000_000,
      bidGuidanceKrw: 118_000_000_000,
      purchasePriceKrw: 118_000_000_000,
      statusLabel: 'ACTIVE',
      archivedAt: null,
      closedAt: null,
      closeOutcome: null,
      closeSummary: null,
      dealLead: 'solo_operator',
      assetId: 'asset_1',
      createdAt: now,
      updatedAt: now,
      counterparties: [{ id: 'cp_1', role: 'BUYER' }],
      documentRequests: [{ id: 'req_1', status: 'REQUESTED' }],
      bidRevisions: [{ id: 'bid_1', label: 'Countered LOI', status: 'COUNTERED' }],
      lenderQuotes: [],
      negotiationEvents: [{ id: 'neg_1', eventType: 'SELLER_COUNTER', effectiveAt: now }],
      riskFlags: [
        { id: 'risk_1', severity: RiskSeverity.CRITICAL, isResolved: false },
        { id: 'risk_2', severity: RiskSeverity.HIGH, isResolved: false }
      ],
      asset: {
        valuations: [
          {
            id: 'val_1',
            createdAt: new Date('2026-01-20T00:00:00.000Z')
          }
        ]
      }
    } as any,
    snapshot
  );

  const probability = buildDealCloseProbability(
    {
      id: 'deal_1',
      dealCode: 'DEAL-0001',
      slug: 'deal-0001',
      title: 'Fragile close',
      stage: DealStage.CLOSING,
      market: 'KR',
      city: 'Seoul',
      country: 'KR',
      assetClass: null,
      strategy: null,
      headline: null,
      nextAction: null,
      nextActionAt: null,
      targetCloseDate: now,
      sellerGuidanceKrw: 120_000_000_000,
      bidGuidanceKrw: 118_000_000_000,
      purchasePriceKrw: 118_000_000_000,
      statusLabel: 'ACTIVE',
      archivedAt: null,
      closedAt: null,
      closeOutcome: null,
      closeSummary: null,
      dealLead: 'solo_operator',
      assetId: 'asset_1',
      createdAt: now,
      updatedAt: now,
      counterparties: [{ id: 'cp_1', role: 'BUYER' }],
      documentRequests: [{ id: 'req_1', status: 'REQUESTED' }],
      bidRevisions: [{ id: 'bid_1', label: 'Countered LOI', status: 'COUNTERED' }],
      lenderQuotes: [],
      negotiationEvents: [{ id: 'neg_1', eventType: 'SELLER_COUNTER', effectiveAt: now }],
      riskFlags: [
        { id: 'risk_1', severity: RiskSeverity.CRITICAL, isResolved: false },
        { id: 'risk_2', severity: RiskSeverity.HIGH, isResolved: false }
      ],
      asset: {
        valuations: [
          {
            id: 'val_1',
            createdAt: new Date('2026-01-20T00:00:00.000Z')
          }
        ]
      }
    } as any,
    snapshot,
    readiness
  );

  assert.equal(probability.band, 'LOW');
  assert.ok(probability.scorePct < 50);
});

test('buildDealCloseProbability treats unconfirmed DD suggestions as execution drag', () => {
  const now = new Date('2026-03-28T12:00:00.000Z');
  const baseDeal = {
    id: 'deal_1',
    dealCode: 'DEAL-0001',
    slug: 'deal-0001',
    title: 'DD suggestions pending',
    stage: DealStage.DD,
    market: 'KR',
    city: 'Seoul',
    country: 'KR',
    assetClass: null,
    strategy: null,
    headline: null,
    nextAction: 'Confirm DD package',
    nextActionAt: now,
    targetCloseDate: now,
    sellerGuidanceKrw: null,
    bidGuidanceKrw: null,
    purchasePriceKrw: null,
    statusLabel: 'ACTIVE',
    archivedAt: null,
    closedAt: null,
    closeOutcome: null,
    closeSummary: null,
    dealLead: 'solo_operator',
    assetId: 'asset_1',
    createdAt: now,
    updatedAt: now,
    counterparties: [],
    bidRevisions: [],
    lenderQuotes: [],
    negotiationEvents: [],
    riskFlags: [],
    tasks: [],
    asset: { valuations: [] }
  } as any;

  const cleanProbability = buildDealCloseProbability(
    {
      ...baseDeal,
      documentRequests: [{ id: 'req_1', status: DealRequestStatus.REQUESTED, documentId: null, matchSuggestion: null }]
    },
    {
      stageTrack: [],
      stageChecklist: [],
      requiredChecklistCount: 1,
      completedChecklistCount: 0,
      checklistCompletionPct: 0,
      openTaskCount: 0,
      urgentTaskCount: 0,
      overdueTaskCount: 0,
      dueSoonTaskCount: 0,
      openRiskCount: 0,
      suggestedRequestCount: 0,
      activeExclusivityEvent: null,
      exclusivityExpiresSoon: false,
      nextTask: null,
      reminderSummary: 'No open tasks right now.',
      notesByRole: []
    } as any
  );

  const suggestedProbability = buildDealCloseProbability(
    {
      ...baseDeal,
      documentRequests: [
        {
          id: 'req_1',
          status: DealRequestStatus.REQUESTED,
          documentId: null,
          matchSuggestion: { documentId: 'doc_1', documentTitle: 'Environmental update', score: 5 }
        }
      ]
    },
    {
      stageTrack: [],
      stageChecklist: [],
      requiredChecklistCount: 1,
      completedChecklistCount: 0,
      checklistCompletionPct: 0,
      openTaskCount: 0,
      urgentTaskCount: 0,
      overdueTaskCount: 0,
      dueSoonTaskCount: 0,
      openRiskCount: 0,
      suggestedRequestCount: 1,
      activeExclusivityEvent: null,
      exclusivityExpiresSoon: false,
      nextTask: null,
      reminderSummary: '1 DD request suggestion still needs operator confirmation.',
      notesByRole: []
    } as any
  );

  assert.ok(suggestedProbability.scorePct < cleanProbability.scorePct);
  assert.ok(
    suggestedProbability.drivers.some((driver) => driver.includes('DD suggestion'))
  );
});

test('buildDealOriginationProfile rewards direct sourcing, primary coverage, and live exclusivity', () => {
  const now = new Date('2026-04-08T00:00:00.000Z');
  const profile = buildDealOriginationProfile(
    {
      id: 'deal_1',
      dealCode: 'DEAL-0001',
      slug: 'deal-0001',
      title: 'Origination strong',
      stage: DealStage.DD,
      market: 'KR',
      city: 'Seoul',
      country: 'KR',
      assetClass: null,
      strategy: null,
      headline: null,
      nextAction: 'Advance exclusivity mark-up',
      nextActionAt: now,
      targetCloseDate: now,
      sellerGuidanceKrw: null,
      bidGuidanceKrw: null,
      purchasePriceKrw: null,
      originationSource: DealOriginationSource.DIRECT_OWNER,
      originSummary: 'Relationship-led recapitalization.',
      statusLabel: 'ACTIVE',
      archivedAt: null,
      closedAt: null,
      closeOutcome: null,
      lossReason: null,
      closeSummary: null,
      dealLead: 'solo_operator',
      assetId: 'asset_1',
      createdAt: now,
      updatedAt: now,
      counterparties: [
        {
          id: 'cp_1',
          name: 'Owner CFO',
          role: 'OWNER',
          coverageOwner: 'han',
          coverageStatus: RelationshipCoverageStatus.PRIMARY,
          lastContactAt: new Date('2026-04-05T00:00:00.000Z')
        },
        {
          id: 'cp_2',
          name: 'Lead lender',
          role: 'LENDER',
          coverageOwner: 'lee',
          coverageStatus: RelationshipCoverageStatus.PRIMARY,
          lastContactAt: new Date('2026-04-04T00:00:00.000Z')
        }
      ],
      tasks: [],
      riskFlags: [],
      documentRequests: [],
      bidRevisions: [{ id: 'bid_1', status: 'SUBMITTED' }],
      lenderQuotes: [],
      negotiationEvents: [
        {
          id: 'neg_1',
          eventType: 'EXCLUSIVITY_GRANTED',
          expiresAt: new Date('2026-04-15T00:00:00.000Z'),
          effectiveAt: new Date('2026-04-01T00:00:00.000Z')
        }
      ],
      activityLogs: [],
      asset: {
        valuations: [],
        researchSnapshots: [{ freshnessStatus: 'FRESH' }],
        coverageTasks: []
      }
    } as any,
    null
  );

  assert.equal(profile.band, 'HIGH');
  assert.ok(profile.scorePct >= 75);
  assert.equal(profile.sourceLabel, 'Direct Owner');
  assert.ok(profile.exclusivityLabel.startsWith('Live'));
});

test('createDealBidRevision logs structured negotiation history', async () => {
  const fakeDb = {
    deal: {
      async findUnique() {
        return { id: 'deal_1' };
      }
    },
    dealBidRevision: {
      async create(args: any) {
        return {
          id: 'bid_1',
          submittedAt: args.data.submittedAt ?? null,
          counterparty: null,
          ...args.data
        };
      }
    },
    activityLog: {
      async create() {
        return null;
      }
    }
  };

  const bidRevision = await createDealBidRevision(
    'deal_1',
    { label: 'Initial LOI', bidPriceKrw: 120_000_000_000, status: 'SUBMITTED' },
    fakeDb as any
  );

  assert.equal(bidRevision.label, 'Initial LOI');
  assert.equal(bidRevision.status, 'SUBMITTED');
  assert.equal(bidRevision.bidPriceKrw, 120_000_000_000);
});

test('updateDealBidRevision advances negotiation status', async () => {
  let updatedData: any;
  const fakeDb = {
    dealBidRevision: {
      async findFirst() {
        return {
          id: 'bid_1',
          dealId: 'deal_1',
          label: 'Initial LOI',
          status: 'SUBMITTED',
          bidPriceKrw: 120_000_000_000,
          submittedAt: new Date('2026-03-25T00:00:00.000Z')
        };
      },
      async update(args: any) {
        updatedData = args.data;
        return {
          id: 'bid_1',
          counterparty: null,
          ...args.data
        };
      }
    },
    activityLog: {
      async create() {
        return null;
      }
    }
  };

  await updateDealBidRevision('deal_1', 'bid_1', { status: 'BAFO' }, fakeDb as any);
  assert.equal(updatedData.status, 'BAFO');
});

test('createDealLenderQuote logs structured financing coverage', async () => {
  const fakeDb = {
    deal: {
      async findUnique() {
        return { id: 'deal_1' };
      }
    },
    dealLenderQuote: {
      async create(args: any) {
        return {
          id: 'lender_1',
          quotedAt: args.data.quotedAt ?? null,
          counterparty: null,
          ...args.data
        };
      }
    },
    activityLog: {
      async create() {
        return null;
      }
    }
  };

  const lenderQuote = await createDealLenderQuote(
    'deal_1',
    { facilityLabel: 'Senior term sheet', amountKrw: 80_000_000_000, status: 'TERM_SHEET' },
    fakeDb as any
  );

  assert.equal(lenderQuote.facilityLabel, 'Senior term sheet');
  assert.equal(lenderQuote.status, 'TERM_SHEET');
  assert.equal(lenderQuote.amountKrw, 80_000_000_000);
});

test('updateDealLenderQuote advances financing status', async () => {
  let updatedData: any;
  const fakeDb = {
    dealLenderQuote: {
      async findFirst() {
        return {
          id: 'lender_1',
          dealId: 'deal_1',
          facilityLabel: 'Senior term sheet',
          status: 'TERM_SHEET',
          amountKrw: 80_000_000_000,
          quotedAt: new Date('2026-03-25T00:00:00.000Z')
        };
      },
      async update(args: any) {
        updatedData = args.data;
        return {
          id: 'lender_1',
          counterparty: null,
          ...args.data
        };
      }
    },
    activityLog: {
      async create() {
        return null;
      }
    }
  };

  await updateDealLenderQuote('deal_1', 'lender_1', { status: 'CREDIT_APPROVED' }, fakeDb as any);
  assert.equal(updatedData.status, 'CREDIT_APPROVED');
});

test('createDealNegotiationEvent logs seller counter or exclusivity state', async () => {
  const fakeDb = {
    deal: {
      async findUnique() {
        return { id: 'deal_1' };
      }
    },
    dealNegotiationEvent: {
      async create(args: any) {
        return {
          id: 'neg_1',
          counterparty: null,
          bidRevision: null,
          ...args.data
        };
      }
    },
    activityLog: {
      async create() {
        return null;
      }
    }
  };

  const negotiationEvent = await createDealNegotiationEvent(
    'deal_1',
    {
      eventType: 'EXCLUSIVITY_GRANTED',
      title: 'Exclusivity granted',
      effectiveAt: '2026-03-25',
      expiresAt: '2026-03-30'
    },
    fakeDb as any
  );

  assert.equal(negotiationEvent.eventType, 'EXCLUSIVITY_GRANTED');
  assert.equal(negotiationEvent.title, 'Exclusivity granted');
});

test('updateDealNegotiationEvent extends exclusivity clock', async () => {
  let updatedData: any;
  const fakeDb = {
    dealNegotiationEvent: {
      async findFirst() {
        return {
          id: 'neg_1',
          dealId: 'deal_1',
          eventType: 'EXCLUSIVITY_GRANTED',
          title: 'Exclusivity granted',
          effectiveAt: new Date('2026-03-25T00:00:00.000Z'),
          expiresAt: new Date('2026-03-30T00:00:00.000Z')
        };
      },
      async update(args: any) {
        updatedData = args.data;
        return {
          id: 'neg_1',
          counterparty: null,
          bidRevision: null,
          ...args.data
        };
      }
    },
    activityLog: {
      async create() {
        return null;
      }
    }
  };

  await updateDealNegotiationEvent(
    'deal_1',
    'neg_1',
    { eventType: 'EXCLUSIVITY_EXTENDED', expiresAt: '2026-04-06' },
    fakeDb as any
  );
  assert.equal(updatedData.eventType, 'EXCLUSIVITY_EXTENDED');
});

test('createDealDocumentRequest logs a diligence request', async () => {
  const now = new Date();
  const fakeDb = {
    deal: {
      async findUnique() {
        return { id: 'deal_1', assetId: null };
      }
    },
    dealDocumentRequest: {
      async create(args: any) {
        return {
          id: 'req_1',
          ...args.data,
          status: args.data.status ?? 'REQUESTED',
          priority: args.data.priority ?? TaskPriority.MEDIUM,
          requestedAt: args.data.requestedAt ?? now,
          receivedAt: args.data.receivedAt ?? null,
          counterparty: null,
          document: null
        };
      }
    },
    activityLog: {
      async create() {
        return null;
      }
    }
  };

  const request = await createDealDocumentRequest(
    'deal_1',
    { title: 'Request title report', priority: 'HIGH' },
    fakeDb as any
  );

  assert.equal(request.title, 'Request title report');
  assert.equal(request.status, 'REQUESTED');
});

test('updateDealDocumentRequest marks a request received', async () => {
  const now = new Date();
  let updatedData: any;
  const fakeDb = {
    dealDocumentRequest: {
      async findFirst() {
        return {
          id: 'req_1',
          dealId: 'deal_1',
          title: 'Request title report',
          status: 'REQUESTED',
          receivedAt: null
        };
      },
      async update(args: any) {
        updatedData = args.data;
        return {
          id: 'req_1',
          title: 'Request title report',
          counterpartyId: null,
          document: null,
          counterparty: null,
          ...args.data
        };
      }
    },
    activityLog: {
      async create() {
        return null;
      }
    }
  };

  await updateDealDocumentRequest('deal_1', 'req_1', { status: 'RECEIVED' }, fakeDb as any);
  assert.equal(updatedData.status, 'RECEIVED');
  assert.ok(updatedData.receivedAt instanceof Date || typeof updatedData.receivedAt === 'object');
});

test('upsertDealDiligenceWorkstream creates or updates a specialist workstream', async () => {
  let upsertArgs: any;
  const fakeDb = {
    deal: {
      async findUnique() {
        return { id: 'deal_1' };
      }
    },
    dealDiligenceWorkstream: {
      async upsert(args: any) {
        upsertArgs = args;
        return {
          id: 'dd_1',
          dealId: 'deal_1',
          ...args.create
        };
      }
    },
    activityLog: {
      async create() {
        return null;
      }
    },
    dealExecutionProbabilitySnapshot: {
      async create() {
        return null;
      }
    }
  };

  const result = await upsertDealDiligenceWorkstream(
    'deal_1',
    {
      workstreamType: DealDiligenceWorkstreamType.LEGAL,
      status: DealDiligenceWorkstreamStatus.IN_PROGRESS,
      ownerLabel: 'legal lead',
      advisorName: 'Kim & Partners',
      reportTitle: 'Title and SPA review',
      summary: 'Title, encumbrance, and SPA markup under review.'
    },
    fakeDb as any
  );

  assert.equal(result.workstreamType, DealDiligenceWorkstreamType.LEGAL);
  assert.equal(upsertArgs.where.dealId_workstreamType.workstreamType, DealDiligenceWorkstreamType.LEGAL);
});

test('updateDealDiligenceWorkstream signs off a specialist lane cleanly', async () => {
  let updateArgs: any;
  const fakeDb = {
    dealDiligenceWorkstream: {
      async findFirst() {
        return {
          id: 'dd_1',
          dealId: 'deal_1',
          workstreamType: DealDiligenceWorkstreamType.TECHNICAL,
          status: DealDiligenceWorkstreamStatus.READY_FOR_SIGNOFF,
          signedOffAt: null,
          signedOffByLabel: null
        };
      },
      async update(args: any) {
        updateArgs = args;
        return {
          id: 'dd_1',
          dealId: 'deal_1',
          workstreamType: DealDiligenceWorkstreamType.TECHNICAL,
          ...args.data
        };
      }
    },
    activityLog: {
      async create() {
        return null;
      }
    },
    dealExecutionProbabilitySnapshot: {
      async create() {
        return null;
      }
    }
  };

  const updated = await updateDealDiligenceWorkstream(
    'deal_1',
    'dd_1',
    {
      status: DealDiligenceWorkstreamStatus.SIGNED_OFF,
      signedOffByLabel: 'chief engineer'
    },
    fakeDb as any
  );

  assert.equal(updated.status, DealDiligenceWorkstreamStatus.SIGNED_OFF);
  assert.equal(updateArgs.data.signedOffByLabel, 'chief engineer');
  assert.ok(updateArgs.data.signedOffAt instanceof Date);
});

test('attachDealDiligenceDeliverable links an asset document to a specialist lane', async () => {
  const activityTitles: string[] = [];
  const fakeDb = {
    dealDiligenceWorkstream: {
      async findFirst() {
        return {
          id: 'dd_1',
          dealId: 'deal_1',
          workstreamType: DealDiligenceWorkstreamType.LEGAL,
          deal: { assetId: 'asset_1' }
        };
      }
    },
    document: {
      async findFirst() {
        return {
          id: 'doc_1',
          title: 'Title Memo',
          documentType: 'REPORT',
          currentVersion: 2,
          documentHash: 'hash-title-memo',
          updatedAt: new Date('2026-04-10T00:00:00.000Z')
        };
      }
    },
    dealDiligenceDeliverable: {
      async upsert(args: any) {
        return {
          id: 'deliverable_1',
          note: args.create.note,
          document: {
            id: 'doc_1',
            title: 'Title Memo',
            documentType: 'REPORT',
            currentVersion: 2,
            documentHash: 'hash-title-memo',
            updatedAt: new Date('2026-04-10T00:00:00.000Z')
          }
        };
      }
    },
    activityLog: {
      async create(args: any) {
        activityTitles.push(args.data.title);
        return args.data;
      }
    },
    dealExecutionProbabilitySnapshot: {
      async create() {
        return {};
      }
    },
    deal: {
      async findUnique() {
        return {
          id: 'deal_1',
          stage: DealStage.DD,
          bidRevisions: [],
          lenderQuotes: [],
          negotiationEvents: [],
          documentRequests: [],
          counterparties: [],
          activityLogs: [],
          riskFlags: [],
          asset: null
        };
      }
    }
  } as any;

  const deliverable = await attachDealDiligenceDeliverable(
    'deal_1',
    'dd_1',
    {
      documentId: 'doc_1',
      note: 'Final title counsel memo'
    },
    fakeDb
  );

  assert.equal(deliverable.document.title, 'Title Memo');
  assert.equal(activityTitles.includes('Diligence deliverable linked'), true);
});

test('buildDealDiligenceSummary highlights missing and blocked specialist lanes', () => {
  const summary = buildDealDiligenceSummary(
    {
      assetClass: 'DATA_CENTER',
      asset: null
    } as any,
    [
      {
        id: 'dd_1',
        workstreamType: DealDiligenceWorkstreamType.LEGAL,
        status: DealDiligenceWorkstreamStatus.SIGNED_OFF,
        requestedAt: new Date('2026-03-10T00:00:00.000Z'),
        signedOffAt: new Date('2026-03-25T00:00:00.000Z')
      },
      {
        id: 'dd_2',
        workstreamType: DealDiligenceWorkstreamType.TECHNICAL,
        status: DealDiligenceWorkstreamStatus.BLOCKED,
        requestedAt: new Date('2026-03-15T00:00:00.000Z'),
        blockerSummary: 'M&E report delayed.'
      }
    ] as any
  );

  assert.equal(summary.blockedCount, 1);
  assert.ok(summary.missingCoreTypes.includes(DealDiligenceWorkstreamType.COMMERCIAL));
  assert.ok(summary.missingCoreTypes.includes(DealDiligenceWorkstreamType.ENVIRONMENTAL));
  assert.ok(summary.uncoveredCoreTypes.includes(DealDiligenceWorkstreamType.TECHNICAL));
});

test('buildDealDiligenceWorkpaper and markdown export summarize specialist sign-off cleanly', () => {
  const now = new Date('2026-04-10T00:00:00.000Z');
  const workpaper = buildDealDiligenceWorkpaper({
    id: 'deal_1',
    dealCode: 'DEAL-0001',
    slug: 'deal-0001',
    title: 'Yeouido Office Acquisition',
    stage: DealStage.IC,
    market: 'KR',
    city: 'Seoul',
    country: 'KR',
    assetClass: AssetClass.OFFICE,
    strategy: null,
    headline: null,
    nextAction: 'Prepare committee deck',
    nextActionAt: now,
    targetCloseDate: now,
    sellerGuidanceKrw: null,
    bidGuidanceKrw: null,
    purchasePriceKrw: null,
    statusLabel: 'ACTIVE',
    archivedAt: null,
    closedAt: null,
    closeOutcome: null,
    lossReason: null,
    closeSummary: null,
    dealLead: 'solo_operator',
    assetId: 'asset_1',
    createdAt: now,
    updatedAt: now,
    counterparties: [
      {
        id: 'cp_broker',
        role: 'BROKER',
        name: 'Prime Brokerage',
        coverageStatus: RelationshipCoverageStatus.PRIMARY,
        coverageOwner: 'coverage.lead',
        lastContactAt: now
      },
      { id: 'cp_lender', role: 'LENDER', name: 'Core Bank', coverageStatus: RelationshipCoverageStatus.BACKUP }
    ],
    tasks: [],
    riskFlags: [],
    negotiationEvents: [
      { id: 'neg_1', eventType: 'EXCLUSIVITY_GRANTED', expiresAt: new Date('2026-04-20T00:00:00.000Z') }
    ],
    bidRevisions: [{ id: 'bid_1', label: 'Signed LOI', status: DealBidStatus.ACCEPTED }],
    lenderQuotes: [{ id: 'loan_1', facilityLabel: 'Senior loan', status: 'CREDIT_APPROVED' }],
    activityLogs: [],
    probabilitySnapshots: [],
    documentRequests: [
      {
        id: 'req_1',
        title: 'Final lease abstracts',
        status: DealRequestStatus.REQUESTED,
        dueDate: new Date('2026-04-15T00:00:00.000Z'),
        notes: 'Waiting on seller counsel',
        counterparty: { name: 'Prime Brokerage' }
      }
    ],
    diligenceWorkstreams: [
      {
        id: 'dd_legal',
        workstreamType: DealDiligenceWorkstreamType.LEGAL,
        status: DealDiligenceWorkstreamStatus.SIGNED_OFF,
        ownerLabel: 'legal.lead',
        advisorName: 'Kim & Partners',
        reportTitle: 'Title memo',
        requestedAt: new Date('2026-03-15T00:00:00.000Z'),
        dueDate: new Date('2026-04-08T00:00:00.000Z'),
        signedOffAt: new Date('2026-04-08T00:00:00.000Z'),
        signedOffByLabel: 'gc.kim',
        summary: 'No title defects identified.',
        blockerSummary: null,
        deliverables: [
          {
            id: 'deliverable_legal',
            note: 'Final memo linked',
            document: {
              id: 'doc_1',
              title: 'Title Memo',
              documentType: 'REPORT',
              currentVersion: 2,
              documentHash: 'hash-title-memo',
              updatedAt: new Date('2026-04-08T00:00:00.000Z')
            }
          }
        ]
      },
      {
        id: 'dd_commercial',
        workstreamType: DealDiligenceWorkstreamType.COMMERCIAL,
        status: DealDiligenceWorkstreamStatus.READY_FOR_SIGNOFF,
        ownerLabel: 'am.lead',
        advisorName: null,
        reportTitle: 'Rent roll memo',
        requestedAt: new Date('2026-03-20T00:00:00.000Z'),
        dueDate: new Date('2026-04-11T00:00:00.000Z'),
        signedOffAt: null,
        signedOffByLabel: null,
        summary: 'Tenant rollover checked against approved lease file.',
        blockerSummary: null,
        deliverables: [
          {
            id: 'deliverable_commercial',
            note: null,
            document: {
              id: 'doc_2',
              title: 'Lease Abstract Book',
              documentType: 'LEASE',
              currentVersion: 3,
              documentHash: 'abcdef1234567890',
              updatedAt: new Date('2026-04-09T00:00:00.000Z')
            }
          }
        ]
      },
      {
        id: 'dd_technical',
        workstreamType: DealDiligenceWorkstreamType.TECHNICAL,
        status: DealDiligenceWorkstreamStatus.BLOCKED,
        ownerLabel: 'technical.pm',
        advisorName: 'Han Engineering',
        reportTitle: 'Building condition report',
        requestedAt: new Date('2026-03-25T00:00:00.000Z'),
        dueDate: new Date('2026-04-12T00:00:00.000Z'),
        signedOffAt: null,
        signedOffByLabel: null,
        summary: 'MEP scope is mostly complete.',
        blockerSummary: 'Awaiting rooftop chiller access.',
        deliverables: []
      }
    ],
    asset: {
      assetClass: AssetClass.OFFICE,
      documents: [
        {
          title: 'Lease Abstract Book',
          documentType: 'LEASE',
          currentVersion: 3,
          documentHash: 'abcdef1234567890'
        }
      ],
      valuations: [
        {
          id: 'val_1',
          createdAt: new Date('2026-04-09T00:00:00.000Z')
        }
      ]
    }
  } as any);

  const markdown = serializeDealDiligenceWorkpaperToMarkdown(workpaper);

  assert.equal(workpaper.summaryFacts.find((fact) => fact.label === 'Specialist Sign-Off')?.value, '1/3 core lanes signed off');
  assert.equal(workpaper.summaryFacts.find((fact) => fact.label === 'Deliverables')?.value, '2 linked / 1 core lanes without evidence');
  assert.match(markdown, /# Yeouido Office Acquisition DD Workpaper/);
  assert.match(markdown, /## Specialist Workstreams/);
  assert.match(markdown, /Legal: Signed Off/i);
  assert.match(markdown, /Awaiting rooftop chiller access\./);
  assert.match(markdown, /## Document Request Tracker/);
});

test('autoMatchDealDocumentRequestsForAsset links obvious DD matches on upload', async () => {
  const updatedIds: string[] = [];
  const fakeDb = {
    dealDocumentRequest: {
      async findMany() {
        return [
          {
            id: 'req_1',
            dealId: 'deal_1',
            title: 'Title report',
            category: 'title',
            notes: null,
            requestedAt: new Date('2026-03-20T00:00:00.000Z'),
            receivedAt: null
          },
          {
            id: 'req_2',
            dealId: 'deal_1',
            title: 'Utility load letter',
            category: 'power',
            notes: null,
            requestedAt: new Date('2026-03-21T00:00:00.000Z'),
            receivedAt: null
          }
        ];
      },
      async update(args: any) {
        updatedIds.push(args.where.id);
        return {
          id: args.where.id,
          counterparty: null,
          document: { id: args.data.documentId, title: 'Title Report March' },
          ...args.data
        };
      }
    },
    activityLog: {
      async create() {
        return null;
      }
    }
  };

  const matched = await autoMatchDealDocumentRequestsForAsset(
    'asset_1',
    {
      documentId: 'doc_1',
      documentTitle: 'Title Report March',
      documentType: 'REPORT'
    },
    fakeDb as any
  );

  assert.equal(matched.length, 1);
  assert.deepEqual(updatedIds, ['req_1']);
});

test('autoMatchDealDocumentRequestsForAsset only auto-links the best DD request candidate', async () => {
  const updatedIds: string[] = [];
  const fakeDb = {
    dealDocumentRequest: {
      async findMany() {
        return [
          {
            id: 'req_1',
            dealId: 'deal_1',
            title: 'Title report',
            category: 'title',
            notes: null,
            requestedAt: new Date('2026-03-20T00:00:00.000Z'),
            receivedAt: null
          },
          {
            id: 'req_2',
            dealId: 'deal_1',
            title: 'Title package',
            category: 'title',
            notes: null,
            requestedAt: new Date('2026-03-21T00:00:00.000Z'),
            receivedAt: null
          }
        ];
      },
      async update(args: any) {
        updatedIds.push(args.where.id);
        return {
          id: args.where.id,
          counterparty: null,
          document: { id: args.data.documentId, title: 'Title Report March' },
          ...args.data
        };
      }
    },
    activityLog: {
      async create() {
        return null;
      }
    }
  };

  const matched = await autoMatchDealDocumentRequestsForAsset(
    'asset_1',
    {
      documentId: 'doc_1',
      documentTitle: 'Title Report March',
      documentType: 'REPORT'
    },
    fakeDb as any
  );

  assert.equal(matched.length, 1);
  assert.deepEqual(updatedIds, ['req_1']);
});

test('autoMatchDealDocumentRequestsForAsset queues suggestions when the match is ambiguous', async () => {
  const updatedRequests: Array<{ id: string; data: any }> = [];
  const fakeDb = {
    dealDocumentRequest: {
      async findMany() {
        return [
          {
            id: 'req_1',
            dealId: 'deal_1',
            title: 'Environmental report',
            category: 'report',
            notes: null,
            requestedAt: new Date('2026-03-20T00:00:00.000Z'),
            receivedAt: null
          },
          {
            id: 'req_2',
            dealId: 'deal_1',
            title: 'Environmental memo',
            category: 'report',
            notes: null,
            requestedAt: new Date('2026-03-21T00:00:00.000Z'),
            receivedAt: null
          }
        ];
      },
      async update(args: any) {
        updatedRequests.push({ id: args.where.id, data: args.data });
        return {
          id: args.where.id,
          counterparty: null,
          document: null,
          ...args.data
        };
      }
    },
    activityLog: {
      async create() {
        return null;
      }
    }
  };

  const matched = await autoMatchDealDocumentRequestsForAsset(
    'asset_1',
    {
      documentId: 'doc_1',
      documentTitle: 'Environmental update',
      documentType: 'REPORT'
    },
    fakeDb as any
  );

  assert.equal(matched.length, 0);
  assert.equal(updatedRequests.length, 2);
  assert.ok(updatedRequests.every((entry) => entry.data.matchSuggestion));
  assert.ok(updatedRequests.every((entry) => entry.data.status === undefined));
  assert.deepEqual(updatedRequests[0]?.data.matchSuggestion.competingRequestTitles, ['Environmental memo']);
  assert.deepEqual(updatedRequests[1]?.data.matchSuggestion.competingRequestTitles, ['Environmental report']);
});

test('updateDealStage enforces closing before asset management', async () => {
  const now = new Date('2026-03-26T12:00:00.000Z');
  const fakeDb = {
    deal: {
      async findUnique() {
        return {
          id: 'deal_1',
          stage: DealStage.IC,
          nextAction: 'Prepare approval pack',
          createdAt: now,
          updatedAt: now
        };
      },
      async update() {
        throw new Error('should not update');
      }
    },
    activityLog: {
      async create() {
        throw new Error('should not log');
      }
    }
  };

  await assert.rejects(
    () =>
      updateDealStage(
        'deal_1',
        {
          stage: DealStage.ASSET_MANAGEMENT
        },
        fakeDb as any
      ),
    /only after closing/
  );
});

test('buildDealStageChecklist reports missing stage requirements', () => {
  const now = new Date('2026-03-26T12:00:00.000Z');
  const checklist = buildDealStageChecklist({
    id: 'deal_1',
    dealCode: 'DEAL-0001',
    slug: 'deal-0001',
    title: 'NDA Deal',
    stage: DealStage.NDA,
    market: 'KR',
    city: null,
    country: null,
    assetClass: null,
    strategy: null,
    headline: null,
    nextAction: 'Push NDA',
    nextActionAt: now,
    targetCloseDate: null,
    sellerGuidanceKrw: null,
    bidGuidanceKrw: null,
    purchasePriceKrw: null,
    statusLabel: 'ACTIVE',
    archivedAt: null,
    closedAt: null,
    closeOutcome: null,
    closeSummary: null,
    dealLead: 'solo_operator',
    assetId: null,
    createdAt: now,
    updatedAt: now,
    asset: null,
    counterparties: [],
    tasks: [],
    riskFlags: [],
    negotiationEvents: [],
    activityLogs: []
  } as any);

  assert.equal(checklist.find((item) => item.key === 'nda-execution')?.status, 'missing');
  assert.equal(checklist.find((item) => item.key === 'nda-seller-contact')?.status, 'missing');
});

test('buildDealPipelineSummary ranks blocked and urgent deals first', () => {
  const now = new Date('2026-03-26T12:00:00.000Z');
  const summary = buildDealPipelineSummary([
    {
      id: 'deal_1',
      dealCode: 'DEAL-0001',
      title: 'Blocked deal',
      stage: DealStage.DD,
      nextAction: 'Clear legal blocker',
      targetCloseDate: now,
      updatedAt: now,
      originationSource: DealOriginationSource.DIRECT_OWNER,
      originSummary: 'Direct owner outreach from prior relationship.',
      tasks: [{ status: 'OPEN', priority: 'URGENT' }],
      riskFlags: [{ isResolved: false, severity: RiskSeverity.CRITICAL }],
      counterparties: [
        {
          name: 'Owner rep',
          role: 'OWNER',
          coverageOwner: 'solo_operator',
          coverageStatus: RelationshipCoverageStatus.PRIMARY,
          lastContactAt: now
        }
      ],
      documentRequests: [],
      bidRevisions: [],
      lenderQuotes: [],
      negotiationEvents: [{ eventType: 'EXCLUSIVITY_GRANTED', expiresAt: new Date('2026-05-02T00:00:00.000Z') }],
      activityLogs: [],
      asset: {
        researchSnapshots: [{ freshnessStatus: 'FRESH' }],
        coverageTasks: [],
        valuations: [
          {
            id: 'val_1',
            baseCaseValueKrw: 100,
            confidenceScore: 72,
            createdAt: now
          }
        ]
      }
    },
    {
      id: 'deal_2',
      dealCode: 'DEAL-0002',
      title: 'Clean deal',
      stage: DealStage.SCREENED,
      nextAction: 'Request NDA',
      targetCloseDate: null,
      updatedAt: new Date('2026-03-27T12:00:00.000Z'),
      originationSource: DealOriginationSource.LENDER_CHANNEL,
      originSummary: null,
      tasks: [],
      riskFlags: [],
      counterparties: [
        {
          name: 'Lender',
          role: 'LENDER',
          coverageOwner: null,
          coverageStatus: RelationshipCoverageStatus.PASSIVE,
          lastContactAt: null
        }
      ],
      documentRequests: [],
      bidRevisions: [],
      lenderQuotes: [],
      negotiationEvents: [],
      activityLogs: [],
      asset: {
        researchSnapshots: [],
        coverageTasks: [],
        valuations: []
      }
    }
  ]);

  assert.equal(summary.totalDeals, 2);
  assert.equal(summary.urgentDeals, 1);
  assert.equal(summary.blockedDeals, 1);
  assert.equal(summary.directOrProprietaryDeals, 1);
  assert.equal(summary.liveExclusivityDeals, 1);
  assert.equal(summary.watchlist[0]?.title, 'Blocked deal');
  assert.equal(summary.watchlist[0]?.originationBand, 'HIGH');
  assert.equal(summary.watchlist[1]?.sourceLabel, 'Lender Channel');
});

test('buildDealPipelineSummary surfaces origination watch counts', () => {
  const now = new Date('2026-03-26T12:00:00.000Z');
  const summary = buildDealPipelineSummary([
    {
      id: 'deal_3',
      dealCode: 'DEAL-0003',
      title: 'Thin pursuit',
      stage: DealStage.LOI,
      nextAction: 'Revise LOI',
      targetCloseDate: now,
      updatedAt: new Date('2026-03-10T12:00:00.000Z'),
      originationSource: DealOriginationSource.INBOUND,
      originSummary: null,
      tasks: [],
      riskFlags: [],
      counterparties: [],
      documentRequests: [],
      bidRevisions: [],
      lenderQuotes: [],
      negotiationEvents: [],
      activityLogs: [],
      asset: {
        researchSnapshots: [],
        coverageTasks: [{ status: 'OPEN' }],
        valuations: []
      }
    }
  ]);

  assert.equal(summary.lowOriginationCoverageDeals, 1);
  assert.equal(summary.processProtectionGapDeals, 1);
  assert.equal(summary.relationshipCoverageGapDeals, 1);
  assert.equal(summary.watchlist[0]?.exclusivityLabel, 'No live exclusivity');
});

test('buildDealPipelineSummary only flags process protection gaps once a pursuit reaches LOI or deeper', () => {
  const now = new Date('2026-03-26T12:00:00.000Z');
  const summary = buildDealPipelineSummary([
    {
      id: 'deal_screened',
      dealCode: 'DEAL-SCREENED',
      title: 'Screened with no exclusivity yet',
      stage: DealStage.SCREENED,
      nextAction: 'Decide whether to push NDA',
      targetCloseDate: now,
      updatedAt: now,
      originationSource: DealOriginationSource.BROKERED,
      originSummary: 'Broker-led process',
      tasks: [],
      riskFlags: [],
      counterparties: [
        {
          role: 'BROKER',
          coverageOwner: 'kim',
          coverageStatus: RelationshipCoverageStatus.PRIMARY,
          lastContactAt: now,
          name: 'Broker'
        }
      ],
      documentRequests: [],
      bidRevisions: [],
      lenderQuotes: [],
      negotiationEvents: [],
      activityLogs: [],
      asset: {
        researchSnapshots: [],
        coverageTasks: [],
        valuations: []
      }
    },
    {
      id: 'deal_loi',
      dealCode: 'DEAL-LOI',
      title: 'LOI without exclusivity',
      stage: DealStage.LOI,
      nextAction: 'Push exclusivity',
      targetCloseDate: now,
      updatedAt: now,
      originationSource: DealOriginationSource.BROKERED,
      originSummary: 'Competitive broker-led process',
      tasks: [],
      riskFlags: [],
      counterparties: [
        {
          role: 'BROKER',
          coverageOwner: 'lee',
          coverageStatus: RelationshipCoverageStatus.PRIMARY,
          lastContactAt: now,
          name: 'Lead broker'
        }
      ],
      documentRequests: [],
      bidRevisions: [],
      lenderQuotes: [],
      negotiationEvents: [],
      activityLogs: [],
      asset: {
        researchSnapshots: [],
        coverageTasks: [],
        valuations: []
      }
    }
  ] as any);

  assert.equal(summary.processProtectionGapDeals, 1);
  assert.equal(summary.watchlist.some((item) => item.id === 'deal_loi'), true);
});

test('buildDealReminderSummary ranks overdue and missing-next-action deals', () => {
  const now = new Date();
  const summary = buildDealReminderSummary([
    {
      id: 'deal_1',
      dealCode: 'DEAL-0001',
      title: 'Overdue deal',
      stage: DealStage.DD,
      statusLabel: 'ACTIVE',
      archivedAt: null,
      updatedAt: now,
      nextAction: 'Chase lender consent',
      nextActionAt: now,
      tasks: [
        {
          status: 'OPEN',
          priority: 'HIGH',
          dueDate: new Date(now.getTime() - 1000 * 60 * 60 * 24),
          checklistKey: 'dd::legal',
          isRequired: true
        }
      ],
      counterparties: []
    },
    {
      id: 'deal_2',
      dealCode: 'DEAL-0002',
      title: 'No next action deal',
      stage: DealStage.SCREENED,
      statusLabel: 'ACTIVE',
      archivedAt: null,
      updatedAt: now,
      nextAction: null,
      nextActionAt: null,
      tasks: [],
      counterparties: []
    }
  ]);

  assert.equal(summary.overdueDeals, 1);
  assert.equal(summary.missingNextActionDeals, 1);
  assert.equal(summary.reminders[0]?.title, 'Overdue deal');
});

test('buildDealReminderSummary uses nearest due date as tie breaker', () => {
  const now = new Date();
  const summary = buildDealReminderSummary([
    {
      id: 'deal_1',
      dealCode: 'DEAL-0001',
      title: 'Later due',
      stage: DealStage.DD,
      statusLabel: 'ACTIVE',
      archivedAt: null,
      updatedAt: now,
      nextAction: 'Do later item',
      nextActionAt: null,
      tasks: [
        {
          status: 'OPEN',
          priority: 'MEDIUM',
          dueDate: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 3),
          checklistKey: null,
          isRequired: false
        }
      ],
      counterparties: []
    },
    {
      id: 'deal_2',
      dealCode: 'DEAL-0002',
      title: 'Sooner due',
      stage: DealStage.DD,
      statusLabel: 'ACTIVE',
      archivedAt: null,
      updatedAt: now,
      nextAction: 'Do sooner item',
      nextActionAt: null,
      tasks: [
        {
          status: 'OPEN',
          priority: 'MEDIUM',
          dueDate: new Date(now.getTime() + 1000 * 60 * 60 * 24),
          checklistKey: null,
          isRequired: false
        }
      ],
      counterparties: []
    }
  ]);

  assert.equal(summary.reminders[0]?.title, 'Sooner due');
});

test('buildDealReminderSummary flags stale deals after 7 days without update', () => {
  const now = new Date();
  const summary = buildDealReminderSummary([
    {
      id: 'deal_1',
      dealCode: 'DEAL-0001',
      title: 'Stale deal',
      stage: DealStage.SCREENED,
      statusLabel: 'ACTIVE',
      archivedAt: null,
      updatedAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 9),
      nextAction: 'Call broker',
      nextActionAt: null,
      tasks: [],
      counterparties: []
    }
  ]);

  assert.equal(summary.staleDeals, 1);
  assert.equal(summary.reminders[0]?.isStale, true);
});

test('buildDealReminderSummary treats fresh child execution activity as non-stale', () => {
  const now = new Date();
  const summary = buildDealReminderSummary([
    {
      id: 'deal_1',
      dealCode: 'DEAL-0001',
      title: 'Fresh execution deal',
      stage: DealStage.SCREENED,
      statusLabel: 'ACTIVE',
      archivedAt: null,
      updatedAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 9),
      nextAction: 'Call broker',
      nextActionAt: null,
      tasks: [
        {
          id: 'task_1',
          status: 'OPEN',
          priority: 'MEDIUM',
          dueDate: null,
          checklistKey: null,
          isRequired: false,
          createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 9),
          updatedAt: new Date(now.getTime() - 1000 * 60 * 60 * 4),
          completedAt: null
        }
      ],
      documentRequests: [],
      bidRevisions: [],
      lenderQuotes: [],
      negotiationEvents: [],
      riskFlags: [],
      activityLogs: [],
      counterparties: []
    }
  ] as any);

  assert.equal(summary.staleDeals, 0);
  assert.equal(summary.reminders.length, 0);
});

test('seedDealStageChecklist creates required tasks for the current stage', async () => {
  const now = new Date('2026-03-26T12:00:00.000Z');
  const created: any[] = [];
  const fakeDb = {
    deal: {
      async findUnique() {
        return {
          id: 'deal_1',
          dealCode: 'DEAL-0001',
          slug: 'deal-0001',
          title: 'IC Deal',
          stage: DealStage.IC,
          market: 'KR',
          city: null,
          country: null,
          assetClass: null,
          strategy: null,
          headline: null,
          nextAction: 'Prep IC',
          nextActionAt: now,
          targetCloseDate: null,
          sellerGuidanceKrw: null,
          bidGuidanceKrw: null,
          purchasePriceKrw: null,
          statusLabel: 'ACTIVE',
          archivedAt: null,
          closedAt: null,
          closeOutcome: null,
          closeSummary: null,
          dealLead: 'solo_operator',
          assetId: null,
          createdAt: now,
          updatedAt: now,
          asset: null,
          counterparties: [],
          tasks: [],
          riskFlags: [],
          negotiationEvents: [],
          activityLogs: []
        };
      }
    },
    task: {
      async findFirst() {
        return null;
      },
      async create(args: any) {
        created.push(args.data);
        return { id: `task_${created.length}`, ...args.data, createdAt: now, updatedAt: now };
      }
    },
    activityLog: {
      async create() {
        return null;
      }
    }
  };

  const result = await seedDealStageChecklist('deal_1', fakeDb as any);
  assert.equal(result.length, 2);
  assert.ok(created.every((task) => task.isRequired === true));
});

test('archiveDeal marks a record archived', async () => {
  let updatedData: any;
  const fakeDb = {
    deal: {
      async findUnique() {
        return {
          id: 'deal_1',
          stage: DealStage.DD,
          nextAction: 'Do work',
          closeSummary: null
        };
      },
      async update(args: any) {
        updatedData = args.data;
        return null;
      }
    },
    activityLog: {
      async create() {
        return null;
      }
    }
  };

  await archiveDeal('deal_1', { summary: 'Paused for now.' }, fakeDb as any);
  assert.equal(updatedData.statusLabel, 'ARCHIVED');
  assert.equal(updatedData.nextAction, null);
});

test('restoreDeal reopens an archived record', async () => {
  let updatedData: any;
  const fakeDb = {
    deal: {
      async findUnique() {
        return {
          id: 'deal_1',
          stage: DealStage.DD,
          statusLabel: 'ARCHIVED',
          archivedAt: new Date('2026-03-26T12:00:00.000Z'),
          closedAt: null,
          closeOutcome: null,
          nextAction: null
        };
      },
      async update(args: any) {
        updatedData = args.data;
        return null;
      }
    },
    activityLog: {
      async create() {
        return null;
      }
    }
  };

  await restoreDeal('deal_1', { summary: 'Back in market.' }, fakeDb as any);
  assert.equal(updatedData.statusLabel, 'ACTIVE');
  assert.equal(updatedData.archivedAt, null);
});

test('updateDealCounterparty stores relationship coverage metadata', async () => {
  let updatedData: any;
  const fakeDb = {
    counterparty: {
      async findFirst() {
        return { id: 'cp_1', dealId: 'deal_1', name: 'Broker', role: 'BROKER' };
      },
      async update(args: any) {
        updatedData = args.data;
        return {
          id: 'cp_1',
          name: 'Broker',
          role: 'BROKER',
          ...args.data
        };
      }
    },
    activityLog: {
      async create() {
        return null;
      }
    }
  };

  await updateDealCounterparty(
    'deal_1',
    'cp_1',
    {
      coverageOwner: 'han',
      coverageStatus: RelationshipCoverageStatus.PRIMARY,
      lastContactAt: '2026-04-07',
      notes: 'Owner-side channel is active.'
    },
    fakeDb as any
  );

  assert.equal(updatedData?.coverageOwner, 'han');
  assert.equal(updatedData?.coverageStatus, RelationshipCoverageStatus.PRIMARY);
  assert.ok(updatedData?.lastContactAt instanceof Date);
});

test('closeOutDeal moves a won closing deal into asset management', async () => {
  let updatedData: any;
  const createdTasks: any[] = [];
  const fakeDb = {
    deal: {
      async findUnique() {
        return {
          id: 'deal_1',
          stage: DealStage.CLOSING
        };
      },
      async update(args: any) {
        updatedData = args.data;
        return null;
      }
    },
    task: {
      async findFirst() {
        return null;
      },
      async create(args: any) {
        createdTasks.push(args.data);
        return { id: 'task_1', ...args.data };
      }
    },
    activityLog: {
      async create() {
        return null;
      }
    }
  };

  await closeOutDeal('deal_1', { outcome: 'CLOSED_WON', summary: 'Signed and funded.' }, fakeDb as any);
  assert.equal(updatedData.stage, DealStage.ASSET_MANAGEMENT);
  assert.equal(updatedData.statusLabel, 'CLOSED_WON');
  assert.equal(createdTasks[0]?.title, 'Complete asset management handoff');
});

test('closeOutDeal stores loss reason taxonomy for closed-lost deals', async () => {
  let updatedData: any;
  const fakeDb = {
    deal: {
      async findUnique() {
        return {
          id: 'deal_1',
          stage: DealStage.DD
        };
      },
      async update(args: any) {
        updatedData = args.data;
        return null;
      }
    },
    task: {
      async findFirst() {
        return null;
      },
      async create() {
        return null;
      }
    },
    activityLog: {
      async create() {
        return null;
      }
    }
  };

  await closeOutDeal(
    'deal_1',
    {
      outcome: 'CLOSED_LOST',
      summary: 'Seller chose a higher-certainty bidder.',
      lossReason: DealLossReason.PRICE
    },
    fakeDb as any
  );

  assert.equal(updatedData.statusLabel, 'CLOSED_LOST');
  assert.equal(updatedData.lossReason, DealLossReason.PRICE);
});

test('buildDealTimeline mixes activities and valuations in reverse time order', () => {
  const now = new Date('2026-03-26T12:00:00.000Z');
  const timeline = buildDealTimeline({
    id: 'deal_1',
    dealCode: 'DEAL-0001',
    slug: 'deal-0001',
    title: 'Timeline deal',
    stage: DealStage.DD,
    market: 'KR',
    city: null,
    country: null,
    assetClass: null,
    strategy: null,
    headline: null,
    nextAction: null,
    nextActionAt: null,
    targetCloseDate: null,
    sellerGuidanceKrw: null,
    bidGuidanceKrw: null,
    purchasePriceKrw: null,
    statusLabel: 'ACTIVE',
    archivedAt: null,
    closedAt: null,
    closeOutcome: null,
    closeSummary: null,
    dealLead: 'solo_operator',
    assetId: 'asset_1',
    createdAt: now,
    updatedAt: now,
    counterparties: [],
    tasks: [],
    riskFlags: [],
    negotiationEvents: [],
    activityLogs: [
      {
        id: 'act_1',
        dealId: 'deal_1',
        counterpartyId: null,
        activityType: ActivityType.GENERAL,
        title: 'Broker called',
        body: 'Call completed.',
        stageFrom: null,
        stageTo: null,
        metadata: null,
        createdByLabel: 'solo_operator',
        createdAt: new Date('2026-03-26T10:00:00.000Z'),
        updatedAt: now,
        counterparty: null
      }
    ],
    asset: {
      id: 'asset_1',
      assetCode: 'ASSET-1',
      name: 'Asset 1',
      address: null,
      valuations: [
        {
          id: 'val_1',
          assetId: 'asset_1',
          runLabel: 'Latest run',
          engineVersion: 'v1',
          status: 'COMPLETED',
          baseCaseValueKrw: 1000000,
          confidenceScore: 68,
          underwritingMemo: '',
          keyRisks: [],
          ddChecklist: [],
          assumptions: {},
          provenance: [],
          createdAt: new Date('2026-03-26T11:00:00.000Z'),
          updatedAt: now
        }
      ]
    }
  } as any);

  assert.equal(timeline[0]?.kind, 'valuation');
  assert.equal(timeline[1]?.kind, 'activity');
});

test('buildDealTimeline compresses same-day task churn into one event', () => {
  const now = new Date('2026-03-26T12:00:00.000Z');
  const timeline = buildDealTimeline({
    id: 'deal_1',
    dealCode: 'DEAL-0001',
    slug: 'deal-0001',
    title: 'Timeline deal',
    stage: DealStage.DD,
    market: 'KR',
    city: null,
    country: null,
    assetClass: null,
    strategy: null,
    headline: null,
    nextAction: null,
    nextActionAt: null,
    targetCloseDate: null,
    sellerGuidanceKrw: null,
    bidGuidanceKrw: null,
    purchasePriceKrw: null,
    statusLabel: 'ACTIVE',
    archivedAt: null,
    closedAt: null,
    closeOutcome: null,
    closeSummary: null,
    dealLead: 'solo_operator',
    assetId: null,
    createdAt: now,
    updatedAt: now,
    counterparties: [],
    tasks: [],
    riskFlags: [],
    negotiationEvents: [],
    activityLogs: [
      {
        id: 'act_1',
        dealId: 'deal_1',
        counterpartyId: null,
        activityType: ActivityType.TASK_UPDATED,
        title: 'Task updated',
        body: 'Open title workstream.',
        stageFrom: null,
        stageTo: null,
        metadata: null,
        createdByLabel: 'solo_operator',
        createdAt: new Date('2026-03-26T11:00:00.000Z'),
        updatedAt: now,
        counterparty: null
      },
      {
        id: 'act_2',
        dealId: 'deal_1',
        counterpartyId: null,
        activityType: ActivityType.TASK_CREATED,
        title: 'Task added',
        body: 'Open lender workstream.',
        stageFrom: null,
        stageTo: null,
        metadata: null,
        createdByLabel: 'solo_operator',
        createdAt: new Date('2026-03-26T10:00:00.000Z'),
        updatedAt: now,
        counterparty: null
      }
    ],
    asset: null
  } as any);

  assert.equal(timeline.length, 1);
  assert.equal(timeline[0]?.title, 'Task queue updated');
  assert.ok(timeline[0]?.meta.includes('task batch'));
});

test('buildDealTimeline tags note and risk categories for filtering', () => {
  const now = new Date('2026-03-26T12:00:00.000Z');
  const timeline = buildDealTimeline({
    id: 'deal_1',
    dealCode: 'DEAL-0001',
    slug: 'deal-0001',
    title: 'Timeline deal',
    stage: DealStage.DD,
    market: 'KR',
    city: null,
    country: null,
    assetClass: null,
    strategy: null,
    headline: null,
    nextAction: null,
    nextActionAt: null,
    targetCloseDate: null,
    sellerGuidanceKrw: null,
    bidGuidanceKrw: null,
    purchasePriceKrw: null,
    statusLabel: 'ACTIVE',
    archivedAt: null,
    closedAt: null,
    closeOutcome: null,
    closeSummary: null,
    dealLead: 'solo_operator',
    assetId: null,
    createdAt: now,
    updatedAt: now,
    counterparties: [],
    tasks: [],
    riskFlags: [],
    negotiationEvents: [],
    activityLogs: [
      {
        id: 'act_note',
        dealId: 'deal_1',
        counterpartyId: null,
        activityType: ActivityType.NOTE,
        title: 'Broker note',
        body: 'Pricing moved.',
        stageFrom: null,
        stageTo: null,
        metadata: null,
        createdByLabel: 'solo_operator',
        createdAt: new Date('2026-03-26T11:00:00.000Z'),
        updatedAt: now,
        counterparty: null
      },
      {
        id: 'act_risk',
        dealId: 'deal_1',
        counterpartyId: null,
        activityType: ActivityType.RISK_CREATED,
        title: 'Power risk',
        body: 'Interconnect delayed.',
        stageFrom: null,
        stageTo: null,
        metadata: null,
        createdByLabel: 'solo_operator',
        createdAt: new Date('2026-03-26T10:00:00.000Z'),
        updatedAt: now,
        counterparty: null
      }
    ],
    asset: null
  } as any);

  assert.equal(timeline[0]?.category, 'note');
  assert.equal(timeline[1]?.category, 'risk');
});

test('buildDealCloseProbabilitySummary prioritizes fragile live execution deals', () => {
  const now = new Date('2026-03-28T12:00:00.000Z');
  const summary = buildDealCloseProbabilitySummary([
    {
      id: 'deal_low',
      dealCode: 'DEAL-LOW',
      title: 'Fragile closing',
      stage: DealStage.CLOSING,
      nextAction: 'Fix lender issues',
      targetCloseDate: new Date('2026-04-03T00:00:00.000Z'),
      updatedAt: new Date('2026-03-20T00:00:00.000Z'),
      tasks: [
        { status: TaskStatus.OPEN, priority: TaskPriority.URGENT, dueDate: now, checklistKey: null, isRequired: true }
      ],
      riskFlags: [{ isResolved: false, severity: RiskSeverity.CRITICAL }],
      counterparties: [{ role: 'BUYER' }],
      documentRequests: [{ status: 'REQUESTED' }],
      bidRevisions: [{ status: 'COUNTERED', label: 'Counter LOI' }],
      lenderQuotes: [],
      negotiationEvents: [{ eventType: 'SELLER_COUNTER', expiresAt: null, effectiveAt: now }],
      activityLogs: [],
      asset: {
        valuations: [
          {
            id: 'val_low',
            baseCaseValueKrw: 1000000,
            confidenceScore: 62,
            createdAt: new Date('2026-01-15T00:00:00.000Z')
          }
        ]
      }
    },
    {
      id: 'deal_high',
      dealCode: 'DEAL-HIGH',
      title: 'Ready to close',
      stage: DealStage.CLOSING,
      nextAction: 'Execute close docs',
      targetCloseDate: new Date('2026-04-01T00:00:00.000Z'),
      updatedAt: now,
      tasks: [],
      riskFlags: [],
      counterparties: [{ role: 'BUYER' }, { role: 'LENDER' }],
      documentRequests: [{ status: 'RECEIVED' }],
      bidRevisions: [{ status: 'ACCEPTED', label: 'Accepted LOI' }],
      lenderQuotes: [{ status: 'CREDIT_APPROVED', facilityLabel: 'Senior' }],
      negotiationEvents: [{ eventType: 'EXCLUSIVITY_GRANTED', expiresAt: new Date('2026-04-10T00:00:00.000Z'), effectiveAt: now }],
      activityLogs: [],
      asset: {
        valuations: [
          {
            id: 'val_high',
            baseCaseValueKrw: 1000000,
            confidenceScore: 81,
            createdAt: new Date('2026-03-25T00:00:00.000Z')
          }
        ]
      }
    },
    {
      id: 'deal_screened',
      dealCode: 'DEAL-SCREENED',
      title: 'Too early',
      stage: DealStage.SCREENED,
      nextAction: null,
      targetCloseDate: null,
      updatedAt: now,
      tasks: [],
      riskFlags: [],
      counterparties: [],
      documentRequests: [],
      bidRevisions: [],
      lenderQuotes: [],
      negotiationEvents: [],
      activityLogs: [],
      asset: null
    }
  ] as any);

  assert.equal(summary.lowProbabilityCount, 1);
  assert.equal(summary.highProbabilityCount, 1);
  assert.equal(summary.watchlist[0]?.id, 'deal_low');
  assert.equal(summary.watchlist.some((item) => item.id === 'deal_screened'), false);
});

test('buildDealCloseProbabilityHistory returns persisted snapshots in reverse time order', () => {
  const history = buildDealCloseProbabilityHistory(
    {
      id: 'deal_1',
      dealCode: 'DEAL-0001',
      slug: 'deal-0001',
      title: 'Tracked deal',
      stage: DealStage.CLOSING,
      market: 'KR',
      city: 'Seoul',
      country: 'KR',
      assetClass: null,
      strategy: null,
      headline: null,
      nextAction: null,
      nextActionAt: null,
      targetCloseDate: null,
      sellerGuidanceKrw: null,
      bidGuidanceKrw: null,
      purchasePriceKrw: null,
      statusLabel: 'ACTIVE',
      archivedAt: null,
      closedAt: null,
      closeOutcome: null,
      closeSummary: null,
      dealLead: 'solo_operator',
      assetId: null,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-28T00:00:00.000Z'),
      counterparties: [],
      documentRequests: [],
      bidRevisions: [],
      lenderQuotes: [],
      negotiationEvents: [],
      tasks: [],
      riskFlags: [],
      activityLogs: [],
      asset: null,
      probabilitySnapshots: [
        {
          id: 'snap_2',
          stage: DealStage.CLOSING,
          snapshotReason: 'lender_quote_updated',
          readinessScorePct: 84,
          readinessBlockerCount: 1,
          closeProbabilityPct: 76,
          closeProbabilityBand: 'HIGH',
          headline: 'Close path is credible if the current checklist stays clean.',
          openRiskCount: 0,
          overdueTaskCount: 1,
          pendingSuggestedRequestCount: 2,
          hasAcceptedBid: true,
          hasApprovedFinancing: true,
          hasLiveExclusivity: true,
          createdAt: new Date('2026-03-27T00:00:00.000Z')
        },
        {
          id: 'snap_1',
          stage: DealStage.IC,
          snapshotReason: 'stage_changed',
          readinessScorePct: 62,
          readinessBlockerCount: 2,
          closeProbabilityPct: 58,
          closeProbabilityBand: 'MEDIUM',
          headline: 'Deal can close, but execution gaps still need active management.',
          openRiskCount: 1,
          overdueTaskCount: 0,
          pendingSuggestedRequestCount: 0,
          hasAcceptedBid: true,
          hasApprovedFinancing: false,
          hasLiveExclusivity: true,
          createdAt: new Date('2026-03-22T00:00:00.000Z')
        }
      ]
    } as any,
    null as any
  );

  assert.equal(history.length, 2);
  assert.equal(history[0]?.id, 'snap_2');
  assert.equal(history[0]?.flags.includes('approved financing'), true);
  assert.equal(history[0]?.flags.includes('pending DD suggestions (2)'), true);
  assert.equal(history[1]?.flags.includes('accepted bid'), true);
});

test('buildDealCloseProbabilityHistory prepends current state when it diverges from persisted history', () => {
  const now = new Date('2026-03-30T12:00:00.000Z');
  const history = buildDealCloseProbabilityHistory(
    {
      id: 'deal_1',
      dealCode: 'DEAL-0001',
      slug: 'deal-0001',
      title: 'Tracked deal',
      stage: DealStage.CLOSING,
      market: 'KR',
      city: 'Seoul',
      country: 'KR',
      assetClass: null,
      strategy: null,
      headline: null,
      nextAction: 'Close docs',
      nextActionAt: null,
      targetCloseDate: null,
      sellerGuidanceKrw: null,
      bidGuidanceKrw: null,
      purchasePriceKrw: null,
      statusLabel: 'ACTIVE',
      archivedAt: null,
      closedAt: null,
      closeOutcome: null,
      closeSummary: null,
      dealLead: 'solo_operator',
      assetId: 'asset_1',
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-20T00:00:00.000Z'),
      counterparties: [],
      bidRevisions: [],
      lenderQuotes: [],
      negotiationEvents: [],
      tasks: [],
      riskFlags: [],
      activityLogs: [],
      asset: {
        valuations: [
          {
            id: 'val_1',
            createdAt: now
          }
        ]
      },
      documentRequests: [
        {
          id: 'req_1',
          status: DealRequestStatus.REQUESTED,
          documentId: null,
          matchSuggestion: { documentId: 'doc_1', documentTitle: 'Updated DD pack', score: 6 }
        }
      ],
      probabilitySnapshots: [
        {
          id: 'snap_1',
          stage: DealStage.CLOSING,
          snapshotReason: 'lender_quote_updated',
          readinessScorePct: 70,
          readinessBlockerCount: 2,
          closeProbabilityPct: 60,
          closeProbabilityBand: 'MEDIUM',
          headline: 'Older state',
          openRiskCount: 1,
          overdueTaskCount: 1,
          pendingSuggestedRequestCount: 0,
          hasAcceptedBid: false,
          hasApprovedFinancing: false,
          hasLiveExclusivity: false,
          createdAt: new Date('2026-03-21T00:00:00.000Z')
        }
      ]
    } as any,
    {
      readiness: { scorePct: 88, blockerCount: 1 } as any,
      probability: { scorePct: 82, band: 'HIGH', headline: 'Current state' } as any
    }
  );

  assert.equal(history[0]?.id, 'current');
  assert.equal(history[0]?.scorePct, 82);
  assert.equal(history[0]?.flags.includes('pending DD suggestions (1)'), true);
  assert.equal(history[1]?.id, 'snap_1');
});
