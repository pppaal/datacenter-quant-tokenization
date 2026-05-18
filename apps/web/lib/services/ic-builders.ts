import { CommitteeMeetingStatus, CommitteePacketStatus } from '@prisma/client';
import { formatDate } from '@/lib/utils';

type ActionItem = {
  key: string;
  area: 'IC' | 'DEALS' | 'PORTFOLIO' | 'FUNDS' | 'RESEARCH' | 'REVIEW' | 'SECURITY';
  title: string;
  detail: string;
  href: string;
  priority: 'critical' | 'high' | 'medium';
  dueLabel?: string;
};

type MeetingLike = {
  id: string;
  title: string;
  status: CommitteeMeetingStatus | `${CommitteeMeetingStatus}`;
  scheduledFor: Date | null;
  packets: Array<unknown>;
};

type DecisionLike = {
  outcome: string;
  decidedAt: Date;
};

type PacketLike = {
  id: string;
  title: string;
  status: CommitteePacketStatus | `${CommitteePacketStatus}`;
  decisions: DecisionLike[];
};

type CandidateLike = {
  id: string;
  name: string;
  leadDeal?: {
    id: string;
    dealCode: string;
  } | null;
  diligenceSummary?: {
    signedOffCount: number;
    deliverableCount: number;
    coreRequiredTypes: Array<string>;
    missingCoreTypes: Array<string>;
    uncoveredCoreTypes: Array<string>;
    blockedCount: number;
  } | null;
};

export function buildCommitteeActionItems(
  meetings: MeetingLike[],
  packets: PacketLike[],
  candidates: CandidateLike[]
) {
  const items: ActionItem[] = [];

  const nextMeeting = meetings.find(
    (meeting) => meeting.status === CommitteeMeetingStatus.SCHEDULED && meeting.scheduledFor
  );
  const lockedPackets = packets.filter((packet) => packet.status === CommitteePacketStatus.LOCKED);
  const conditionalPackets = packets.filter(
    (packet) => packet.status === CommitteePacketStatus.CONDITIONAL
  );

  if (nextMeeting) {
    items.push({
      key: `meeting:${nextMeeting.id}`,
      area: 'IC',
      title: `${nextMeeting.title} is the next committee meeting`,
      detail: `${nextMeeting.packets.length} packet(s) are on the agenda. Confirm packet lock status and final decision asks before circulation.`,
      href: '/admin/ic',
      priority: lockedPackets.length > 0 ? 'high' : 'medium',
      dueLabel: nextMeeting.scheduledFor ? formatDate(nextMeeting.scheduledFor) : undefined
    });
  }

  if (lockedPackets.length > 0) {
    const leadPacket = lockedPackets[0];
    items.push({
      key: `packet:${leadPacket.id}`,
      area: 'IC',
      title: `${lockedPackets.length} packet(s) are locked and awaiting decision`,
      detail: `${leadPacket.title} is ready for committee circulation. Confirm final ask, downside framing, and follow-up owner.`,
      href: '/admin/ic',
      priority: 'critical'
    });
  }

  if (conditionalPackets.length > 0) {
    const leadPacket = conditionalPackets[0];
    items.push({
      key: `conditional:${leadPacket.id}`,
      area: 'IC',
      title: `${conditionalPackets.length} packet(s) are under conditional approval`,
      detail: `${leadPacket.title} still carries follow-up actions before it can move to released committee status.`,
      href: '/admin/ic',
      priority: 'high'
    });
  }

  if (candidates.length > 0) {
    const leadCandidate = candidates[0];
    items.push({
      key: `candidate:${leadCandidate.id}`,
      area: 'IC',
      title: `${candidates.length} candidate asset(s) are ready to be packaged`,
      detail: `${leadCandidate.name} has a current valuation but no active committee packet. Move it into the agenda once the decision request is clear.`,
      href: '/admin/ic',
      priority: 'medium'
    });
  }

  const diligenceGapCandidates = candidates.filter((candidate) => {
    const summary = candidate.diligenceSummary;
    return summary && (summary.missingCoreTypes.length > 0 || summary.blockedCount > 0);
  });

  if (diligenceGapCandidates.length > 0) {
    const leadCandidate = diligenceGapCandidates[0];
    const summary = leadCandidate.diligenceSummary!;
    items.push({
      key: `candidate-dd:${leadCandidate.id}`,
      area: 'IC',
      title: `${diligenceGapCandidates.length} packet candidate(s) still have specialist DD gaps`,
      detail:
        summary.blockedCount > 0
          ? `${leadCandidate.name} still has ${summary.blockedCount} blocked specialist lane(s). Clear them before packet lock.`
          : `${leadCandidate.name} is still missing ${summary.missingCoreTypes.length} core DD lane(s) before committee packaging.`,
      href: '/admin/ic',
      priority: 'high'
    });
  }

  const deliverableGapCandidates = candidates.filter((candidate) => {
    const summary = candidate.diligenceSummary;
    return summary && summary.uncoveredCoreTypes.length > 0;
  });

  if (deliverableGapCandidates.length > 0) {
    const leadCandidate = deliverableGapCandidates[0];
    const summary = leadCandidate.diligenceSummary!;
    items.push({
      key: `candidate-deliverables:${leadCandidate.id}`,
      area: 'IC',
      title: `${deliverableGapCandidates.length} packet candidate(s) still need specialist deliverables linked`,
      detail: `${leadCandidate.name} is missing supporting deliverables for ${summary.uncoveredCoreTypes.length} core DD lane(s). Link workpapers before packet lock.`,
      href: '/admin/ic',
      priority: 'high'
    });
  }

  return items;
}

export function buildCommitteeDashboard(
  meetings: MeetingLike[],
  packets: PacketLike[],
  candidates: CandidateLike[]
) {
  const activeStatuses = new Set<CommitteePacketStatus>([
    CommitteePacketStatus.DRAFT,
    CommitteePacketStatus.READY,
    CommitteePacketStatus.LOCKED,
    CommitteePacketStatus.CONDITIONAL
  ]);
  const decisions = packets.flatMap((packet) => packet.decisions);
  const latestDecision =
    decisions.sort((left, right) => right.decidedAt.getTime() - left.decidedAt.getTime())[0] ??
    null;

  return {
    summary: {
      meetingCount: meetings.length,
      scheduledCount: meetings.filter(
        (meeting) => meeting.status === CommitteeMeetingStatus.SCHEDULED
      ).length,
      activePacketCount: packets.filter((packet) =>
        activeStatuses.has(packet.status as CommitteePacketStatus)
      ).length,
      lockedCount: packets.filter((packet) => packet.status === CommitteePacketStatus.LOCKED)
        .length,
      releasedCount: packets.filter((packet) => packet.status === CommitteePacketStatus.RELEASED)
        .length,
      candidateCount: candidates.length
    },
    latestDecision,
    actionItems: buildCommitteeActionItems(meetings, packets, candidates)
  };
}
