import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { MacroBacktest } from '@/lib/services/macro/backtest';
import { formatDate, formatNumber } from '@/lib/utils';

function toneForHitRate(hitRatePct: number) {
  if (hitRatePct >= 70) return 'good' as const;
  if (hitRatePct <= 45) return 'warn' as const;
  return 'neutral' as const;
}

export function MacroBacktestPanel({ backtest }: { backtest: MacroBacktest }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Macro Backtest</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Forecast vs actual direction check</h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">
            Uses historical macro factor snapshots to measure whether the last observed macro direction held into the next observation. This is the first validation layer for the macro engine.
          </p>
        </div>
        <Badge tone={toneForHitRate(backtest.summary.overallHitRatePct)}>
          {formatNumber(backtest.summary.overallHitRatePct, 1)}% hit rate
        </Badge>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-4">
        {[
          ['Markets', formatNumber(backtest.summary.marketCoverage, 0), 'Markets with repeated factor history'],
          ['Transitions', formatNumber(backtest.summary.totalTransitions, 0), 'Direction checks against next observation'],
          ['Stable', formatNumber(backtest.summary.stableMarkets, 0), 'Markets above 70% hit rate'],
          ['Unstable', formatNumber(backtest.summary.unstableMarkets, 0), 'Markets below 45% hit rate']
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
            <div key={market.market} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-white">{market.market}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                    {market.latestObservationDate ? `latest ${formatDate(market.latestObservationDate)}` : 'history unavailable'}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={toneForHitRate(market.hitRatePct)}>{formatNumber(market.hitRatePct, 1)}% hit</Badge>
                  <Badge>{formatNumber(market.transitionCount, 0)} transitions</Badge>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-[160px_1fr_1fr]">
                <div className="rounded-[20px] border border-white/10 bg-slate-950/35 p-4">
                  <div className="fine-print">Coverage</div>
                  <div className="mt-3 text-2xl font-semibold text-white">{formatNumber(market.factorCoverage, 0)} factors</div>
                  <p className="mt-2 text-xs text-slate-500">
                    Stable {formatNumber(market.stableFactorCount, 0)} / Unstable {formatNumber(market.unstableFactorCount, 0)}
                  </p>
                </div>
                <div className="rounded-[20px] border border-white/10 bg-slate-950/35 p-4">
                  <div className="fine-print">Best Factor</div>
                  <div className="mt-3 text-base font-semibold text-white">{market.bestFactor?.label ?? 'N/A'}</div>
                  <p className="mt-2 text-xs text-slate-500">
                    {market.bestFactor
                      ? `${formatNumber(market.bestFactor.hitRatePct, 1)}% over ${formatNumber(market.bestFactor.transitionCount, 0)} transitions`
                      : 'No historical transitions yet'}
                  </p>
                </div>
                <div className="rounded-[20px] border border-white/10 bg-slate-950/35 p-4">
                  <div className="fine-print">Weakest Factor</div>
                  <div className="mt-3 text-base font-semibold text-white">{market.weakestFactor?.label ?? 'N/A'}</div>
                  <p className="mt-2 text-xs text-slate-500">
                    {market.weakestFactor
                      ? `${formatNumber(market.weakestFactor.hitRatePct, 1)}% over ${formatNumber(market.weakestFactor.transitionCount, 0)} transitions`
                      : 'No historical transitions yet'}
                  </p>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
            No repeated macro factor history yet. Keep ingesting macro observations to unlock forecast-vs-actual validation.
          </div>
        )}
      </div>
    </Card>
  );
}
