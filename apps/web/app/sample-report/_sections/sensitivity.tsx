import { formatCompactCurrencyFromKrwAtRate } from '@/lib/finance/currency';
import { Card } from '@/components/ui/card';
import type { SampleReportData } from './types';

export function SensitivitySection({ data }: { data: SampleReportData }) {
  const { displayCurrency, fxRateToKrw, sensitivityGrids } = data;
  if (!(sensitivityGrids.length > 0)) {
    return null;
  }
  return (
    <section id="im-sensitivity" className="app-shell py-4">
      <Card>
        <div className="eyebrow">Sensitivity matrices</div>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Two-way shock grids against the base case. Each cell shows the resulting metric and its
          delta versus base — sized for the committee underwriting band rather than a single point
          estimate.
        </p>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {sensitivityGrids.map((grid) => {
            const isCurrency = /value/i.test(grid.metricName);
            const isDscr = /dscr/i.test(grid.metricName);
            const fmt = (v: number) =>
              isCurrency
                ? formatCompactCurrencyFromKrwAtRate(v, displayCurrency, fxRateToKrw)
                : isDscr
                  ? `${v.toFixed(2)}x`
                  : v.toFixed(2);
            return (
              <div
                key={grid.runId}
                className="rounded-[18px] border border-white/10 bg-white/[0.02] p-4"
              >
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{grid.title}</div>
                    <div className="text-xs text-slate-500">
                      Rows: {grid.rowAxisLabel} · Columns: {grid.columnAxisLabel}
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    Base = <span className="font-mono">{fmt(grid.baselineValue)}</span>
                  </div>
                </div>
                <div className="mt-4 overflow-x-auto rounded-[14px] border border-white/10">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                        <th className="px-2 py-1.5 font-semibold">{grid.rowAxisLabel}</th>
                        {grid.columnLabels.map((c) => (
                          <th key={c} className="px-2 py-1.5 text-right font-semibold">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-200">
                      {grid.rowLabels.map((rowLabel, r) => (
                        <tr key={rowLabel}>
                          <td className="px-2 py-1.5 text-slate-400">{rowLabel}</td>
                          {grid.columnLabels.map((colLabel, c) => {
                            const cell = grid.cells[r * grid.columnLabels.length + c];
                            if (!cell) {
                              return (
                                <td
                                  key={colLabel}
                                  className="px-2 py-1.5 text-right text-slate-600"
                                >
                                  —
                                </td>
                              );
                            }
                            const sign = cell.deltaPct === 0 ? '' : cell.deltaPct > 0 ? '+' : '';
                            const tone =
                              cell.deltaPct === 0
                                ? 'text-white'
                                : cell.deltaPct > 0
                                  ? 'text-emerald-300'
                                  : 'text-rose-300';
                            return (
                              <td key={colLabel} className="px-2 py-1.5 text-right">
                                <div className={`font-mono ${tone}`}>{fmt(cell.value)}</div>
                                <div className="text-[10px] text-slate-500">
                                  {sign}
                                  {cell.deltaPct.toFixed(1)}%
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </section>
  );
}
