import { NextResponse } from 'next/server';
import { AdminAccessScopeType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertActorScopeAccess } from '@/lib/security/admin-access';
import { resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import {
  buildInvestorReport,
  serializeInvestorReportToCsv,
  serializeInvestorReportToHtml,
  serializeInvestorReportToMarkdown
} from '@/lib/services/investor-reports';

export const dynamic = 'force-dynamic';

function buildHeaders(fileName: string, contentType: string) {
  return {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${fileName}"`
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  if (!actor) {
    return NextResponse.json({ error: 'Active operator session required.' }, { status: 401 });
  }

  await assertActorScopeAccess(actor, AdminAccessScopeType.FUND, id, prisma);

  let report;
  try {
    report = await buildInvestorReport(id, {}, prisma);
  } catch {
    return NextResponse.json({ error: 'Fund not found.' }, { status: 404 });
  }

  const format = new URL(request.url).searchParams.get('format')?.toLowerCase() ?? 'md';

  if (format === 'json') {
    return new Response(JSON.stringify(report, null, 2), {
      status: 200,
      headers: buildHeaders(`${report.exportFileBase}.json`, 'application/json; charset=utf-8')
    });
  }

  if (format === 'csv') {
    return new Response(serializeInvestorReportToCsv(report), {
      status: 200,
      headers: buildHeaders(`${report.exportFileBase}.csv`, 'text/csv; charset=utf-8')
    });
  }

  if (format === 'html') {
    return new Response(serializeInvestorReportToHtml(report), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="${report.exportFileBase}.html"`
      }
    });
  }

  return new Response(serializeInvestorReportToMarkdown(report), {
    status: 200,
    headers: buildHeaders(`${report.exportFileBase}.md`, 'text/markdown; charset=utf-8')
  });
}
