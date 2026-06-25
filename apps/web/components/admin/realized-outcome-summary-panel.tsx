import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { RealizedOutcomeSummary } from '@/lib/services/realized-outcomes';
import { formatDate, formatNumber, formatPercent } from '@/lib/utils';

export function RealizedOutcomeSummaryPanel({ summary }: { summary: RealizedOutcomeSummary }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Realized Validation</div>
          <h2 className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">
            Actual asset outcomes vs latest runs
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-[hsl(var(--muted))]">
            Macro and forecast quality needs real-world asset outcomes. This panel tracks the gap
            between the latest underwriting run and the first realized observation that followed it.
          </p>
        </div>
        <Badge tone={summary.matchedRunCount > 0 ? 'good' : 'neutral'}>
          {summary.matchedRunCount > 0
            ? `${summary.matchedRunCount} matched runs`
            : 'waiting for outcomes'}
        </Badge>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-4">
        <div className="rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-5">
          <div className="fine-print">Asset Coverage</div>
          <div className="mt-3 text-3xl font-semibold text-[hsl(var(--foreground))]">
            {formatNumber(summary.assetCoverage, 0)}
          </div>
          <p className="mt-2 text-sm text-[hsl(var(--muted))]">
            Assets with at least one realized outcome stored.
          </p>
        </div>
        <div className="rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-5">
          <div className="fine-print">Matched Runs</div>
          <div className="mt-3 text-3xl font-semibold text-[hsl(var(--foreground))]">
            {formatNumber(summary.matchedRunCount, 0)}
          </div>
          <p className="mt-2 text-sm text-[hsl(var(--muted))]">
            Latest runs that already have a later realized outcome.
          </p>
        </div>
        <div className="rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-5">
          <div className="fine-print">Avg Value Move</div>
          <div className="mt-3 text-3xl font-semibold text-[hsl(var(--foreground))]">
            {summary.meanAbsoluteValueChangePct === null
              ? 'N/A'
              : formatPercent(summary.meanAbsoluteValueChangePct)}
          </div>
          <p className="mt-2 text-sm text-[hsl(var(--muted))]">
            Average absolute move from base case to realized value.
          </p>
        </div>
        <div className="rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-5">
          <div className="fine-print">Avg DSCR Move</div>
          <div className="mt-3 text-3xl font-semibold text-[hsl(var(--foreground))]">
            {summary.meanAbsoluteDscrChangePct === null
              ? 'N/A'
              : formatPercent(summary.meanAbsoluteDscrChangePct)}
          </div>
          <p className="mt-2 text-sm text-[hsl(var(--muted))]">
            Average absolute drift from base DSCR to realized DSCR.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {summary.watchlist.length > 0 ? (
          summary.watchlist.map((item) => (
            <Link
              key={`${item.runId}-${item.observationDate}`}
              href={`/admin/valuations/${item.runId}`}
              className="flex items-center justify-between gap-4 rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-5 transition hover:border-[hsl(var(--border-strong))] hover:bg-[hsl(var(--surface-hover))]"
            >
              <div>
                <div className="text-sm font-semibold text-[hsl(var(--foreground))]">
                  {item.assetName}
                </div>
                <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[hsl(var(--muted))]">
                  {item.assetCode} / observed {formatDate(item.observationDate)}
                </div>
              </div>
              <div className="grid gap-2 text-right text-sm text-[hsl(var(--foreground-muted))] md:grid-cols-3 md:text-left">
                <div>
                  <div className="fine-print">Horizon</div>
                  <div className="mt-1">{formatNumber(item.horizonDays, 0)}d</div>
                </div>
                <div>
                  <div className="fine-print">Value Move</div>
                  <div className="mt-1">
                    {item.actualValueChangePct === null
                      ? 'N/A'
                      : formatPercent(item.actualValueChangePct)}
                  </div>
                </div>
                <div>
                  <div className="fine-print">DSCR Move</div>
                  <div className="mt-1">
                    {item.actualDscrChangePct === null
                      ? 'N/A'
                      : formatPercent(item.actualDscrChangePct)}
                  </div>
                </div>
              </div>
            </Link>
          ))
        ) : (
          <div className="rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-5 text-sm text-[hsl(var(--muted))]">
            No realized-vs-modeled comparisons yet. Start capturing actual occupancy, NOI, value,
            and DSCR on the asset pages.
          </div>
        )}
      </div>
    </Card>
  );
}
