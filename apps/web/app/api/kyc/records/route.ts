import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';

export async function GET(request: Request) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  if (!actor) {
    return NextResponse.json({ error: 'Active operator session required.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const provider = url.searchParams.get('provider');
  const wallet = url.searchParams.get('wallet');

  const records = await prisma.kycRecord.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(provider ? { provider } : {}),
      ...(wallet ? { wallet: wallet.toLowerCase() } : {})
    },
    orderBy: { createdAt: 'desc' },
    take: 200
  });
  return NextResponse.json({ records });
}
