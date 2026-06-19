import { NextResponse } from 'next/server';
import { validationOrGenericError } from '@/lib/security/error-response';
import { prisma } from '@/lib/db/prisma';
import { createDeal, listDeals } from '@/lib/services/deals';
import {
  getRequestIpAddress,
  resolveVerifiedAdminActorFromHeaders
} from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';

export async function GET() {
  const deals = await listDeals();
  return NextResponse.json(deals);
}

export async function POST(request: Request) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  if (!actor) {
    return NextResponse.json({ error: 'Active operator session required.' }, { status: 401 });
  }
  try {
    const payload = await request.json();
    const deal = await createDeal(payload);
    if (!deal) {
      throw new Error('Failed to create deal (could not allocate a unique deal code).');
    }
    await recordAuditEvent({
      actorIdentifier: actor?.identifier,
      actorRole: actor?.role,
      action: 'deal.create',
      entityType: 'deal',
      entityId: deal.id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      metadata: {
        dealCode: deal.dealCode,
        title: deal.title,
        stage: deal.stage
      }
    });
    return NextResponse.json(deal, { status: 201 });
  } catch (error) {
    await recordAuditEvent({
      actorIdentifier: actor?.identifier,
      actorRole: actor?.role,
      action: 'deal.create',
      entityType: 'deal',
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to create deal'
      }
    });
    return validationOrGenericError(error, { message: 'Failed to create deal.' });
  }
}
