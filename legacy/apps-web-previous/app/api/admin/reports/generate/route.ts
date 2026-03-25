import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { aiRequestSchema } from '@/lib/validations/asset';
import { generateDealReviewMemo } from '@/lib/ai/openai';
import { ensureSameOrigin, forbidden, requireAdmin } from '@/lib/auth/guard';

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin || !ensureSameOrigin(req)) return forbidden();

  const parsed = aiRequestSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const asset = await prisma.asset.findUnique({ where: { id: parsed.data.assetId } });
  if (!asset) return NextResponse.json({ error: 'asset not found' }, { status: 404 });

  const content = await generateDealReviewMemo(asset);
  const report = await prisma.aiReport.create({
    data: {
      assetId: asset.id,
      reportType: parsed.data.reportType,
      content,
      model: 'gpt-4o-mini',
      createdBy: (admin.user as any).id || null
    }
  });

  return NextResponse.json({ item: report, content }, { status: 201 });
}
