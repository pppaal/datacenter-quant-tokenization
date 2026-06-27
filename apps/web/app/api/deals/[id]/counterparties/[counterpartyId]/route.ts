import { NextResponse } from 'next/server';
import { validationOrGenericError } from '@/lib/security/error-response';
import { AdminAccessScopeType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertActorScopeAccess } from '@/lib/security/admin-access';
import { resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { updateDealCounterparty } from '@/lib/services/deals';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; counterpartyId: string }> }
) {
  try {
    const { id, counterpartyId } = await params;
    const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
      allowBasic: false,
      requireActiveSeat: true
    });
    if (!actor) {
      return NextResponse.json({ error: 'Active operator session required.' }, { status: 401 });
    }
    await assertActorScopeAccess(actor, AdminAccessScopeType.DEAL, id, prisma, 'mutation');
    const payload = await request.json();
    const counterparty = await updateDealCounterparty(id, counterpartyId, payload);
    return NextResponse.json(counterparty);
  } catch (error) {
    return validationOrGenericError(error, { message: 'Failed to update counterparty.' });
  }
}
