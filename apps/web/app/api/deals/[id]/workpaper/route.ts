import { NextResponse } from 'next/server';
import { AdminAccessScopeType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertActorScopeAccess } from '@/lib/security/admin-access';
import { resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import {
  buildDealDiligenceWorkpaper,
  getDealById,
  serializeDealDiligenceWorkpaperToMarkdown
} from '@/lib/services/deals';

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

  await assertActorScopeAccess(actor, AdminAccessScopeType.DEAL, id, prisma);
  const deal = await getDealById(id, prisma);
  if (!deal) {
    return NextResponse.json({ error: 'Deal not found.' }, { status: 404 });
  }

  const workpaper = buildDealDiligenceWorkpaper(deal);
  const format = new URL(request.url).searchParams.get('format')?.toLowerCase() ?? 'md';

  if (format === 'json') {
    return new Response(JSON.stringify(workpaper, null, 2), {
      status: 200,
      headers: buildHeaders(`${workpaper.exportFileBase}.json`, 'application/json; charset=utf-8')
    });
  }

  return new Response(serializeDealDiligenceWorkpaperToMarkdown(workpaper), {
    status: 200,
    headers: buildHeaders(`${workpaper.exportFileBase}.md`, 'text/markdown; charset=utf-8')
  });
}
