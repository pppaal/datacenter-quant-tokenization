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
  const conditionalPackets = packets.filter((packet) => packet.status === CommitteePacketStatus.CONDITIONAL);

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
    decisions.sort((left, right) => right.decidedAt.getTime() - left.decidedAt.getTime())[0] ?? null;

  return {
    summary: {
      meetingCount: meetings.length,
      scheduledCount: meetings.filter((meeting) => meeting.status === CommitteeMeetingStatus.SCHEDULED).length,
      activePacketCount: packets.filter((packet) => activeStatuses.has(packet.status as CommitteePacketStatus)).length,
      lockedCount: packets.filter((packet) => packet.status === CommitteePacketStatus.LOCKED).length,
      releasedCount: packets.filter((packet) => packet.status === CommitteePacketStatus.RELEASED).length,
      candidateCount: candidates.length
    },
    latestDecision,
    actionItems: buildCommitteeActionItems(meetings, packets, candidates)
  };
}
