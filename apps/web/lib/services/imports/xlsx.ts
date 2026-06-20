/**
 * Excel (.xlsx) ingest.
 *
 * Institutional inputs (rent rolls, T-12 operating statements, REB quarterly
 * series, fund models) arrive as .xlsx. This parses an uploaded workbook into
 * plain header+row arrays, and `workbookToCsv` flattens a sheet to a CSV string
 * so existing CSV pipelines (e.g. `parseTimeseriesCsv`) can consume .xlsx with
 * no rewrite.
 *
 * Uses exceljs (same dep as the export side). Reads .xlsx (Office Open XML);
 * legacy binary .xls is not supported — re-save as .xlsx.
 */
import ExcelJS from 'exceljs';

export type ParsedSheet = {
  name: string;
  headers: string[];
  /** Data rows (header row excluded), cells as string|number|null. */
  rows: (string | number | null)[][];
};

export type ParsedWorkbook = {
  sheets: ParsedSheet[];
};

function cellToPrimitive(value: ExcelJS.CellValue): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  // Rich/formula/hyperlink objects: prefer the computed result / text.
  const o = value as { result?: unknown; text?: unknown; richText?: { text: string }[] };
  if (o.result !== undefined && o.result !== null) {
    return typeof o.result === 'number' ? o.result : String(o.result);
  }
  if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join('');
  if (o.text !== undefined) return String(o.text);
  return String(value);
}

/** Parse an .xlsx buffer into per-sheet header + row arrays. */
export async function parseWorkbook(buffer: Buffer | ArrayBuffer): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);
  const sheets: ParsedSheet[] = [];

  wb.eachSheet((ws) => {
    const matrix: (string | number | null)[][] = [];
    let maxCols = 0;
    ws.eachRow({ includeEmpty: false }, (row) => {
      // row.values is 1-indexed (index 0 is undefined); drop the leading hole.
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      const cells = values.map((v) => cellToPrimitive(v as ExcelJS.CellValue));
      maxCols = Math.max(maxCols, cells.length);
      matrix.push(cells);
    });
    if (matrix.length === 0) {
      sheets.push({ name: ws.name, headers: [], rows: [] });
      return;
    }
    // Normalize ragged rows to a rectangle.
    const norm = matrix.map((r) => {
      const padded = r.slice(0, maxCols);
      while (padded.length < maxCols) padded.push(null);
      return padded;
    });
    const [headerRow, ...dataRows] = norm;
    sheets.push({
      name: ws.name,
      headers: headerRow.map((h) => (h === null ? '' : String(h))),
      rows: dataRows
    });
  });

  return { sheets };
}

function csvEscape(cell: string | number | null): string {
  if (cell === null) return '';
  const s = String(cell);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Flatten one sheet of an .xlsx to a CSV string (header + rows). Defaults to the
 * first sheet; pass `sheetName` to pick another. Lets existing CSV parsers
 * accept .xlsx uploads unchanged.
 */
export async function workbookToCsv(
  buffer: Buffer | ArrayBuffer,
  sheetName?: string
): Promise<string> {
  const { sheets } = await parseWorkbook(buffer);
  const sheet = sheetName ? sheets.find((s) => s.name === sheetName) : sheets[0];
  if (!sheet) return '';
  const lines = [sheet.headers.map(csvEscape).join(',')];
  for (const row of sheet.rows) lines.push(row.map(csvEscape).join(','));
  return lines.join('\n');
}
