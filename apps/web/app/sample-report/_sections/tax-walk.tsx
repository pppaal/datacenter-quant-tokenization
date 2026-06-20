import { formatCompactCurrencyFromKrwAtRate } from '@/lib/finance/currency';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { SampleReportData } from './types';

export function TaxWalkSection({ data }: { data: SampleReportData }) {
  const { displayCurrency, fxRateToKrw, taxWalk } = data;
  if (!(taxWalk.rows.length > 0)) {
    return null;
  }
  return (
    <section id="im-tax-walk" className="app-shell py-4">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">Tax leakage walk</div>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Cash-tax outflow over the hold — acquisition transfer, annual property tax, corporate
              income tax on operating earnings, exit transfer tax, and cross- border withholding.
              Lets the LP size the gross-to-net tax drag separately from the operating model.
            </p>
          </div>
          <Badge tone="warn">
            Total{' '}
            {formatCompactCurrencyFromKrwAtRate(
              taxWalk.totalCashOutflowKrw,
              displayCurrency,
              fxRateToKrw
            )}
          </Badge>
        </div>
        <div className="mt-5 overflow-x-auto rounded-[14px] border border-white/10">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2 font-semibold">Tax line</th>
                <th className="px-2 py-2 text-right font-semibold">Rate</th>
                <th className="px-2 py-2 text-right font-semibold">Base</th>
                <th className="px-2 py-2 text-right font-semibold">Cash outflow</th>
                <th className="px-2 py-2 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-200">
              {taxWalk.rows.map((row) => (
                <tr key={row.category}>
                  <td className="px-2 py-2 text-white">{row.label}</td>
                  <td className="px-2 py-2 text-right font-mono">{row.ratePct.toFixed(2)}%</td>
                  <td className="px-2 py-2 text-right font-mono text-slate-400">
                    {formatCompactCurrencyFromKrwAtRate(row.baseKrw, displayCurrency, fxRateToKrw)}
                    <div className="text-[9px] text-slate-500">{row.baseLabel}</div>
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {formatCompactCurrencyFromKrwAtRate(
                      row.totalCashOutflowKrw,
                      displayCurrency,
                      fxRateToKrw
                    )}
                  </td>
                  <td className="px-2 py-2 text-[10px] text-slate-400">{row.notes}</td>
                </tr>
              ))}
              <tr className="bg-white/[0.03]">
                <td className="px-2 py-2 font-semibold text-white" colSpan={3}>
                  Total
                </td>
                <td className="px-2 py-2 text-right font-mono font-semibold text-white">
                  {formatCompactCurrencyFromKrwAtRate(
                    taxWalk.totalCashOutflowKrw,
                    displayCurrency,
                    fxRateToKrw
                  )}
                </td>
                <td className="px-2 py-2 text-[10px] text-slate-500">
                  {taxWalk.effectiveDragOnGrossPct !== null
                    ? `≈ ${taxWalk.effectiveDragOnGrossPct.toFixed(1)}% drag on pre-tax gross profit (cumulative NOI + exit gain)`
                    : ''}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {taxWalk.basisCaveat ? (
          <p className="mt-3 rounded-[12px] border border-amber-300/20 bg-amber-300/[0.04] px-3 py-2 text-[10px] leading-5 text-amber-200">
            <span className="font-semibold uppercase tracking-wide text-amber-300">
              Basis caveat ·{' '}
            </span>
            {taxWalk.basisCaveat}
          </p>
        ) : null}
      </Card>
    </section>
  );
}
