import { NextResponse } from 'next/server';
import { AdminAccessScopeType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertActorScopeAccess } from '@/lib/security/admin-access';
import { getRequestIpAddress, resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import { updateInvestorReportRelease } from '@/lib/services/fund-reporting';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  const ipAddress = getRequestIpAddress(request.headers);

  if (!actor) {
    return NextResponse.json({ error: 'Active operator session required.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const report = await prisma.investorReport.findUnique({
      where: { id },
      select: {
        id: true,
        fundId: true,
        investorId: true,
        releaseStatus: true
      }
    });

    if (!report) {
      return NextResponse.json({ error: 'Investor report not found.' }, { status: 404 });
    }

    await assertActorScopeAccess(actor, AdminAccessScopeType.FUND, report.fundId, prisma);
    const payload = await request.json();
    const updatedReport = await updateInvestorReportRelease(
      report.id,
      payload,
      {
        userId: actor.userId,
        identifier: actor.identifier
      },
      prisma
    );

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'fund.investor_report.release',
      entityType: 'InvestorReport',
      entityId: updatedReport.id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      metadata: {
        fundId: updatedReport.fundId,
        releaseStatus: updatedReport.releaseStatus,
        publishedAt: updatedReport.publishedAt?.toISOString() ?? null
      }
    });

    return NextResponse.json(updatedReport);
  } catch (error) {
    const { id } = await params;
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'fund.investor_report.release',
      entityType: 'InvestorReport',
      entityId: id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to update investor report release'
      }
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update investor report release' },
      { status: 400 }
    );
  }
}
