import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { withAdminApi } from '@/lib/security/with-admin-api';
import {
  importTimeseriesRows,
  parseTimeseriesCsv
} from '@/lib/services/research/timeseries-import';
import { workbookToCsv } from '@/lib/services/imports/xlsx';

// Accept either pasted CSV or an uploaded .xlsx (base64) — the latter is
// flattened to CSV via `workbookToCsv` and run through the same parser, so an
// operator can import a REB quarterly Excel report directly. At least one of
// `csv` / `xlsxBase64` must be present.
const BodySchema = z
  .object({
    csv: z.string().min(1).max(2_000_000).optional(),
    xlsxBase64: z.string().min(1).max(15_000_000).optional(),
    sheetName: z.string().max(80).optional(),
    dryRun: z.boolean().default(false)
  })
  .refine((b) => Boolean(b.csv) || Boolean(b.xlsxBase64), {
    message: 'Provide csv or xlsxBase64.'
  });

export const POST = withAdminApi({
  requiredRole: 'ANALYST',
  bodySchema: BodySchema,
  auditAction: 'research.timeseries.import',
  auditEntityType: 'MacroSeries',
  async handler({ body }) {
    let csv = body.csv ?? '';
    if (body.xlsxBase64) {
      try {
        csv = await workbookToCsv(Buffer.from(body.xlsxBase64, 'base64'), body.sheetName);
      } catch {
        return NextResponse.json({ error: 'Could not read the .xlsx workbook.' }, { status: 400 });
      }
    }
    const parsed = parseTimeseriesCsv(csv);
    if (parsed.errors.length > 0 && parsed.rows.length === 0) {
      return NextResponse.json(
        {
          error: 'No valid rows; first errors below.',
          errors: parsed.errors.slice(0, 10)
        },
        { status: 400 }
      );
    }
    if (body.dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        rowCount: parsed.rows.length,
        errors: parsed.errors.slice(0, 50)
      });
    }
    const summary = await importTimeseriesRows(parsed.rows, prisma);
    return NextResponse.json({
      ok: true,
      summary,
      errors: parsed.errors.slice(0, 50)
    });
  }
});
