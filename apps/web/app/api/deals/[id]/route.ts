import { NextResponse } from 'next/server';
import { AdminAccessScopeType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertActorScopeAccess } from '@/lib/security/admin-access';
import { resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { getDealById, updateDeal } from '@/lib/services/deals';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  if (!actor) {
    return NextResponse.json({ error: 'Active operator session required.' }, { status: 401 });
  }
  const { id } = await params;
  try {
    await assertActorScopeAccess(actor, AdminAccessScopeType.DEAL, id, prisma);
  } catch {
    return NextResponse.json({ error: 'Deal access is not granted for this operator.' }, { status: 403 });
  }
  const deal = await getDealById(id);
  if (!deal) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(deal);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
      allowBasic: false,
      requireActiveSeat: true
    });
    if (!actor) {
      return NextResponse.json({ error: 'Active operator session required.' }, { status: 401 });
    }
    await assertActorScopeAccess(actor, AdminAccessScopeType.DEAL, id, prisma);
    const payload = await request.json();
    const deal = await updateDeal(id, payload);
    return NextResponse.json(deal);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update deal' },
      { status: 400 }
    );
  }
}
