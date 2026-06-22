import { formatCompactCurrencyFromKrwAtRate } from '@/lib/finance/currency';
import { Card } from '@/components/ui/card';
import type { SampleReportData } from './types';

export function ScenarioSection({ data }: { data: SampleReportData }) {
  const { displayCurrency, fxRateToKrw, scenarioDiff } = data;
  if (!(scenarioDiff.length > 0)) {
    return null;
  }
  return (
    <section id="im-scenario" className="app-shell py-4">
      <Card>
        <div className="eyebrow">Scenario diff (vs base case)</div>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Bull and bear cases reflect specific levers relative to base. Columns show the delta in
          implied yield, exit cap, and DSCR for each scenario versus the base case.
        </p>
        <div className="mt-5 overflow-x-auto rounded-[18px] border border-[hsl(var(--border))]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[hsl(var(--surface-hover))] text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-semibold">Case</th>
                <th className="px-3 py-2 text-right font-semibold">Value</th>
                <th className="px-3 py-2 text-right font-semibold">Δ value</th>
                <th className="px-3 py-2 text-right font-semibold">Implied yield</th>
                <th className="px-3 py-2 text-right font-semibold">Δ yield</th>
                <th className="px-3 py-2 text-right font-semibold">Exit cap</th>
                <th className="px-3 py-2 text-right font-semibold">Δ exit cap</th>
                <th className="px-3 py-2 text-right font-semibold">DSCR</th>
                <th className="px-3 py-2 text-right font-semibold">Δ DSCR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--border))] text-slate-200">
              {scenarioDiff.map((row) => {
                const isBase = row.name === 'Base';
                const fmtBps = (v: number | null) =>
                  v === null ? '—' : `${v >= 0 ? '+' : ''}${v} bps`;
                return (
                  <tr key={row.name} className={isBase ? 'bg-[hsl(var(--surface-hover))]' : ''}>
                    <td className="px-3 py-2 font-semibold text-white">{row.name}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {formatCompactCurrencyFromKrwAtRate(
                        row.valuationKrw,
                        displayCurrency,
                        fxRateToKrw
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">
                      {isBase
                        ? '—'
                        : `${row.valueDeltaPct >= 0 ? '+' : ''}${row.valueDeltaPct.toFixed(1)}%`}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {row.impliedYieldPct !== null ? `${row.impliedYieldPct.toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">
                      {isBase ? '—' : fmtBps(row.impliedYieldDeltaBps)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {row.exitCapRatePct !== null ? `${row.exitCapRatePct.toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">
                      {isBase ? '—' : fmtBps(row.exitCapDeltaBps)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {row.debtServiceCoverage !== null
                        ? `${row.debtServiceCoverage.toFixed(2)}x`
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">
                      {isBase
                        ? '—'
                        : row.dscrDelta !== null
                          ? `${row.dscrDelta >= 0 ? '+' : ''}${row.dscrDelta.toFixed(2)}x`
                          : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-3 text-xs text-slate-400 md:grid-cols-3">
          {scenarioDiff.map((row) => (
            <div
              key={`${row.name}-note`}
              className="rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-3 py-2"
            >
              <div className="text-[10px] uppercase tracking-wide text-slate-500">
                {row.name} narrative
              </div>
              <p className="mt-1 leading-5 text-slate-300">{row.notes || '—'}</p>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}
