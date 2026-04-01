import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { DealCloseProbabilityHistoryPoint } from '@/lib/services/deals';
import { formatDate, formatNumber } from '@/lib/utils';

type Props = {
  history: DealCloseProbabilityHistoryPoint[];
};

function getBandTone(band: DealCloseProbabilityHistoryPoint['band']) {
  if (band === 'HIGH') return 'good' as const;
  if (band === 'MEDIUM') return 'warn' as const;
  return 'danger' as const;
}

export function DealCloseProbabilityHistoryPanel({ history }: Props) {
  const latest = history[0] ?? null;
  const previous = history[1] ?? null;
  const delta = latest && previous ? latest.scorePct - previous.scorePct : null;

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Close Probability History</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">How execution certainty is moving</h2>
        </div>
        {latest ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={getBandTone(latest.band)}>
              {formatNumber(latest.scorePct, 0)}% {latest.band.toLowerCase()}
            </Badge>
            {delta !== null ? (
              <Badge tone={delta > 0 ? 'good' : delta < 0 ? 'danger' : 'neutral'}>
                {delta > 0 ? '+' : ''}
                {formatNumber(delta, 0)} pts vs prior
              </Badge>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="metric-card">
          <div className="fine-print">Latest P(Close)</div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {latest ? `${formatNumber(latest.scorePct, 0)}%` : 'N/A'}
          </div>
        </div>
        <div className="metric-card">
          <div className="fine-print">Latest Readiness</div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {latest ? `${formatNumber(latest.readinessScorePct, 0)}%` : 'N/A'}
          </div>
        </div>
        <div className="metric-card">
          <div className="fine-print">Current Blockers</div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {latest ? formatNumber(latest.blockerCount, 0) : '0'}
          </div>
        </div>
        <div className="metric-card">
          <div className="fine-print">Latest Snapshot</div>
          <div className="mt-3 text-base font-semibold text-white">{formatDate(latest?.createdAt ?? null)}</div>
          <p className="mt-2 text-sm text-slate-400">{latest?.reason ?? 'No snapshots yet.'}</p>
        </div>
      </div>

      <div className="grid gap-3">
        {history.length > 0 ? (
          history.map((point, index) => {
            const prior = history[index + 1] ?? null;
            const move = prior ? point.scorePct - prior.scorePct : null;
            return (
              <div
                key={point.id}
                className="flex items-start justify-between gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
              >
                <div className="max-w-2xl">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-sm font-semibold text-white">{point.reason}</div>
                    <Badge tone={getBandTone(point.band)}>{point.band.toLowerCase()}</Badge>
                    <Badge>{point.stage.toLowerCase().replaceAll('_', ' ')}</Badge>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{point.headline}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {point.flags.length > 0 ? (
                      point.flags.map((flag) => <Badge key={flag}>{flag}</Badge>)
                    ) : (
                      <Badge tone="neutral">no execution flags</Badge>
                    )}
                  </div>
                </div>
                <div className="grid gap-2 text-right text-sm text-slate-300 md:grid-cols-4 md:text-left">
                  <div>
                    <div className="fine-print">As Of</div>
                    <div className="mt-1">{formatDate(point.createdAt)}</div>
                  </div>
                  <div>
                    <div className="fine-print">P(Close)</div>
                    <div className="mt-1">
                      {formatNumber(point.scorePct, 0)}%
                      {move !== null ? ` / ${move > 0 ? '+' : ''}${formatNumber(move, 0)} pts` : ''}
                    </div>
                  </div>
                  <div>
                    <div className="fine-print">Readiness</div>
                    <div className="mt-1">{formatNumber(point.readinessScorePct, 0)}%</div>
                  </div>
                  <div>
                    <div className="fine-print">Risks / Overdue / DD</div>
                    <div className="mt-1">
                      {formatNumber(point.openRiskCount, 0)} / {formatNumber(point.overdueTaskCount, 0)} /{' '}
                      {formatNumber(point.pendingSuggestedRequestCount, 0)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
            No execution probability snapshots yet. The first new stage, task, risk, bid, lender, or negotiation update will start the trend.
          </div>
        )}
      </div>
    </Card>
  );
}
