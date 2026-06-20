/**
 * POST /api/admin/exports/fund-report
 *
 * Exports a fund's operating report (요약 + 캐피탈콜 + 분배) as Excel, from the
 * same buildCommitmentMath figures + call/distribution rows the fund page shows.
 * Body: { fundId, title? }.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAdminApi } from '@/lib/security/with-admin-api';
import { buildCommitmentMath, getFundById } from '@/lib/services/capital';
import { fundReportToXlsxSpec } from '@/lib/services/exports/fund-report-xlsx';
import { buildXlsx, xlsxFilename } from '@/lib/services/exports/xlsx';
import { toNumber } from '@/lib/math';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({ fundId: z.string().min(1), title: z.string().max(160).optional() });

function ymd(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export const POST = withAdminApi({
  requiredRole: 'ANALYST',
  bodySchema: BodySchema,
  auditAction: 'admin_exports.fund_report',
  auditEntityType: 'Fund',
  async handler({ body }) {
    const fund = await getFundById(body.fundId);
    if (!fund) {
      return NextResponse.json({ error: 'Fund not found.' }, { status: 404 });
    }
    const math = buildCommitmentMath(fund);
    const spec = fundReportToXlsxSpec({
      fundName: fund.name,
      commitmentKrw: math.totalCommitmentKrw,
      calledKrw: math.totalCalledKrw,
      distributedKrw: math.totalDistributedKrw,
      unfundedKrw: math.unfundedCommitmentKrw,
      netInvestedKrw: math.netInvestedKrw,
      navKrw: math.navKrw,
      dryPowderKrw: math.dryPowderKrw,
      targetSizeKrw: math.targetSizeKrw,
      pendingCallsKrw: math.pendingCallsKrw,
      pendingDistributionsKrw: math.pendingDistributionsKrw,
      calls: fund.capitalCalls.map((c) => ({
        date: ymd(c.callDate),
        dueDate: ymd(c.dueDate),
        amountKrw: toNumber(c.amountKrw),
        purpose: c.purpose ?? '',
        status: String(c.status)
      })),
      distributions: fund.distributions.map((d) => ({
        date: ymd(d.distributionDate),
        amountKrw: toNumber(d.amountKrw),
        purpose: d.purpose ?? '',
        status: String(d.status)
      }))
    });
    const title = body.title ?? `${fund.name} — 펀드 운용보고`;
    const buffer = await buildXlsx(spec);
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
