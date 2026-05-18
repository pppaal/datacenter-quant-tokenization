/**
 * Build a 2D sensitivity grid from SensitivityRun.points.
 *
 * The engine writes MATRIX-type sensitivity runs as nine
 * SensitivityPoint rows with shockLabel "<rowLabel> / <colLabel>".
 * The IM shows the grid as a real table — row × column with
 * value + deltaPct in each cell.
 */
type SensitivityPointLike = {
  variableKey: string;
  variableLabel: string;
  shockLabel: string;
  metricName: string;
  metricValue: number;
  deltaPct: number;
};

type SensitivityRunLike = {
  id: string;
  runType: string;
  title: string;
  baselineMetricName: string;
  baselineMetricValue: number;
  summary: unknown;
  points: SensitivityPointLike[];
};

export type SensitivityGrid = {
  runId: string;
  title: string;
  metricName: string;
  baselineValue: number;
  rowAxisLabel: string;
  columnAxisLabel: string;
  rowLabels: string[];
  columnLabels: string[];
  /** rowLabels.length × columnLabels.length cells (row-major). */
  cells: Array<{ value: number; deltaPct: number; shockLabel: string } | null>;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

export function buildSensitivityGrid(run: SensitivityRunLike): SensitivityGrid | null {
  const summary = asRecord(run.summary);
  const rowLabels = asStringArray(summary?.rowLabels);
  const columnLabels = asStringArray(summary?.columnLabels);
  if (rowLabels.length === 0 || columnLabels.length === 0) return null;

  const rowAxisLabel = typeof summary?.rowAxisLabel === 'string' ? summary.rowAxisLabel : '';
  const columnAxisLabel =
    typeof summary?.columnAxisLabel === 'string' ? summary.columnAxisLabel : '';

  const cells: SensitivityGrid['cells'] = Array(rowLabels.length * columnLabels.length).fill(
    null
  );
  for (const point of run.points) {
    // shockLabel is "<rowLabel> / <columnLabel>"
    const slash = point.shockLabel.indexOf(' / ');
    if (slash <= 0) continue;
    const rowLabel = point.shockLabel.slice(0, slash).trim();
    const colLabel = point.shockLabel.slice(slash + 3).trim();
    const r = rowLabels.indexOf(rowLabel);
    const c = columnLabels.indexOf(colLabel);
    if (r < 0 || c < 0) continue;
    cells[r * columnLabels.length + c] = {
      value: point.metricValue,
      deltaPct: point.deltaPct,
      shockLabel: point.shockLabel
    };
  }

  return {
    runId: run.id,
    title: run.title,
    metricName: run.baselineMetricName,
    baselineValue: run.baselineMetricValue,
    rowAxisLabel,
    columnAxisLabel,
    rowLabels,
    columnLabels,
    cells
  };
}

export function pickMatrixRuns(runs: SensitivityRunLike[]): SensitivityGrid[] {
  const grids: SensitivityGrid[] = [];
  for (const run of runs) {
    if (run.runType !== 'MATRIX') continue;
    const grid = buildSensitivityGrid(run);
    if (grid) grids.push(grid);
  }
  return grids;
}
