import { formatCurrencyFromKrwAtRate } from '@/lib/finance/currency';
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
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
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
        <div className="mt-5 overflow-x-auto rounded-[14px] border border-white/10">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2 font-semibold">Category</th>
                <th className="px-2 py-2 font-semibold">Label</th>
                <th className="px-2 py-2 text-right font-semibold">Year</th>
                <th className="px-2 py-2 text-right font-semibold">Embedded</th>
                <th className="px-2 py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-200">
              {asset.capexLineItems.map((item) => (
                <tr key={item.id}>
                  <td className="px-2 py-2 text-[10px] uppercase tracking-wide text-slate-400">
                    {item.category.replace(/_/g, ' ').toLowerCase()}
                  </td>
                  <td className="px-2 py-2 text-slate-200">{item.label}</td>
                  <td className="px-2 py-2 text-right font-mono text-slate-400">
                    Y{item.spendYear}
                  </td>
                  <td className="px-2 py-2 text-right text-[10px]">
                    {item.isEmbedded ? (
                      <span className="text-amber-300">in price</span>
                    ) : (
                      <span className="text-slate-500">additional</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {formatCurrencyFromKrwAtRate(item.amountKrw, displayCurrency, fxRateToKrw)}
                  </td>
                </tr>
              ))}
              <tr className="bg-white/[0.03] font-semibold">
                <td className="px-2 py-2 text-white" colSpan={4}>
                  Total
                </td>
                <td className="px-2 py-2 text-right font-mono text-white">
                  {formatCurrencyFromKrwAtRate(
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
