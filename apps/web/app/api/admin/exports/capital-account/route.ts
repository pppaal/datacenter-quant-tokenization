/**
 * POST /api/admin/exports/capital-account
 *
 * Exports a fund's LP capital-account statement (PCAP) as Excel — same
 * `buildFundPcap` source as the on-screen table. Body: { fundId, title? }.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAdminApi } from '@/lib/security/with-admin-api';
import { buildFundPcap } from '@/lib/services/investor-reports';
import { getFundById } from '@/lib/services/capital';
import { pcapToXlsxSpec } from '@/lib/services/exports/capital-account-xlsx';
import { buildXlsx, xlsxFilename } from '@/lib/services/exports/xlsx';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  fundId: z.string().min(1),
  title: z.string().max(160).optional()
});

export const POST = withAdminApi({
  requiredRole: 'ANALYST',
  bodySchema: BodySchema,
  auditAction: 'admin_exports.capital_account',
  auditEntityType: 'Fund',
  async handler({ body }) {
    const pcap = await buildFundPcap(body.fundId);
    if (pcap.investors.length === 0) {
      return NextResponse.json(
        { error: 'No commitments recorded for this fund.' },
        { status: 404 }
      );
    }
    const fund = await getFundById(body.fundId);
    const title = body.title ?? `${fund?.name ?? body.fundId} — LP 자본계정 명세`;
    const buffer = await buildXlsx(pcapToXlsxSpec(pcap, fund?.name ?? body.fundId));
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
