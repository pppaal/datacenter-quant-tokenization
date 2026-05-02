import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatCurrency, formatNumber, formatPercent, toSentenceCase } from '@/lib/utils';
import type { OperatorDashboardData } from '@/lib/services/operator-dashboard';

type Props = {
  data: OperatorDashboardData;
};

function formatRelativeTimestamp(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  }).format(date);
}

function stageLabel(stage: string): string {
  if (stage === 'DD') return 'Diligence';
  if (stage === 'IC') return 'Committee';
  if (stage === 'LOI') return 'LOI';
  if (stage === 'NDA') return 'NDA';
  if (stage === 'ASSET_MANAGEMENT') return 'Asset Mgmt';
  return toSentenceCase(stage);
}

export function OperatorDashboardPanel({ data }: Props) {
  const { pipeline, portfolio, capital, actionItems, recentActivity } = data;
  const maxStageCount = Math.max(1, pipeline.maxStageCount);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="metric-card">
          <div className="fine-print">Total AUM</div>
          <div className="mt-3 text-4xl font-semibold text-white">
            {formatCurrency(portfolio.totalAumKrw)}
          </div>
          <p className="mt-2 text-sm text-slate-400">
            Avg NOI yield{' '}
            {portfolio.avgNoiYieldPct > 0 ? `${portfolio.avgNoiYieldPct.toFixed(1)}%` : 'N/A'}
          </p>
        </div>
        <div className="metric-card">
          <div className="fine-print">Active Deals</div>
          <div className="mt-3 text-4xl font-semibold text-cyan-300">
            {formatNumber(pipeline.totalActive, 0)}
          </div>
          <p className="mt-2 text-sm text-slate-400">
            Across {pipeline.stages.filter((s) => s.count > 0).length} pipeline stages
          </p>
        </div>
        <div className="metric-card">
          <div className="fine-print">Portfolio Assets</div>
          <div className="mt-3 text-4xl font-semibold text-emerald-300">
            {formatNumber(portfolio.totalAssets, 0)}
          </div>
          <p className="mt-2 text-sm text-slate-400">
            Avg occupancy{' '}
            {portfolio.avgOccupancyPct > 0 ? formatPercent(portfolio.avgOccupancyPct) : 'N/A'}
          </p>
        </div>
        <div className="metric-card">
          <div className="fine-print">Committed Capital</div>
          <div className="mt-3 text-4xl font-semibold text-amber-300">
            {formatCurrency(capital.totalCommittedKrw)}
          </div>
          <p className="mt-2 text-sm text-slate-400">
            Called {formatCurrency(capital.totalCalledKrw)} / Distributed{' '}
            {formatCurrency(capital.totalDistributedKrw)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="eyebrow">Deal Pipeline</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Stage distribution</h2>
            </div>
            <Badge tone={pipeline.totalActive > 0 ? 'good' : 'neutral'}>
              {formatNumber(pipeline.totalActive, 0)} active
            </Badge>
          </div>
          <div className="mt-5 space-y-3">
            {pipeline.totalActive === 0 ? (
              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
                No live deals in the pipeline yet. Seed a sourced opportunity to populate the
                funnel.
              </div>
            ) : (
              pipeline.stages.map((stage) => {
                const widthPct =
                  stage.count === 0 ? 0 : Math.max(6, (stage.count / maxStageCount) * 100);
                return (
                  <div
                    key={stage.stage}
                    className="rounded-[20px] border border-white/10 bg-slate-950/35 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-white">
                        {stageLabel(stage.stage)}
                      </div>
                      <div className="font-mono text-sm text-slate-300">
                        {formatNumber(stage.count, 0)}
                      </div>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.05]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400/60 via-cyan-300/80 to-emerald-300/70"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="eyebrow">Action Items</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                Queues needing operator attention
              </h2>
            </div>
            <Badge
              tone={
                actionItems.some((item) => item.severity === 'danger')
                  ? 'danger'
                  : actionItems.some((item) => item.severity === 'warn')
                    ? 'warn'
                    : 'good'
              }
            >
              {actionItems.reduce((sum, item) => sum + item.count, 0)} total
            </Badge>
          </div>
          <div className="mt-5 grid gap-3">
            {actionItems.every((item) => item.count === 0) ? (
              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
                All queues are clear. Committee, research, task, and diligence workflows are up to
                date.
              </div>
            ) : (
              actionItems.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="rounded-[22px] border border-white/10 bg-slate-950/35 p-4 transition hover:border-white/20 hover:bg-white/[0.05]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge
                          tone={
                            item.severity === 'danger'
                              ? 'danger'
                              : item.severity === 'warn'
                                ? 'warn'
                                : 'good'
                          }
                        >
                          {item.severity === 'good' ? 'clear' : item.severity}
                        </Badge>
                      </div>
                      <div className="mt-3 text-sm font-semibold text-white">{item.label}</div>
                      <p className="mt-1 text-sm leading-6 text-slate-400">{item.description}</p>
                    </div>
                    <div className="text-right">
                      <div
                        className={
                          item.severity === 'danger'
                            ? 'text-3xl font-semibold text-rose-300'
                            : item.severity === 'warn'
                              ? 'text-3xl font-semibold text-amber-300'
                              : 'text-3xl font-semibold text-emerald-300'
                        }
                      >
                        {formatNumber(item.count, 0)}
                      </div>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="eyebrow">Recent Activity</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Latest audit events</h2>
          </div>
          <Badge tone={recentActivity.length > 0 ? 'good' : 'neutral'}>
            {recentActivity.length} events
          </Badge>
        </div>
        <div className="mt-5 grid gap-2">
          {recentActivity.length === 0 ? (
            <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
              No audit events recorded yet. Operator actions will appear here as they happen.
            </div>
          ) : (
            recentActivity.map((event) => (
              <div
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-white/10 bg-slate-950/35 p-4"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <Badge
                    tone={
                      event.statusLabel === 'SUCCESS'
                        ? 'good'
                        : event.statusLabel === 'FAILURE' || event.statusLabel === 'ERROR'
                          ? 'danger'
                          : 'neutral'
                    }
                  >
                    {event.entityType}
                  </Badge>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{event.action}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                      {event.actor}
                      {event.entityId ? ` / ${event.entityId}` : ''}
                    </div>
                  </div>
                </div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  {formatRelativeTimestamp(event.createdAt)}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
