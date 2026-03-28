import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDate, formatNumber } from '@/lib/utils';

type Props = {
  summary: {
    overdueDeals: number;
    dueSoonDeals: number;
    staleDeals: number;
    missingNextActionDeals: number;
    archivedDeals: number;
    reminders: Array<{
      id: string;
      dealCode: string;
      title: string;
      stage: string;
      reminder: string;
      nextActionAt: Date | null;
      nextDueAt: Date | null;
      overdueTaskCount: number;
      dueSoonTaskCount: number;
      isStale: boolean;
      checklistCompletionPct: number;
    }>;
  };
};

export function DealReminderPanel({ summary }: Props) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Deal Reminders</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">What needs operator attention now</h2>
        </div>
        <Link href="/admin/deals?view=actionable">
          <Button variant="ghost">Open Actionable Deals</Button>
        </Link>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-5">
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="fine-print">Overdue Deals</div>
          <div className="mt-3 text-3xl font-semibold text-white">{formatNumber(summary.overdueDeals, 0)}</div>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="fine-print">Due Soon</div>
          <div className="mt-3 text-3xl font-semibold text-white">{formatNumber(summary.dueSoonDeals, 0)}</div>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="fine-print">Missing Next Action</div>
          <div className="mt-3 text-3xl font-semibold text-white">{formatNumber(summary.missingNextActionDeals, 0)}</div>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="fine-print">Stale</div>
          <div className="mt-3 text-3xl font-semibold text-white">{formatNumber(summary.staleDeals, 0)}</div>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="fine-print">Archived</div>
          <div className="mt-3 text-3xl font-semibold text-white">{formatNumber(summary.archivedDeals, 0)}</div>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {summary.reminders.length > 0 ? (
          summary.reminders.map((deal) => (
            <Link
              key={deal.id}
              href={`/admin/deals/${deal.id}`}
              className="flex items-center justify-between gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20 hover:bg-white/[0.05]"
            >
              <div className="max-w-2xl">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-sm font-semibold text-white">{deal.title}</div>
                  <Badge>{deal.dealCode}</Badge>
                  <Badge tone={deal.overdueTaskCount > 0 ? 'danger' : deal.dueSoonTaskCount > 0 ? 'warn' : 'neutral'}>
                    {deal.stage.toLowerCase().replaceAll('_', ' ')}
                  </Badge>
                  {deal.isStale ? <Badge tone="warn">stale</Badge> : null}
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-300">{deal.reminder}</p>
              </div>
              <div className="grid gap-2 text-right text-sm text-slate-300 md:grid-cols-3 md:text-left">
                <div>
                  <div className="fine-print">Next Due</div>
                  <div className="mt-1">{formatDate(deal.nextDueAt ?? deal.nextActionAt)}</div>
                </div>
                <div>
                  <div className="fine-print">Overdue</div>
                  <div className="mt-1">{formatNumber(deal.overdueTaskCount, 0)}</div>
                </div>
                <div>
                  <div className="fine-print">Checklist</div>
                  <div className="mt-1">{formatNumber(deal.checklistCompletionPct, 0)}%</div>
                </div>
              </div>
            </Link>
          ))
        ) : (
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
            No immediate deal reminders right now.
          </div>
        )}
      </div>
    </Card>
  );
}
