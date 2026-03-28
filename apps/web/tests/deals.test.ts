import assert from 'node:assert/strict';
import test from 'node:test';
import { ActivityType, DealStage, RiskSeverity, TaskPriority, TaskStatus } from '@prisma/client';
import {
  archiveDeal,
  createDealDocumentRequest,
  buildDealDataCoverage,
  buildDealExecutionSnapshot,
  buildDealStageChecklist,
  buildDealStageSummary,
  buildDealTimeline,
  closeOutDeal,
  restoreDeal,
  seedDealStageChecklist,
  updateDealDocumentRequest,
  updateDealStage
} from '@/lib/services/deals';
import { buildDealPipelineSummary, buildDealReminderSummary } from '@/lib/services/dashboard';

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
      tasks: [{ status: 'OPEN', priority: 'URGENT' }],
      riskFlags: [{ isResolved: false, severity: RiskSeverity.CRITICAL }],
      counterparties: [{ role: 'BROKER' }],
      asset: {
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
      tasks: [],
      riskFlags: [],
      counterparties: [],
      asset: null
    }
  ]);

  assert.equal(summary.totalDeals, 2);
  assert.equal(summary.urgentDeals, 1);
  assert.equal(summary.blockedDeals, 1);
  assert.equal(summary.watchlist[0]?.title, 'Blocked deal');
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
