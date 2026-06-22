import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils';
import type { SampleReportData } from './types';

export function PnlSection({ data }: { data: SampleReportData }) {
  const { displayCurrency, proForma } = data;
  if (!(proForma && proForma.years.length > 0)) {
    return null;
  }
  return (
    <section id="im-pnl" className="app-shell py-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="eyebrow">Year-by-year P&L (base case)</div>
            <p className="mt-2 text-sm text-[hsl(var(--foreground-muted))]">
              Operating cash flow per year of the hold — revenue, NOI, debt service, DSCR. Numbers
              in KRW millions; toggle to {displayCurrency} via the cover currency selector.
            </p>
          </div>
          <Badge tone="good">{proForma.years.length} year hold</Badge>
        </div>
        <div className="mt-5 overflow-x-auto rounded-[18px] border border-[hsl(var(--border))]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[hsl(var(--surface-hover))] text-left text-xs uppercase tracking-wide text-[hsl(var(--muted))]">
                <th className="px-3 py-2 font-semibold">Year</th>
                <th className="px-3 py-2 text-right font-semibold">Revenue</th>
                <th className="px-3 py-2 text-right font-semibold">Opex</th>
                <th className="px-3 py-2 text-right font-semibold">NOI</th>
                <th className="px-3 py-2 text-right font-semibold">Debt service</th>
                <th className="px-3 py-2 text-right font-semibold">DSCR</th>
                <th className="px-3 py-2 text-right font-semibold">Distributions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--border))] text-[hsl(var(--foreground))]">
              {proForma.years.map((year) => {
                const toMillions = (n: number) => `₩${formatNumber(n / 1_000_000, 0)}`;
                return (
                  <tr key={year.year}>
                    <td className="px-3 py-2 text-xs text-[hsl(var(--foreground-muted))]">
                      Y{year.year}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {toMillions(year.revenueKrw)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-[hsl(var(--foreground-muted))]">
                      {toMillions(year.operatingExpenseKrw)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-[hsl(var(--foreground))]">
                      {toMillions(year.noiKrw)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-[hsl(var(--foreground-muted))]">
                      {toMillions(year.debtServiceKrw)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {year.dscr !== null ? `${year.dscr.toFixed(2)}x` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {toMillions(year.afterTaxDistributionKrw)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
