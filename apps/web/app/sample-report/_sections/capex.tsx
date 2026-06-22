import { formatCompactCurrencyFromKrwAtRate } from '@/lib/finance/currency';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { SampleReportData } from './types';

export function CapexSection({ data }: { data: SampleReportData }) {
  const { asset, displayCurrency, fxRateToKrw } = data;
  if (!(asset.capexLineItems && asset.capexLineItems.length > 0)) {
    return null;
  }
  return (
    <section id="im-capex" className="app-shell py-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="eyebrow">Capex schedule (line items)</div>
            <p className="mt-2 max-w-3xl text-sm text-[hsl(var(--foreground-muted))]">
              Capex schedule by trade package and spend year. Sources &amp; Uses above carries the
              category aggregates; this view splits the underlying budget lines, with
              embedded-in-price vs incremental capex flagged on each row.
            </p>
          </div>
          <Badge>
            {asset.capexLineItems.length} line item
            {asset.capexLineItems.length === 1 ? '' : 's'}
          </Badge>
        </div>
        <div className="mt-5 overflow-x-auto rounded-[14px] border border-[hsl(var(--border))]">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[hsl(var(--surface-hover))] text-left uppercase tracking-wide text-[hsl(var(--muted))]">
                <th className="px-2 py-2 font-semibold">Category</th>
                <th className="px-2 py-2 font-semibold">Label</th>
                <th className="px-2 py-2 text-right font-semibold">Year</th>
                <th className="px-2 py-2 text-right font-semibold">Embedded</th>
                <th className="px-2 py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--border))] text-[hsl(var(--foreground))]">
              {asset.capexLineItems.map((item) => (
                <tr key={item.id}>
                  <td className="px-2 py-2 text-[10px] uppercase tracking-wide text-[hsl(var(--foreground-muted))]">
                    {item.category.replace(/_/g, ' ').toLowerCase()}
                  </td>
                  <td className="px-2 py-2 text-[hsl(var(--foreground))]">{item.label}</td>
                  <td className="px-2 py-2 text-right font-mono text-[hsl(var(--foreground-muted))]">
                    Y{item.spendYear}
                  </td>
                  <td className="px-2 py-2 text-right text-[10px]">
                    {item.isEmbedded ? (
                      <span className="text-[hsl(var(--warning))]">in price</span>
                    ) : (
                      <span className="text-[hsl(var(--muted))]">additional</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {formatCompactCurrencyFromKrwAtRate(
                      item.amountKrw,
                      displayCurrency,
                      fxRateToKrw
                    )}
                  </td>
                </tr>
              ))}
              <tr className="bg-[hsl(var(--surface-hover))] font-semibold">
                <td className="px-2 py-2 text-[hsl(var(--foreground))]" colSpan={4}>
                  Total
                </td>
                <td className="px-2 py-2 text-right font-mono text-[hsl(var(--foreground))]">
                  {formatCompactCurrencyFromKrwAtRate(
                    asset.capexLineItems.reduce((sum, i) => sum + i.amountKrw, 0),
                    displayCurrency,
                    fxRateToKrw
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
