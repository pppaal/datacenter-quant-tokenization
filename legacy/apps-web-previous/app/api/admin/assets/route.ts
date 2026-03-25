import { NextRequest, NextResponse } from 'next/server';
import { createAsset } from '@/lib/services/assets';
import { ensureSameOrigin, forbidden, requireAdmin } from '@/lib/auth/guard';

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin || !ensureSameOrigin(req)) return forbidden();

  const body = await req.json();
  try {
    const asset = await createAsset(body);
    return NextResponse.json({ item: asset }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
