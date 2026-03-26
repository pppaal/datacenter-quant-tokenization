import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatCurrencyFromKrwAtRate, type SupportedCurrency } from '@/lib/finance/currency';
import { formatNumber, formatPercent } from '@/lib/utils';

type SensitivityPoint = {
  id: string;
  variableKey: string;
  variableLabel: string;
  shockLabel: string;
  shockValue: number | null;
  metricName: string;
  metricValue: number;
  deltaPct: number;
  sortOrder: number;
};

type SensitivityRun = {
  id: string;
  runType: string;
  title: string;
  baselineMetricName: string;
  baselineMetricValue: number;
  summary: unknown;
  points: SensitivityPoint[];
};

function groupPoints(points: SensitivityPoint[]) {
  const grouped = new Map<string, SensitivityPoint[]>();
  for (const point of points) {
    const group = grouped.get(point.shockLabel) ?? [];
    group.push(point);
    grouped.set(point.shockLabel, group.sort((left, right) => left.sortOrder - right.sortOrder));
  }
  return [...grouped.entries()];
}

function formatMetric(point: SensitivityPoint, displayCurrency: SupportedCurrency, fxRateToKrw?: number | null) {
  if (point.metricName === 'Value') {
    return formatCurrencyFromKrwAtRate(point.metricValue, displayCurrency, fxRateToKrw);
  }

  if (point.metricName === 'DSCR') {
    return `${formatNumber(point.metricValue, 2)}x`;
  }

  return formatNumber(point.metricValue, 2);
}

function MatrixRun({
  run,
  summary,
  displayCurrency,
  fxRateToKrw
}: {
  run: SensitivityRun;
  summary: {
    strongestDownsideDriver?: string | null;
    strongestDownsideDeltaPct?: number | null;
    rowLabels?: string[];
    columnLabels?: string[];
    rowAxisLabel?: string;
    columnAxisLabel?: string;
  } | null;
  displayCurrency: SupportedCurrency;
  fxRateToKrw?: number | null;
}) {
  const rows = summary?.rowLabels ?? [];
  const columns = summary?.columnLabels ?? [];
  const rowAxisLabel = summary?.rowAxisLabel ?? 'Rows';
  const columnAxisLabel = summary?.columnAxisLabel ?? 'Columns';

  if (rows.length === 0 || columns.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-[720px] gap-2"
        style={{ gridTemplateColumns: `minmax(140px, 1.2fr) repeat(${columns.length}, minmax(140px, 1fr))` }}
      >
        <div className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3 text-xs uppercase tracking-[0.18em] text-slate-500">
          {rowAxisLabel} / {columnAxisLabel}
        </div>
        {columns.map((column) => (
          <div
            key={`${run.id}-column-${column}`}
            className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3 text-center text-xs uppercase tracking-[0.18em] text-slate-400"
          >
            {column}
          </div>
        ))}
        {rows.map((row, rowIndex) => (
          <div key={`${run.id}-row-group-${row}`} className="contents">
            <div
              className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-4 text-sm font-semibold text-white"
            >
              {row}
            </div>
            {columns.map((column, columnIndex) => {
              const point = run.points[rowIndex * columns.length + columnIndex];
              if (!point) return null;

              return (
                <div
                  key={`${run.id}-${row}-${column}`}
                  className="rounded-[18px] border border-white/10 bg-slate-950/40 px-4 py-4 text-sm"
                >
                  <div className={point.deltaPct < 0 ? 'text-rose-300' : 'text-emerald-300'}>
                    {formatPercent(point.deltaPct)}
                  </div>
                  <div className="mt-2 text-white">{formatMetric(point, displayCurrency, fxRateToKrw)}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SensitivityTable({
  runs,
  displayCurrency = 'KRW',
  fxRateToKrw
}: {
  runs: SensitivityRun[];
  displayCurrency?: SupportedCurrency;
  fxRateToKrw?: number | null;
}) {
  if (runs.length === 0) return null;

  return (
    <Card>
      <div className="eyebrow">Sensitivity Lab</div>
      <div className="mt-3 grid gap-6">
        {runs.map((run) => {
          const summary =
            typeof run.summary === 'object' && run.summary !== null
              ? (run.summary as {
                  strongestDownsideDriver?: string | null;
                  strongestDownsideDeltaPct?: number | null;
                  rowLabels?: string[];
                  columnLabels?: string[];
                  rowAxisLabel?: string;
                  columnAxisLabel?: string;
                })
              : null;

          return (
            <div key={run.id} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold text-white">{run.title}</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Baseline {run.baselineMetricName}: {run.baselineMetricName === 'Value'
                      ? formatCurrencyFromKrwAtRate(run.baselineMetricValue, displayCurrency, fxRateToKrw)
                      : formatNumber(run.baselineMetricValue, 2)}
                    {run.baselineMetricName === 'DSCR' ? 'x' : ''}
                  </p>
                </div>
                {summary?.strongestDownsideDriver ? (
                  <Badge tone="warn">
                    {summary.strongestDownsideDriver} {formatPercent(summary.strongestDownsideDeltaPct)}
                  </Badge>
                ) : null}
              </div>

              {run.runType === 'MATRIX' ? (
                <MatrixRun run={run} summary={summary} displayCurrency={displayCurrency} fxRateToKrw={fxRateToKrw} />
              ) : run.runType === 'FORECAST' || run.runType === 'MONTE_CARLO' ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  {groupPoints(run.points).map(([shockLabel, points]) => (
                    <div
                      key={`${run.id}-${shockLabel}`}
                      className="rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-4 text-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-white">{shockLabel}</span>
                        {run.runType === 'MONTE_CARLO' ? (
                          <Badge>{shockLabel}</Badge>
                        ) : (
                          <Badge tone="neutral">forecast</Badge>
                        )}
                      </div>
                      <div className="mt-3 space-y-3">
                        {points.map((point) => (
                          <div key={point.id}>
                            <div className="text-xs uppercase tracking-[0.12em] text-slate-500">{point.variableLabel}</div>
                            <div className="mt-1 flex items-center justify-between gap-3">
                              <div className="text-white">{formatMetric(point, displayCurrency, fxRateToKrw)}</div>
                              <div className={point.deltaPct < 0 ? 'text-rose-300' : 'text-emerald-300'}>
                                {formatPercent(point.deltaPct)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {run.points.map((point) => (
                    <div
                      key={point.id}
                      className="rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-4 text-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-white">
                          {point.variableLabel} {point.shockLabel}
                        </span>
                        <span className={point.deltaPct < 0 ? 'text-rose-300' : 'text-emerald-300'}>
                          {formatPercent(point.deltaPct)}
                        </span>
                      </div>
                      <div className="mt-2 text-slate-400">{point.metricName}</div>
                      <div className="mt-1 text-base text-white">{formatMetric(point, displayCurrency, fxRateToKrw)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
