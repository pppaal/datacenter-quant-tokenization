import { NextRequest, NextResponse } from 'next/server';
import { removeAsset, updateAsset } from '@/lib/services/assets';
import { ensureSameOrigin, forbidden, requireAdmin } from '@/lib/auth/guard';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin || !ensureSameOrigin(req)) return forbidden();

  try {
    const updated = await updateAsset(params.id, await req.json());
    return NextResponse.json({ item: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin || !ensureSameOrigin(req)) return forbidden();

  await removeAsset(params.id);
  return NextResponse.json({ success: true });
}
