/**
 * POST /api/admin/exports/financials
 *
 * Exports an asset's stored financial statements (optionally one counterparty)
 * as a comparative IS/BS/CF Excel workbook. Real data path: DB → view model →
 * .xlsx. Body: { assetId, counterpartyId?, title? }.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAdminApi } from '@/lib/security/with-admin-api';
import { getAssetFinancialStatements } from '@/lib/services/financial-statements';
import { assetStatementsToWorkbookSpec } from '@/lib/services/financials/statement-view';
import { buildXlsx, xlsxFilename } from '@/lib/services/exports/xlsx';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  assetId: z.string().min(1),
  counterpartyId: z.string().min(1).optional(),
  title: z.string().max(160).optional()
});

export const POST = withAdminApi({
  requiredRole: 'ANALYST',
  bodySchema: BodySchema,
  auditAction: 'admin_exports.financials',
  auditEntityType: 'FinancialStatement',
  async handler({ body }) {
    const all = await getAssetFinancialStatements(body.assetId);
    const rows = body.counterpartyId
      ? all.filter((s) => s.counterpartyId === body.counterpartyId)
      : all;
    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No financial statements for this asset.' },
        { status: 404 }
      );
    }
    // Title: a single-counterparty export names the entity; a multi-entity
    // export (no counterpartyId filter) names the asset, since the workbook now
    // carries one grouped sheet-set per counterparty rather than one mislabeled
    // blended view.
    const distinctCounterparties = new Set(rows.map((s) => s.counterpartyId ?? '__unassigned__'));
    const title =
      body.title ??
      (distinctCounterparties.size === 1
        ? `재무제표 — ${rows[0]?.counterparty?.name ?? body.assetId}`
        : `재무제표 — ${body.assetId}`);
    const buffer = await buildXlsx(assetStatementsToWorkbookSpec(rows, title));
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${xlsxFilename(title)}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'no-store'
      }
    });
  }
});
