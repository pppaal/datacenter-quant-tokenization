import { formatCompactCurrencyFromKrwAtRate } from '@/lib/finance/currency';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { SampleReportData } from './types';

export function CapitalCallsSection({ data }: { data: SampleReportData }) {
  const { displayCurrency, fxRateToKrw, capitalCalls } = data;
  if (!(capitalCalls && capitalCalls.rows.length > 0)) {
    return null;
  }
  return (
    <section id="im-capital-calls" className="app-shell py-4">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="eyebrow">Capital call schedule</div>
              <span className="rounded-[6px] border border-amber-300/30 bg-amber-300/[0.04] px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide text-amber-200">
                INDICATIVE
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Default 60 / 30 / reserve top-up split applied as a placeholder. The actual schedule
              is set by the LPA and varies materially by fund-vehicle structure (closed-end vs
              evergreen), draw-down period, and per-LP commitment size. Treat this as cash-staging
              guidance, not a covenant.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>
              Total commitment{' '}
              {formatCompactCurrencyFromKrwAtRate(
                capitalCalls.totalCommitmentKrw,
                displayCurrency,
                fxRateToKrw
              )}
            </Badge>
            <Badge tone="good">Upfront {capitalCalls.upfrontPctOfCommitment.toFixed(0)}%</Badge>
          </div>
        </div>
        <div className="mt-5 overflow-x-auto rounded-[14px] border border-[hsl(var(--border))]">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[hsl(var(--surface-hover))] text-left uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2 font-semibold">Call #</th>
                <th className="px-2 py-2 font-semibold">Period</th>
                <th className="px-2 py-2 font-semibold">Purpose</th>
                <th className="px-2 py-2 text-right font-semibold">Amount</th>
                <th className="px-2 py-2 text-right font-semibold">Cumulative</th>
                <th className="px-2 py-2 text-right font-semibold">% of commitment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--border))] text-slate-200">
              {capitalCalls.rows.map((row) => (
                <tr key={row.callNumber}>
                  <td className="px-2 py-2 font-mono text-slate-400">#{row.callNumber}</td>
                  <td className="px-2 py-2 text-slate-300">{row.yearLabel}</td>
                  <td className="px-2 py-2 text-[11px] text-slate-400">{row.purpose}</td>
                  <td className="px-2 py-2 text-right font-mono">
                    {formatCompactCurrencyFromKrwAtRate(
                      row.amountKrw,
                      displayCurrency,
                      fxRateToKrw
                    )}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-slate-400">
                    {formatCompactCurrencyFromKrwAtRate(
                      row.cumulativeKrw,
                      displayCurrency,
                      fxRateToKrw
                    )}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {row.cumulativePctOfCommitment.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {capitalCalls.remainingUncalledKrw > 0 ? (
          <p className="mt-3 text-[10px] text-slate-500">
            Remaining uncalled commitment:{' '}
            <span className="font-mono text-slate-300">
              {formatCompactCurrencyFromKrwAtRate(
                capitalCalls.remainingUncalledKrw,
                displayCurrency,
                fxRateToKrw
              )}
            </span>{' '}
            · final indicative call: {capitalCalls.estimatedFinalCallYear ?? '—'}
          </p>
        ) : null}
      </Card>
    </section>
  );
}
