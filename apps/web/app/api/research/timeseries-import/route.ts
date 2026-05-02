import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { withAdminApi } from '@/lib/security/with-admin-api';
import {
  importTimeseriesRows,
  parseTimeseriesCsv
} from '@/lib/services/research/timeseries-import';

const BodySchema = z.object({
  csv: z.string().min(1).max(2_000_000),
  dryRun: z.boolean().default(false)
});

export const POST = withAdminApi({
  requiredRole: 'ANALYST',
  bodySchema: BodySchema,
  auditAction: 'research.timeseries.import',
  auditEntityType: 'MacroSeries',
  async handler({ body }) {
    const parsed = parseTimeseriesCsv(body.csv);
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
