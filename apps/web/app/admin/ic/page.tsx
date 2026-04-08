import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getCommitteeWorkspace } from '@/lib/services/ic';
import { formatDate, formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function CommitteeWorkspacePage() {
  const workspace = await getCommitteeWorkspace();

  return (
    <div className="space-y-8">
      <section className="surface hero-mesh">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="warn">IC Governance</Badge>
          <Badge>{formatNumber(workspace.dashboard.summary.activePacketCount, 0)} active packets</Badge>
        </div>
        <h1 className="mt-3 text-5xl font-semibold leading-[0.96] tracking-[-0.05em] text-white md:text-6xl">
          Lock committee packets, run agendas, and preserve decision lineage.
        </h1>
        <p className="mt-4 max-w-4xl text-base leading-8 text-slate-200">
          IC governance sits between review-ready underwriting and released investment decisions. Packet state, meeting
          schedule, and the latest decisions stay linked to the same approved evidence and valuation set.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="metric-card">
            <div className="fine-print">Scheduled Meetings</div>
            <div className="mt-3 text-4xl font-semibold text-white">{formatNumber(workspace.dashboard.summary.scheduledCount, 0)}</div>
          </div>
          <div className="metric-card">
            <div className="fine-print">Locked Packets</div>
            <div className="mt-3 text-4xl font-semibold text-white">{formatNumber(workspace.dashboard.summary.lockedCount, 0)}</div>
          </div>
          <div className="metric-card">
            <div className="fine-print">Released Decisions</div>
            <div className="mt-3 text-4xl font-semibold text-white">{formatNumber(workspace.dashboard.summary.releasedCount, 0)}</div>
          </div>
          <div className="metric-card">
            <div className="fine-print">Packaging Candidates</div>
            <div className="mt-3 text-4xl font-semibold text-white">{formatNumber(workspace.dashboard.summary.candidateCount, 0)}</div>
          </div>
        </div>
      </section>

      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="eyebrow">Action Queue</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Committee priorities</h2>
          </div>
        </div>
        <div className="mt-5 grid gap-3">
          {workspace.dashboard.actionItems.length > 0 ? (
            workspace.dashboard.actionItems.map((item) => (
              <Link key={item.key} href={item.href} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/20 hover:bg-white/[0.05]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{item.area}</Badge>
                      <Badge tone={item.priority === 'critical' ? 'danger' : item.priority === 'high' ? 'warn' : 'neutral'}>
                        {item.priority}
                      </Badge>
                    </div>
                    <div className="mt-3 text-lg font-semibold text-white">{item.title}</div>
                    <p className="mt-2 text-sm leading-7 text-slate-300">{item.detail}</p>
                  </div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{item.dueLabel ?? 'open'}</div>
                </div>
              </Link>
            ))
          ) : (
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
              No committee action items are open. Review-ready assets can be packaged once a decision request is defined.
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <div className="eyebrow">Agenda</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Scheduled meetings</h2>
          <div className="mt-5 space-y-3">
            {workspace.meetings.length > 0 ? (
              workspace.meetings.map((meeting) => (
                <div key={meeting.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-white">{meeting.title}</div>
                      <div className="mt-1 text-sm text-slate-400">{meeting.code}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{meeting.status.toLowerCase()}</Badge>
                      <Badge tone="neutral">{meeting.scheduledFor ? formatDate(meeting.scheduledFor) : 'unscheduled'}</Badge>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{meeting.summary ?? 'No meeting summary recorded yet.'}</p>
                  <div className="mt-3 grid gap-2">
                    {meeting.packets.map((packet) => (
                      <div key={packet.id} className="rounded-[18px] border border-white/10 bg-slate-950/35 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-white">{packet.title}</div>
                          <Badge tone={packet.status === 'LOCKED' ? 'warn' : packet.status === 'RELEASED' ? 'good' : 'neutral'}>
                            {packet.status.toLowerCase()}
                          </Badge>
                        </div>
                        <div className="mt-2 text-xs text-slate-400">
                          {packet.asset?.assetCode ?? 'no asset'} / {packet.valuationRun?.runLabel ?? 'no valuation linked'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                No committee meetings have been scheduled yet.
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="eyebrow">Packaging Queue</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Assets ready for packet assembly</h2>
          <div className="mt-5 space-y-3">
            {workspace.candidates.length > 0 ? (
              workspace.candidates.map((candidate) => (
                <div key={candidate.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-white">{candidate.name}</div>
                      <div className="mt-1 text-sm text-slate-400">{candidate.assetCode}</div>
                    </div>
                    <Badge tone="warn">{candidate.status.toLowerCase().replaceAll('_', ' ')}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-slate-300">
                    {candidate.valuations[0]
                      ? `${candidate.valuations[0].runLabel} is available for committee packaging.`
                      : 'No valuation run is available yet.'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Link href={`/admin/assets/${candidate.id}`}>
                      <Button variant="secondary">Open Asset</Button>
                    </Link>
                    <Link href={`/admin/assets/${candidate.id}/reports`}>
                      <Button variant="secondary">Open Reports</Button>
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                No additional IC-ready assets are waiting to be packaged.
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <div className="eyebrow">Decision Log</div>
        <h2 className="mt-2 text-2xl font-semibold text-white">Latest packet outcomes</h2>
        <div className="mt-5 grid gap-3">
          {workspace.packets.slice(0, 8).map((packet) => {
            const latestDecision = packet.decisions[0] ?? null;
            return (
              <div key={packet.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-white">{packet.title}</div>
                    <div className="mt-1 text-sm text-slate-400">{packet.packetCode}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{packet.status.toLowerCase()}</Badge>
                    <Badge tone="neutral">{formatDate(packet.updatedAt)}</Badge>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  {packet.decisionSummary ?? packet.followUpSummary ?? 'No decision note recorded yet.'}
                </p>
                {latestDecision ? (
                  <div className="mt-3 text-xs text-slate-400">
                    Latest decision: {latestDecision.outcome.toLowerCase()} / {formatDate(latestDecision.decidedAt)} /{' '}
                    {latestDecision.decidedByLabel ?? 'committee'}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
