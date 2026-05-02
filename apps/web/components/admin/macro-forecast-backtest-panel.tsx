import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { MacroForecastBacktest } from '@/lib/services/macro/forecast-backtest';
import { formatDate, formatNumber } from '@/lib/utils';

function toneForHitRate(hitRatePct: number) {
  if (hitRatePct >= 65) return 'good' as const;
  if (hitRatePct <= 45) return 'warn' as const;
  return 'neutral' as const;
}

export function MacroForecastBacktestPanel({ backtest }: { backtest: MacroForecastBacktest }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Macro Forecast vs Actual</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            One-step value prediction check
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">
            Uses a simple momentum forecast on macro factor values and compares the predicted next
            reading against the realized next reading. This is the first numeric forecast validation
            layer.
          </p>
        </div>
        <Badge tone={toneForHitRate(backtest.summary.directionalHitRatePct)}>
          {formatNumber(backtest.summary.directionalHitRatePct, 1)}% direction hit
        </Badge>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-4">
        {[
          [
            'Markets',
            formatNumber(backtest.summary.marketCoverage, 0),
            'Markets with forecast samples'
          ],
          [
            'Samples',
            formatNumber(backtest.summary.sampleCount, 0),
            'Predicted-next vs actual-next checks'
          ],
          [
            'Direction',
            formatNumber(backtest.summary.directionalHitRatePct, 1) + '%',
            'How often the move direction matched'
          ],
          [
            'Mean Error',
            formatNumber(backtest.summary.meanAbsoluteErrorPct, 1) + '%',
            'Average normalized next-value error'
          ]
        ].map(([label, value, subline]) => (
          <div key={label} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
            <div className="fine-print">{label}</div>
            <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
            <p className="mt-2 text-sm text-slate-400">{subline}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4">
        {backtest.markets.length > 0 ? (
          backtest.markets.slice(0, 6).map((market) => (
            <div
              key={market.market}
              className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-white">{market.market}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                    {market.latestActualDate
                      ? `latest ${formatDate(market.latestActualDate)}`
                      : 'history unavailable'}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={toneForHitRate(market.directionalHitRatePct)}>
                    {formatNumber(market.directionalHitRatePct, 1)}% direction
                  </Badge>
                  <Badge>{formatNumber(market.meanAbsoluteErrorPct, 1)}% mae</Badge>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-[160px_1fr_1fr]">
                <div className="rounded-[20px] border border-white/10 bg-slate-950/35 p-4">
                  <div className="fine-print">Coverage</div>
                  <div className="mt-3 text-2xl font-semibold text-white">
                    {formatNumber(market.factorCoverage, 0)} factors
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {formatNumber(market.sampleCount, 0)} forecast samples
                  </p>
                </div>
                <div className="rounded-[20px] border border-white/10 bg-slate-950/35 p-4">
                  <div className="fine-print">Strongest Factor</div>
                  <div className="mt-3 text-base font-semibold text-white">
                    {market.strongestFactor?.label ?? 'N/A'}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {market.strongestFactor
                      ? `${formatNumber(market.strongestFactor.directionalHitRatePct, 1)}% hit / ${formatNumber(market.strongestFactor.meanAbsoluteErrorPct, 1)}% mae`
                      : 'No forecast samples yet'}
                  </p>
                </div>
                <div className="rounded-[20px] border border-white/10 bg-slate-950/35 p-4">
                  <div className="fine-print">Weakest Factor</div>
                  <div className="mt-3 text-base font-semibold text-white">
                    {market.weakestFactor?.label ?? 'N/A'}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {market.weakestFactor
                      ? `${formatNumber(market.weakestFactor.directionalHitRatePct, 1)}% hit / ${formatNumber(market.weakestFactor.meanAbsoluteErrorPct, 1)}% mae`
                      : 'No forecast samples yet'}
                  </p>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
            No factor history long enough to run forecast-vs-actual checks yet.
          </div>
        )}
      </div>
    </Card>
  );
}
