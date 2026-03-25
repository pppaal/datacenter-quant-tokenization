import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { ensureSameOrigin, forbidden, requireAdmin } from '@/lib/auth/guard';
import { z } from 'zod';
import { estimateAssetValue } from '@/lib/services/valuation';

const schema = z.object({
  assetId: z.string().min(1)
});

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin || !ensureSameOrigin(req)) return forbidden();

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const asset = await prisma.asset.findUnique({ where: { id: parsed.data.assetId } });
  if (!asset) return NextResponse.json({ error: 'asset not found' }, { status: 404 });

  const valuation = await estimateAssetValue(asset);
  const report = await prisma.aiReport.create({
    data: {
      assetId: asset.id,
      reportType: 'asset_valuation',
      content: valuation,
      model: 'nasa+market-variables-v1',
      createdBy: (admin.user as any).id || null
    }
  });

  return NextResponse.json({ item: report, valuation }, { status: 201 });
}
