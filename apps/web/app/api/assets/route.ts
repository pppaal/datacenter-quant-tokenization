import { NextResponse } from 'next/server';
import { createAsset, listAssets } from '@/lib/services/assets';

export async function GET() {
  const assets = await listAssets();
  return NextResponse.json(assets);
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const asset = await createAsset(payload);
    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create asset' },
      { status: 400 }
    );
  }
}
