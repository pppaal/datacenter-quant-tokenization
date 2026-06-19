import { formatCurrencyFromKrwAtRate } from '@/lib/finance/currency';
import { formatPercent } from '@/lib/utils';
import type { SampleReportData } from './types';

export function HeadlineScenarioStrip({ data }: { data: SampleReportData }) {
  const { baseScenario, bullValue, bearValue, displayCurrency, fxRateToKrw } = data;
  return (
    <section className="app-shell py-4">
      <div className="grid gap-4 md:grid-cols-4">
        {[
          [
            'Bull Case',
            formatCurrencyFromKrwAtRate(bullValue, displayCurrency, fxRateToKrw),
            'upside scenario'
          ],
          [
            'Bear Case',
            formatCurrencyFromKrwAtRate(bearValue, displayCurrency, fxRateToKrw),
            'downside scenario'
          ],
          ['Implied Yield', formatPercent(baseScenario?.impliedYieldPct), 'base scenario'],
          ['Exit Cap Rate', formatPercent(baseScenario?.exitCapRatePct), 'base scenario']
        ].map(([label, value, detail]) => (
          <div key={label} className="metric-card">
            <div className="fine-print">{label}</div>
            <div className="mt-3 text-2xl font-semibold text-white">{value}</div>
            <p className="mt-2 text-sm text-slate-400">{detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
