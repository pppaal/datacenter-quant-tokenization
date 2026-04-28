import type { PrismaClient } from '@prisma/client';

/**
 * Seeds the investment-committee meeting + packets + decision graph for
 * the demo Yeouido office and Gangseo data-center assets. Depends on the
 * asset and deal seeds running first (lookup by `assetCode` /
 * `dealCode`).
 */
export async function seedCommitteeGovernance(prisma: PrismaClient): Promise<void> {
  const meeting = await prisma.investmentCommitteeMeeting.create({
    data: {
      code: 'IC-2026-APR-15',
      title: 'April 2026 Korea Real Estate IC',
      status: 'SCHEDULED',
      scheduledFor: new Date('2026-04-15T01:00:00.000Z'),
      venueLabel: 'Seoul investment committee room',
      summary:
        'Agenda focused on office recapitalization approval and data-center packet conditioning before final lender circulation.'
    }
  });

  const [officeAsset, dataCenterAsset, officeDeal] = await Promise.all([
    prisma.asset.findUnique({
      where: { assetCode: 'SEOUL-YEOUIDO-01' },
      include: {
        valuations: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 1
        }
      }
    }),
    prisma.asset.findUnique({
      where: { assetCode: 'SEOUL-GANGSEO-01' },
      include: {
        valuations: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 1
        }
      }
    }),
    prisma.deal.findUnique({
      where: { dealCode: 'DEAL-2026-0001' }
    })
  ]);

  if (officeAsset?.valuations[0]) {
    await prisma.valuationRun.update({
      where: { id: officeAsset.valuations[0].id },
      data: {
        approvalStatus: 'APPROVED',
        approvedByLabel: 'IC prep admin',
        approvedAt: new Date('2026-04-11T00:00:00.000Z')
      }
    });

    await prisma.investmentCommitteePacket.create({
      data: {
        meetingId: meeting.id,
        assetId: officeAsset.id,
        dealId: officeDeal?.id ?? null,
        valuationRunId: officeAsset.valuations[0].id,
        title: 'Yeouido Core Office Tower Recapitalization Packet',
        packetCode: 'ICPKT-SEOUL-YEOUIDO-2026Q2',
        status: 'LOCKED',
        preparedByLabel: 'analyst@nexusseoul.local',
        scheduledFor: new Date('2026-04-15T01:00:00.000Z'),
        lockedAt: new Date('2026-04-12T09:00:00.000Z'),
        packetFingerprint: 'icpkt-yeouido-2026q2',
        reportFingerprint: 'report-yeouido-2026q2',
        reviewPacketFingerprint: 'review-yeouido-2026q2',
        decisionSummary:
          'Recommend approval for recapitalization and hold-business-plan execution subject to final debt documentation.'
      }
    });

    if (officeDeal) {
      await prisma.investmentCommitteePacket.create({
        data: {
          meetingId: meeting.id,
          assetId: officeAsset.id,
          dealId: officeDeal.id,
          valuationRunId: officeAsset.valuations[0].id,
          title: 'Yeouido Core Office Tower Supplemental Packet',
          packetCode: 'ICPKT-SEOUL-YEOUIDO-2026Q2-READY',
          status: 'READY',
          preparedByLabel: 'analyst@nexusseoul.local',
          scheduledFor: new Date('2026-04-15T01:00:00.000Z'),
          decisionSummary: 'Ready for lock once final specialist deliverables are linked.'
        }
      });
    }
  }

  if (dataCenterAsset?.valuations[0]) {
    const packet = await prisma.investmentCommitteePacket.create({
      data: {
        meetingId: meeting.id,
        assetId: dataCenterAsset.id,
        valuationRunId: dataCenterAsset.valuations[0].id,
        title: 'Seoul Hyperscale Campus I Conditional Approval Packet',
        packetCode: 'ICPKT-SEOUL-GANGSEO-2026Q2',
        status: 'CONDITIONAL',
        preparedByLabel: 'analyst@nexusseoul.local',
        scheduledFor: new Date('2026-04-15T01:00:00.000Z'),
        lockedAt: new Date('2026-04-10T08:30:00.000Z'),
        packetFingerprint: 'icpkt-gangseo-2026q2',
        reportFingerprint: 'report-gangseo-2026q2',
        reviewPacketFingerprint: 'review-gangseo-2026q2',
        decisionSummary:
          'Conditional approval pending final utility allocation confirmation and lender-side diligence closeout.',
        followUpSummary: 'Track utility allocation letter and close lender diligence package before release.'
      }
    });

    await prisma.investmentCommitteeDecision.create({
      data: {
        packetId: packet.id,
        outcome: 'CONDITIONAL',
        decidedAt: new Date('2026-04-15T03:00:00.000Z'),
        decidedByLabel: 'IC Chair',
        notes:
          'Proceed with conditional approval only after utility confirmation is uploaded and lender diligence is marked complete.',
        followUpActions:
          'Upload final utility allocation letter; re-open packet only if debt terms materially widen.'
      }
    });
  }
}
