/**
 * Branded Excel (.xlsx) workbook builder.
 *
 * Institutional outputs (financials, cap tables, IC packets, fund rollups)
 * must leave the platform as styled .xlsx — not PDF — so LPs/IC can pivot the
 * numbers. This is the export side; `lib/services/imports/xlsx.ts` is ingest.
 *
 * Typed columns drive Excel number formats (currency / percent / number /
 * date) so figures arrive as real numbers, not strings. Header styling mirrors
 * the globals.css brand palette (see lib/services/exports/im-pptx.ts), keeping
 * decks, PDFs, and workbooks visually consistent.
 */
import ExcelJS from 'exceljs';

const BRAND = {
  accentArgb: 'FF0A74AE', // --accent (ARGB; exceljs wants AA RR GG BB)
  headerText: 'FFFFFFFF',
  zebraArgb: 'FFF6F7F9', // --panel-alt
  inkArgb: 'FF151B28'
} as const;

export type XlsxColumnType = 'text' | 'number' | 'currency' | 'percent' | 'date';

export type XlsxColumn = {
  header: string;
  /** Key into each row object. */
  key: string;
  width?: number;
  type?: XlsxColumnType;
};

export type XlsxRow = Record<string, string | number | null | undefined>;

export type XlsxSheet = {
  name: string;
  columns: XlsxColumn[];
  rows: XlsxRow[];
  /** Optional totals row appended in bold (keyed like a normal row). */
  totals?: XlsxRow;
};

export type XlsxWorkbookSpec = {
  sheets: XlsxSheet[];
  /** Workbook metadata. */
  title?: string;
  creator?: string;
};

function numFmt(type: XlsxColumnType | undefined): string | undefined {
  switch (type) {
    case 'currency':
      return '#,##0';
    case 'percent':
      return '0.0%';
    case 'number':
      return '#,##0.00';
    case 'date':
      return 'yyyy-mm-dd';
    default:
      return undefined;
  }
}

function applyHeaderStyle(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: BRAND.headerText }, name: 'Malgun Gothic' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.accentArgb } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });
}

/** Build a styled multi-sheet .xlsx as a Node Buffer. */
export async function buildXlsx(spec: XlsxWorkbookSpec): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = spec.creator ?? 'Investment Firm OS';
  if (spec.title) wb.title = spec.title;
  wb.created = new Date();

  for (const sheet of spec.sheets.length > 0
    ? spec.sheets
    : [{ name: 'Sheet1', columns: [], rows: [] }]) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31) || 'Sheet', {
      views: [{ state: 'frozen', ySplit: 1 }]
    });
    ws.columns = sheet.columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width ?? Math.max(12, col.header.length + 2),
      style: { numFmt: numFmt(col.type), font: { name: 'Malgun Gothic' } }
    }));
    applyHeaderStyle(ws.getRow(1));

    sheet.rows.forEach((row, i) => {
      const added = ws.addRow(row);
      if (i % 2 === 1) {
        added.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.zebraArgb } };
        });
      }
    });

    if (sheet.totals) {
      const totalRow = ws.addRow(sheet.totals);
      totalRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: BRAND.inkArgb }, name: 'Malgun Gothic' };
        cell.border = { top: { style: 'thin', color: { argb: 'FFDDE2E9' } } };
      });
    }
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}

/** Filename-safe slug for a downloaded workbook. */
export function xlsxFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'export'}.xlsx`;
}
