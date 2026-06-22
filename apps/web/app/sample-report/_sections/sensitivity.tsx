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
        <p className="mt-2 max-w-3xl text-sm text-[hsl(var(--foreground-muted))]">
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
                className="rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-4"
              >
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[hsl(var(--foreground))]">
                      {grid.title}
                    </div>
                    <div className="text-xs text-[hsl(var(--muted))]">
                      Rows: {grid.rowAxisLabel} · Columns: {grid.columnAxisLabel}
                    </div>
                  </div>
                  <div className="text-right text-xs text-[hsl(var(--foreground-muted))]">
                    Base = <span className="font-mono">{fmt(grid.baselineValue)}</span>
                  </div>
                </div>
                <div className="mt-4 overflow-x-auto rounded-[14px] border border-[hsl(var(--border))]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[hsl(var(--surface-hover))] text-left uppercase tracking-wide text-[hsl(var(--muted))]">
                        <th className="px-2 py-1.5 font-semibold">{grid.rowAxisLabel}</th>
                        {grid.columnLabels.map((c) => (
                          <th key={c} className="px-2 py-1.5 text-right font-semibold">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[hsl(var(--border))] text-[hsl(var(--foreground))]">
                      {grid.rowLabels.map((rowLabel, r) => (
                        <tr key={rowLabel}>
                          <td className="px-2 py-1.5 text-[hsl(var(--foreground-muted))]">
                            {rowLabel}
                          </td>
                          {grid.columnLabels.map((colLabel, c) => {
                            const cell = grid.cells[r * grid.columnLabels.length + c];
                            if (!cell) {
                              return (
                                <td
                                  key={colLabel}
                                  className="px-2 py-1.5 text-right text-[hsl(var(--muted))]"
                                >
                                  —
                                </td>
                              );
                            }
                            const sign = cell.deltaPct === 0 ? '' : cell.deltaPct > 0 ? '+' : '';
                            const tone =
                              cell.deltaPct === 0
                                ? 'text-[hsl(var(--foreground))]'
                                : cell.deltaPct > 0
                                  ? 'text-[hsl(var(--success))]'
                                  : 'text-[hsl(var(--danger))]';
                            return (
                              <td key={colLabel} className="px-2 py-1.5 text-right">
                                <div className={`font-mono ${tone}`}>{fmt(cell.value)}</div>
                                <div className="text-[10px] text-[hsl(var(--muted))]">
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
