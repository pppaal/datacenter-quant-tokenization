/**
 * POST /api/admin/exports/xlsx
 *
 * Renders a validated workbook spec to a styled .xlsx download (financials,
 * cap tables, IC packets, fund rollups). The OOXML build lives in
 * `lib/services/exports/xlsx.ts`.
 */
import { z } from 'zod';
import { withAdminApi } from '@/lib/security/with-admin-api';
import { buildXlsx, xlsxFilename, type XlsxWorkbookSpec } from '@/lib/services/exports/xlsx';

export const dynamic = 'force-dynamic';

const cellSchema = z.union([z.string().max(500), z.number(), z.null()]);

const columnSchema = z.object({
  header: z.string().min(1).max(80),
  key: z.string().min(1).max(80),
  width: z.number().int().min(4).max(120).optional(),
  type: z.enum(['text', 'number', 'currency', 'percent', 'date']).optional()
});

const sheetSchema = z.object({
  name: z.string().min(1).max(31),
  columns: z.array(columnSchema).min(1).max(40),
  rows: z.array(z.record(z.string(), cellSchema.optional())).max(5000),
  totals: z.record(z.string(), cellSchema.optional()).optional()
});

const workbookSchema = z.object({
  title: z.string().max(160).optional(),
  creator: z.string().max(120).optional(),
  sheets: z.array(sheetSchema).min(1).max(20)
});

export const POST = withAdminApi({
  requiredRole: 'ANALYST',
  bodySchema: workbookSchema,
  auditAction: 'admin_exports.xlsx',
  auditEntityType: 'XlsxWorkbook',
  async handler({ body }) {
    const spec = body as XlsxWorkbookSpec;
    const buffer = await buildXlsx(spec);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${xlsxFilename(spec.title ?? 'export')}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'no-store'
      }
    });
  }
});
