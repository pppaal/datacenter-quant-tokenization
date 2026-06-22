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
            <p className="mt-2 max-w-3xl text-sm text-[hsl(var(--foreground-muted))]">
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
        <div className="mt-5 overflow-x-auto rounded-[14px] border border-[hsl(var(--border))]">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[hsl(var(--surface-hover))] text-left uppercase tracking-wide text-[hsl(var(--muted))]">
                <th className="px-2 py-2 font-semibold">Tax line</th>
                <th className="px-2 py-2 text-right font-semibold">Rate</th>
                <th className="px-2 py-2 text-right font-semibold">Base</th>
                <th className="px-2 py-2 text-right font-semibold">Cash outflow</th>
                <th className="px-2 py-2 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--border))] text-[hsl(var(--foreground))]">
              {taxWalk.rows.map((row) => (
                <tr key={row.category}>
                  <td className="px-2 py-2 text-[hsl(var(--foreground))]">{row.label}</td>
                  <td className="px-2 py-2 text-right font-mono">{row.ratePct.toFixed(2)}%</td>
                  <td className="px-2 py-2 text-right font-mono text-[hsl(var(--foreground-muted))]">
                    {formatCompactCurrencyFromKrwAtRate(row.baseKrw, displayCurrency, fxRateToKrw)}
                    <div className="text-[9px] text-[hsl(var(--muted))]">{row.baseLabel}</div>
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {formatCompactCurrencyFromKrwAtRate(
                      row.totalCashOutflowKrw,
                      displayCurrency,
                      fxRateToKrw
                    )}
                  </td>
                  <td className="px-2 py-2 text-[10px] text-[hsl(var(--foreground-muted))]">
                    {row.notes}
                  </td>
                </tr>
              ))}
              <tr className="bg-[hsl(var(--surface-hover))]">
                <td className="px-2 py-2 font-semibold text-[hsl(var(--foreground))]" colSpan={3}>
                  Total
                </td>
                <td className="px-2 py-2 text-right font-mono font-semibold text-[hsl(var(--foreground))]">
                  {formatCompactCurrencyFromKrwAtRate(
                    taxWalk.totalCashOutflowKrw,
                    displayCurrency,
                    fxRateToKrw
                  )}
                </td>
                <td className="px-2 py-2 text-[10px] text-[hsl(var(--muted))]">
                  {taxWalk.effectiveDragOnGrossPct !== null
                    ? `≈ ${taxWalk.effectiveDragOnGrossPct.toFixed(1)}% drag on pre-tax gross profit (cumulative NOI + exit gain)`
                    : ''}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {taxWalk.basisCaveat ? (
          <p className="mt-3 rounded-[12px] border border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning-tint))] px-3 py-2 text-[10px] leading-5 text-[hsl(var(--warning))]">
            <span className="font-semibold uppercase tracking-wide text-[hsl(var(--warning))]">
              Basis caveat ·{' '}
            </span>
            {taxWalk.basisCaveat}
          </p>
        ) : null}
      </Card>
    </section>
  );
}
