import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { GradientBoostingRealizedBacktest } from '@/lib/services/forecast/realized-backtest';
import { formatDate, formatNumber, formatPercent } from '@/lib/utils';

export function ForecastRealizedBacktestPanel({
  backtest
}: {
  backtest: GradientBoostingRealizedBacktest;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="eyebrow">ML Forecast Validation</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Gradient boosting forecast vs realized outcomes</h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">
            Each row uses only the valuation history available at that run date, then compares the predicted 12-month
            drift against the first realized asset outcome that followed. This is the cleanest backtest for the learned
            forecast layer.
          </p>
        </div>
        <Badge tone={backtest.summary.matchedForecastCount > 0 ? 'good' : 'neutral'}>
          {backtest.summary.matchedForecastCount > 0 ? 'validated' : 'waiting for outcomes'}
        </Badge>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-4">
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="fine-print">Matched Forecasts</div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {formatNumber(backtest.summary.matchedForecastCount, 0)}
          </div>
          <p className="mt-2 text-sm text-slate-400">Run/outcome pairs with a valid ML forecast and realized result.</p>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="fine-print">Asset Coverage</div>
          <div className="mt-3 text-3xl font-semibold text-white">{formatNumber(backtest.summary.assetCoverage, 0)}</div>
          <p className="mt-2 text-sm text-slate-400">Distinct assets contributing to forecast validation.</p>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="fine-print">Directional Hit Rate</div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {backtest.summary.directionalHitRatePct === null ? 'N/A' : formatPercent(backtest.summary.directionalHitRatePct)}
          </div>
          <p className="mt-2 text-sm text-slate-400">How often the forecast got the sign of the value move right.</p>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div className="fine-print">Mean Abs Value Error</div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {backtest.summary.meanAbsoluteValueErrorPct === null ? 'N/A' : formatPercent(backtest.summary.meanAbsoluteValueErrorPct)}
          </div>
          <p className="mt-2 text-sm text-slate-400">
            {backtest.summary.meanAbsoluteDscrErrorPct === null
              ? 'DSCR error not available yet.'
              : `DSCR error ${formatPercent(backtest.summary.meanAbsoluteDscrErrorPct)}`}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {backtest.rows.length > 0 ? (
          backtest.rows.slice(0, 6).map((row) => (
            <Link
              key={`${row.runId}-${row.outcomeDate}`}
              href={`/admin/valuations/${row.runId}`}
              className="flex items-center justify-between gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20 hover:bg-white/[0.05]"
            >
              <div>
                <div className="text-sm font-semibold text-white">{row.assetName}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                  {row.assetCode} / {row.assetClass.replaceAll('_', ' ')} / outcome {formatDate(row.outcomeDate)}
                </div>
              </div>
              <div className="grid gap-2 text-right text-sm text-slate-300 md:grid-cols-4 md:text-left">
                <div>
                  <div className="fine-print">Horizon</div>
                  <div className="mt-1">{formatNumber(row.horizonDays, 0)}d</div>
                </div>
                <div>
                  <div className="fine-print">Predicted</div>
                  <div className="mt-1">{formatPercent(row.predictedValueChangePct)}</div>
                </div>
                <div>
                  <div className="fine-print">Actual</div>
                  <div className="mt-1">{formatPercent(row.actualValueChangePct)}</div>
                </div>
                <div>
                  <div className="fine-print">Error</div>
                  <div className="mt-1">{formatPercent(row.valueErrorPct)}</div>
                </div>
              </div>
            </Link>
          ))
        ) : (
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
            No run has enough sequential history plus a later realized outcome yet. Keep adding valuation history and
            realized observations.
          </div>
        )}
      </div>
    </Card>
  );
}
