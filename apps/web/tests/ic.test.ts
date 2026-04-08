import test from 'node:test';
import assert from 'node:assert/strict';
import { CommitteeMeetingStatus, CommitteePacketStatus } from '@prisma/client';
import { buildCommitteeActionItems, buildCommitteeDashboard } from '@/lib/services/ic-builders';

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
      valuations: [{ id: 'val-1', runLabel: 'Latest scenario', createdAt: new Date('2026-04-09T00:00:00.000Z'), confidenceScore: 77 }],
      deals: []
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
});
