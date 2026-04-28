import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CommitteeDecisionOutcome,
  CommitteeMeetingStatus,
  CommitteePacketStatus
} from '@prisma/client';
import { buildCommitteeActionItems, buildCommitteeDashboard } from '@/lib/services/ic-builders';
import {
  buildCommitteePacketLockReadiness,
  decideCommitteePacket,
  releaseCommitteePacket
} from '@/lib/services/ic';

test('committee dashboard surfaces locked, conditional, and candidate packet actions', () => {
  const meetings = [
    {
      id: 'meeting-1',
      code: 'IC-2026-APR-15',
      title: 'April 2026 Korea Real Estate IC',
      status: CommitteeMeetingStatus.SCHEDULED,
      scheduledFor: new Date('2026-04-15T01:00:00.000Z'),
      heldAt: null,
      venueLabel: 'Seoul',
      summary: 'Committee agenda',
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
      updatedAt: new Date('2026-04-01T00:00:00.000Z'),
      packets: []
    }
  ];

  const packets = [
    {
      id: 'packet-1',
      title: 'Yeouido Packet',
      packetCode: 'PKT-1',
      status: CommitteePacketStatus.LOCKED,
      decisions: [],
      asset: null,
      deal: null,
      valuationRun: null,
      meeting: null,
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
      updatedAt: new Date('2026-04-12T00:00:00.000Z')
    },
    {
      id: 'packet-2',
      title: 'Gangseo Packet',
      packetCode: 'PKT-2',
      status: CommitteePacketStatus.CONDITIONAL,
      decisions: [
        {
          id: 'decision-1',
          packetId: 'packet-2',
          outcome: 'CONDITIONAL',
          decidedAt: new Date('2026-04-15T03:00:00.000Z'),
          decidedByLabel: 'IC Chair',
          notes: 'Conditional',
          followUpActions: 'Upload utility letter',
          createdAt: new Date('2026-04-15T03:00:00.000Z'),
          updatedAt: new Date('2026-04-15T03:00:00.000Z')
        }
      ],
      asset: null,
      deal: null,
      valuationRun: null,
      meeting: null,
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
      updatedAt: new Date('2026-04-15T03:00:00.000Z')
    }
  ];

  const candidates = [
    {
      id: 'asset-1',
      name: 'Candidate Office',
      assetCode: 'OFFICE-1',
      assetClass: 'OFFICE',
      status: 'IC_READY',
      updatedAt: new Date('2026-04-10T00:00:00.000Z'),
      valuations: [
        {
          id: 'val-1',
          runLabel: 'Latest scenario',
          createdAt: new Date('2026-04-09T00:00:00.000Z'),
          confidenceScore: 77
        }
      ],
      deals: [],
      leadDeal: { id: 'deal-1', dealCode: 'DEAL-0001' },
      diligenceSummary: {
        signedOffCount: 1,
        deliverableCount: 1,
        coreRequiredTypes: ['LEGAL', 'COMMERCIAL', 'TECHNICAL'],
        missingCoreTypes: ['COMMERCIAL'],
        uncoveredCoreTypes: ['TECHNICAL'],
        blockedCount: 0
      }
    }
  ];

  const actionItems = buildCommitteeActionItems(meetings, packets, candidates);
  const dashboard = buildCommitteeDashboard(meetings, packets, candidates);

  assert.equal(dashboard.summary.scheduledCount, 1);
  assert.equal(dashboard.summary.lockedCount, 1);
  assert.equal(dashboard.summary.candidateCount, 1);
  assert.equal(dashboard.latestDecision?.outcome, 'CONDITIONAL');
  assert.ok(actionItems.some((item) => item.title.includes('awaiting decision')));
  assert.ok(actionItems.some((item) => item.title.includes('candidate asset')));
  assert.ok(actionItems.some((item) => item.title.includes('specialist DD gaps')));
  assert.ok(actionItems.some((item) => item.title.includes('deliverables linked')));
});

