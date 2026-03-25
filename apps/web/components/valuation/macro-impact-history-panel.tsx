import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { MacroImpactHistory } from '@/lib/services/macro/history';
import { cn, formatDate, formatNumber } from '@/lib/utils';

function toneForImpact(direction: string | null) {
  if (direction === 'TAILWIND') return 'good' as const;
  if (direction === 'HEADWIND') return 'warn' as const;
  return 'neutral' as const;
}

function widthForScore(score: number) {
  return `${Math.max(Math.min(Math.abs(score) * 24, 100), 8)}%`;
}

export function MacroImpactHistoryPanel({ history }: { history: MacroImpactHistory | null }) {
  if (!history || history.points.length < 2) return null;

  return (
    <Card className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Macro Impact History</div>
          <h3 className="mt-2 text-xl font-semibold text-white">Transmission Trend Across Recent Runs</h3>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">
            Tracks how macro transmission scores moved as the market changed and the underwriting view was refreshed.
          </p>
        </div>
        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
          {history.asOf ? `latest ${formatDate(history.asOf)}` : 'history unavailable'}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {history.series.map((series) => (
          <div key={series.key} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="fine-print">{series.label}</div>
                <div className="mt-2 text-2xl font-semibold text-white">{formatNumber(series.latestScore, 2)}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={toneForImpact(series.latestDirection)}>
                  {series.latestDirection?.toLowerCase() ?? 'neutral'}
                </Badge>
                <Badge>
                  {series.deltaVsPrevious === null
                    ? 'n/a'
                    : `${series.deltaVsPrevious > 0 ? '+' : ''}${formatNumber(series.deltaVsPrevious, 2)} vs prior`}
                </Badge>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {series.points.map((point) => (
                <div key={point.runId} className="grid gap-2 md:grid-cols-[140px_1fr_86px] md:items-center">
                  <div className="text-xs uppercase tracking-[0.12em] text-slate-500">
                    <div>{formatDate(point.createdAt)}</div>
                    <div className="mt-1 truncate text-[11px]">{point.runLabel}</div>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-900/80">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        point.score >= 0.4
                          ? 'bg-emerald-400/80'
                          : point.score <= -0.4
                            ? 'bg-amber-300/80'
                            : 'bg-slate-400/70'
                      )}
                      style={{ width: widthForScore(point.score) }}
                    />
                  </div>
                  <div className="text-right text-sm font-semibold text-white">{formatNumber(point.score, 2)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