test('committee packet lock readiness blocks lock until DD evidence and valuation approval are complete', () => {
  const blocked = buildCommitteePacketLockReadiness({
    id: 'packet-1',
    title: 'Yeouido Packet',
    packetCode: 'PKT-1',
    status: CommitteePacketStatus.READY,
    assetId: 'asset-1',
    dealId: 'deal-1',
    valuationRunId: 'val-1',
    packetFingerprint: null,
    reportFingerprint: null,
    reviewPacketFingerprint: null,
    preparedByLabel: null,
    scheduledFor: null,
    lockedAt: null,
    releasedAt: null,
    decisionSummary: null,
    followUpSummary: null,
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    updatedAt: new Date('2026-04-12T00:00:00.000Z'),
    meeting: null,
    asset: {
      id: 'asset-1',
      name: 'Yeouido Core Office Tower',
      assetCode: 'ASSET-1',
      assetClass: 'OFFICE',
      status: 'IC_READY'
    },
    deal: {
      id: 'deal-1',
      dealCode: 'DEAL-1',
      title: 'Linked deal',
      stage: 'IC',
      nextAction: 'Lock packet',
      targetCloseDate: null,
      assetClass: 'OFFICE',
      diligenceWorkstreams: [
        {
          id: 'legal',
          workstreamType: 'LEGAL',
          status: 'SIGNED_OFF',
          requestedAt: null,
          signedOffAt: new Date(),
          blockerSummary: null,
          deliverables: [{ id: 'doc-1' }]
        },
        {
          id: 'commercial',
          workstreamType: 'COMMERCIAL',
          status: 'SIGNED_OFF',
          requestedAt: null,
          signedOffAt: new Date(),
          blockerSummary: null,
          deliverables: []
        },
        {
          id: 'technical',
          workstreamType: 'TECHNICAL',
          status: 'SIGNED_OFF',
          requestedAt: null,
          signedOffAt: new Date(),
          blockerSummary: null,
          deliverables: [{ id: 'doc-2' }]
        }
      ]
    },
    valuationRun: {
      id: 'val-1',
      runLabel: 'Base case',
      createdAt: new Date('2026-04-10T00:00:00.000Z'),
      confidenceScore: 78,
      approvalStatus: 'PENDING'
    },
    decisions: []
  } as any);

  assert.equal(blocked.canLock, false);
  assert.ok(blocked.blockers.some((item) => item.includes('Approve the linked valuation run')));
  assert.ok(blocked.blockers.some((item) => item.includes('Supporting deliverables are missing')));

  const ready = buildCommitteePacketLockReadiness({
    id: 'packet-2',
    title: 'Ready packet',
    packetCode: 'PKT-2',
    status: CommitteePacketStatus.READY,
    assetId: 'asset-1',
    dealId: 'deal-1',
    valuationRunId: 'val-2',
    packetFingerprint: null,
    reportFingerprint: null,
    reviewPacketFingerprint: null,
    preparedByLabel: null,
    scheduledFor: null,
    lockedAt: null,
    releasedAt: null,
    decisionSummary: null,
    followUpSummary: null,
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    updatedAt: new Date('2026-04-12T00:00:00.000Z'),
    meeting: null,
    asset: {
      id: 'asset-1',
      name: 'Yeouido Core Office Tower',
      assetCode: 'ASSET-1',
      assetClass: 'OFFICE',
      status: 'IC_READY'
    },
    deal: {
      id: 'deal-1',
      dealCode: 'DEAL-1',
      title: 'Linked deal',
      stage: 'IC',
      nextAction: 'Lock packet',
      targetCloseDate: null,
      assetClass: 'OFFICE',
      diligenceWorkstreams: [
        {
          id: 'legal',
          workstreamType: 'LEGAL',
          status: 'SIGNED_OFF',
          requestedAt: null,
          signedOffAt: new Date(),
          blockerSummary: null,
          deliverables: [{ id: 'doc-1' }]
        },
        {
          id: 'commercial',
          workstreamType: 'COMMERCIAL',
          status: 'SIGNED_OFF',
          requestedAt: null,
          signedOffAt: new Date(),
          blockerSummary: null,
          deliverables: [{ id: 'doc-2' }]
        },
        {
          id: 'technical',
          workstreamType: 'TECHNICAL',
          status: 'SIGNED_OFF',
          requestedAt: null,
          signedOffAt: new Date(),
          blockerSummary: null,
          deliverables: [{ id: 'doc-3' }]
        }
      ]
    },
    valuationRun: {
      id: 'val-2',
      runLabel: 'Approved case',
      createdAt: new Date('2026-04-10T00:00:00.000Z'),
      confidenceScore: 82,
      approvalStatus: 'APPROVED'
    },
    decisions: []
  } as any);

  assert.equal(ready.canLock, true);
  assert.equal(ready.blockerCount, 0);
});

test('committee decision transitions locked packets and release only allows decided packets', async () => {
  const packet = {
    id: 'packet-1',
    title: 'Ready packet',
    packetCode: 'PKT-1',
    status: CommitteePacketStatus.LOCKED,
    assetId: 'asset-1',
    dealId: 'deal-1',
    valuationRunId: 'val-1',
    packetFingerprint: null,
    reportFingerprint: null,
    reviewPacketFingerprint: null,
    preparedByLabel: null,
    scheduledFor: null,
    lockedAt: new Date('2026-04-12T00:00:00.000Z'),
    releasedAt: null,
    decisionSummary: null,
    followUpSummary: null,
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    updatedAt: new Date('2026-04-12T00:00:00.000Z'),
    meeting: null,
    asset: null,
    deal: null,
    valuationRun: null,
    decisions: []
  };

  const decisionCreates: any[] = [];
  const packetUpdates: any[] = [];

  const txModels = {
    investmentCommitteePacket: {
      update: async ({ data }: any) => {
        packetUpdates.push(data);
        return { ...packet, ...data };
      }
    },
    investmentCommitteeDecision: {
      create: async ({ data }: any) => {
        decisionCreates.push(data);
        return data;
      }
    }
  };

  const db = {
    investmentCommitteePacket: {
      findUnique: async () => packet,
      update: txModels.investmentCommitteePacket.update
    },
    investmentCommitteeDecision: {
      create: txModels.investmentCommitteeDecision.create
    },
    $transaction: async (fn: any) => fn(txModels)
  } as any;

  const decided = await decideCommitteePacket(
    packet.id,
    {
      outcome: CommitteeDecisionOutcome.APPROVED,
      notes: 'Approved for release.',
      followUpActions: 'Circulate released packet.'
    },
    'IC Chair',
    db
  );

  assert.equal(decisionCreates.length, 1);
  assert.equal(decisionCreates[0].outcome, CommitteeDecisionOutcome.APPROVED);
  assert.equal(decided.status, CommitteePacketStatus.APPROVED);

  const released = await releaseCommitteePacket(packet.id, 'IC Chair', {
    investmentCommitteePacket: {
      findUnique: async () => ({ ...packet, status: CommitteePacketStatus.APPROVED }),
      update: async ({ data }: any) => ({ ...packet, ...data })
    }
  } as any);

  assert.equal(released.status, CommitteePacketStatus.RELEASED);
  assert.ok(released.releasedAt instanceof Date);
});
